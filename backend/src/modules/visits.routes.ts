import { Router } from 'express';
import { z } from 'zod';
import type { Prisma, Visit, VisitStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { notify } from '../lib/notify';
import { authenticate, currentUser, type AuthUser } from '../middleware/auth';
import { param, parseQuery, validateBody } from '../middleware/validate';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors';
import { publicUserSelect } from '../utils/serialize';
import { assertNotBlocked, assertNotFrozen, isStaff } from './lands.shared';

/**
 * Land visits. A client asks to visit a published land (optionally with a preferred date);
 * the owner confirms it with the date and practical details (meeting point, contact), or
 * declines. Either side can call it off. The owner can confirm again to reschedule.
 */
const router = Router();
router.use(authenticate);

const ACTIVE: VisitStatus[] = ['REQUESTED', 'CONFIRMED'];
// A confirmed visit stays "upcoming" for a few hours after its start time.
const GRACE_MS = 6 * 60 * 60 * 1000;

const visitInclude = {
  land: {
    select: {
      id: true,
      reference: true,
      title: true,
      address: true,
      city: true,
      country: true,
      status: true,
      ownerId: true,
      owner: { select: publicUserSelect },
      images: { orderBy: { position: 'asc' as const }, take: 1 },
    },
  },
  visitor: { select: publicUserSelect },
} satisfies Prisma.VisitInclude;

type VisitWithLand = Visit & { land: { ownerId: string; title: string; id: string } };

async function loadVisit(id: string) {
  const visit = await prisma.visit.findUnique({ where: { id }, include: visitInclude });
  if (!visit) throw notFound('VISIT_NOT_FOUND', 'Visit not found');
  return visit;
}

function assertOwner(v: VisitWithLand, user: AuthUser) {
  if (v.land.ownerId !== user.id) throw forbidden('NOT_LAND_OWNER', 'Only the owner can answer a visit request');
}

function assertActive(v: Visit) {
  if (!ACTIVE.includes(v.status)) throw badRequest('VISIT_CLOSED', 'This visit is already closed');
}

const futureDate = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s))
  .refine((d) => d.getTime() > Date.now(), { message: 'Must be in the future' });

// ---------------------------------------------------------------------------
// Visitor
// ---------------------------------------------------------------------------

const requestSchema = z.object({
  landId: z.string().uuid(),
  preferredAt: futureDate.optional(),
  message: z.string().trim().max(1000).optional(),
});

router.post('/', validateBody(requestSchema), async (req, res) => {
  const me = currentUser(req);
  const { landId, preferredAt, message } = req.body as z.infer<typeof requestSchema>;
  const land = await prisma.land.findUnique({ where: { id: landId } });
  if (!land) throw notFound('LAND_NOT_FOUND', 'Land not found');
  if (land.ownerId === me.id) throw badRequest('OWN_LAND', 'You cannot visit your own land');
  assertNotBlocked(land);
  assertNotFrozen(land);
  if (land.status !== 'PUBLISHED') throw badRequest('LAND_NOT_AVAILABLE', 'This land is not available for visits');
  const existing = await prisma.visit.findFirst({ where: { landId, visitorId: me.id, status: { in: ACTIVE } } });
  if (existing) throw conflict('VISIT_ALREADY_REQUESTED', 'You already have a visit request for this land');

  const visit = await prisma.$transaction(async (tx) => {
    const visit = await tx.visit.create({ data: { landId, visitorId: me.id, preferredAt, message: message || null }, include: visitInclude });
    await notify(land.ownerId, 'VISIT_REQUESTED', { landId, title: land.title, visitId: visit.id, from: visit.visitor.firstName }, tx);
    return visit;
  });
  res.status(201).json({ visit });
});

const cancelSchema = z.object({ reason: z.string().trim().max(500).optional() });

router.post('/:id/cancel', validateBody(cancelSchema), async (req, res) => {
  const me = currentUser(req);
  const visit = await loadVisit(param(req, 'id'));
  if (visit.visitorId !== me.id) throw forbidden();
  assertActive(visit);
  const { reason } = req.body as z.infer<typeof cancelSchema>;
  const updated = await prisma.$transaction(async (tx) => {
    const updated = await tx.visit.update({
      where: { id: visit.id },
      data: { status: 'CANCELLED', closeReason: reason || null },
      include: visitInclude,
    });
    await notify(visit.land.ownerId, 'VISIT_CANCELLED', { landId: visit.landId, title: visit.land.title, visitId: visit.id }, tx);
    return updated;
  });
  res.json({ visit: updated });
});

// ---------------------------------------------------------------------------
// Lists & detail
// ---------------------------------------------------------------------------

const listQuery = z.object({
  as: z.enum(['visitor', 'owner']).default('visitor'),
  view: z.enum(['active', 'closed']).default('active'),
});

router.get('/', async (req, res) => {
  const me = currentUser(req);
  const { as, view } = parseQuery(listQuery, req);
  const since = new Date(Date.now() - GRACE_MS);
  const party: Prisma.VisitWhereInput = as === 'visitor' ? { visitorId: me.id } : { land: { ownerId: me.id } };
  const active: Prisma.VisitWhereInput = {
    OR: [{ status: 'REQUESTED' }, { status: 'CONFIRMED', scheduledAt: { gte: since } }],
  };
  const items = await prisma.visit.findMany({
    where: { AND: [party, view === 'active' ? active : { NOT: active }] },
    include: visitInclude,
    // Active: soonest first (requests without a date first). Closed: most recent first.
    orderBy: view === 'active' ? [{ scheduledAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }] : { updatedAt: 'desc' },
    take: 100,
  });
  res.json({ items });
});

router.get('/:id', async (req, res) => {
  const me = currentUser(req);
  const visit = await loadVisit(param(req, 'id'));
  if (visit.visitorId !== me.id && visit.land.ownerId !== me.id && !isStaff(me)) throw forbidden();
  res.json({ visit });
});

// ---------------------------------------------------------------------------
// Owner
// ---------------------------------------------------------------------------

const confirmSchema = z.object({
  scheduledAt: futureDate,
  note: z.string().trim().max(1000).optional(),
});

/** Confirms the visit with a date, or moves an already confirmed visit to a new date. */
router.post('/:id/confirm', validateBody(confirmSchema), async (req, res) => {
  const me = currentUser(req);
  const visit = await loadVisit(param(req, 'id'));
  assertOwner(visit, me);
  assertActive(visit);
  const land = await prisma.land.findUniqueOrThrow({ where: { id: visit.landId } });
  assertNotBlocked(land);
  assertNotFrozen(land);
  const { scheduledAt, note } = req.body as z.infer<typeof confirmSchema>;
  const updated = await prisma.$transaction(async (tx) => {
    const updated = await tx.visit.update({
      where: { id: visit.id },
      data: { status: 'CONFIRMED', scheduledAt, ownerNote: note || null },
      include: visitInclude,
    });
    await notify(
      visit.visitorId,
      'VISIT_CONFIRMED',
      { landId: visit.landId, title: visit.land.title, visitId: visit.id, scheduledAt: scheduledAt.toISOString(), rescheduled: visit.status === 'CONFIRMED' },
      tx,
    );
    return updated;
  });
  res.json({ visit: updated });
});

router.post('/:id/decline', validateBody(cancelSchema), async (req, res) => {
  const me = currentUser(req);
  const visit = await loadVisit(param(req, 'id'));
  assertOwner(visit, me);
  assertActive(visit);
  const { reason } = req.body as z.infer<typeof cancelSchema>;
  const updated = await prisma.$transaction(async (tx) => {
    const updated = await tx.visit.update({
      where: { id: visit.id },
      data: { status: 'DECLINED', closeReason: reason || null },
      include: visitInclude,
    });
    await notify(visit.visitorId, 'VISIT_DECLINED', { landId: visit.landId, title: visit.land.title, visitId: visit.id }, tx);
    return updated;
  });
  res.json({ visit: updated });
});

export default router;
