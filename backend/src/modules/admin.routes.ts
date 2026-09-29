import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { audit } from '../lib/audit';
import { notify } from '../lib/notify';
import { authenticate, currentUser, requireRole } from '../middleware/auth';
import { param, parseQuery, validateBody } from '../middleware/validate';
import { badRequest, conflict, notFound } from '../utils/errors';
import { walletAddressFor } from '../utils/crypto';
import { pageResult, paginate, paginationSchema } from '../utils/pagination';
import { privateUserSelect, publicUserSelect } from '../utils/serialize';
import { landCardInclude } from './lands.shared';
import { transferInclude } from './transfers.shared';

/** Platform oversight: users & roles, seller applications, listings, transfers, reports, audit trail. */
const router = Router();
router.use(authenticate, requireRole('ADMIN'));

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

router.get('/stats', async (_req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [usersByRole, landsByStatus, transfersByStatus, volume, openReports, blocks, newUsers, recentActivity] =
    await Promise.all([
      prisma.user.groupBy({ by: ['role'], _count: true }),
      prisma.land.groupBy({ by: ['status'], _count: true }),
      prisma.transfer.groupBy({ by: ['status'], _count: true }),
      prisma.transfer.groupBy({ by: ['currency'], where: { status: 'COMPLETED' }, _sum: { price: true } }),
      prisma.report.count({ where: { status: 'OPEN' } }),
      prisma.block.count(),
      prisma.user.count({ where: { createdAt: { gte: since } } }),
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: { actor: { select: { id: true, firstName: true, lastName: true, role: true } } },
      }),
    ]);
  const toMap = <T extends { _count: number }>(rows: T[], key: keyof T) =>
    Object.fromEntries(rows.map((r) => [String(r[key]), r._count]));
  res.json({
    usersByRole: toMap(usersByRole, 'role'),
    landsByStatus: toMap(landsByStatus, 'status'),
    transfersByStatus: toMap(transfersByStatus, 'status'),
    salesVolume: volume.map((v) => ({ currency: v.currency, total: v._sum.price?.toString() ?? '0' })),
    openReports,
    blocks,
    newUsersLast30Days: newUsers,
    recentActivity,
  });
});

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

const roles = ['CLIENT', 'NOTARY', 'ADMIN'] as const;

const usersQuery = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  role: z.enum(roles).optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

router.get('/users', async (req, res) => {
  const f = parseQuery(usersQuery, req);
  const where: Prisma.UserWhereInput = {
    role: f.role,
    isActive: f.status ? f.status === 'active' : undefined,
    OR: f.q
      ? [
          { email: { contains: f.q, mode: 'insensitive' } },
          { firstName: { contains: f.q, mode: 'insensitive' } },
          { lastName: { contains: f.q, mode: 'insensitive' } },
          { walletAddress: { equals: f.q.toLowerCase() } },
        ]
      : undefined,
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: { ...privateUserSelect, _count: { select: { ownedLands: true, offersMade: true } } },
      orderBy: { createdAt: 'desc' },
      ...paginate(f.page, f.pageSize),
    }),
    prisma.user.count({ where }),
  ]);
  res.json(pageResult(items, total, f.page, f.pageSize));
});

router.get('/users/:id', async (req, res) => {
  const id = param(req, 'id');
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...privateUserSelect,
      _count: { select: { ownedLands: true, offersMade: true, transfersAsSeller: true, transfersAsBuyer: true, reports: true } },
    },
  });
  if (!user) throw notFound('USER_NOT_FOUND', 'User not found');
  const auditTrail = await prisma.auditLog.findMany({
    where: { OR: [{ actorId: id }, { entityId: id }] },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  res.json({ user, auditTrail });
});

const createUserSchema = z
  .object({
    email: z.string().email().toLowerCase().trim(),
    password: z.string().min(8).max(128),
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    phone: z.string().trim().max(30).optional(),
    role: z.enum(roles),
    licenseNumber: z.string().trim().max(60).optional(),
  })
  .refine((v) => v.role !== 'NOTARY' || Boolean(v.licenseNumber), {
    message: 'Notaries need a licence number',
    path: ['licenseNumber'],
  });

/** Admins onboard notaries (and other admins) directly. */
router.post('/users', validateBody(createUserSchema), async (req, res) => {
  const body = req.body as z.infer<typeof createUserSchema>;
  if (await prisma.user.findUnique({ where: { email: body.email } })) throw conflict('EMAIL_TAKEN', 'Email already registered');
  const id = randomUUID();
  const { password, ...rest } = body;
  const user = await prisma.user.create({
    data: { id, ...rest, passwordHash: await bcrypt.hash(password, 12), walletAddress: walletAddressFor(id) },
    select: privateUserSelect,
  });
  await audit({ action: 'USER_CREATED_BY_ADMIN', entityType: 'User', entityId: user.id, metadata: { role: user.role }, req });
  res.status(201).json({ user });
});

const updateUserSchema = z.object({
  role: z.enum(roles).optional(),
  isActive: z.boolean().optional(),
  licenseNumber: z.string().trim().max(60).nullable().optional(),
});

router.patch('/users/:id', validateBody(updateUserSchema), async (req, res) => {
  const id = param(req, 'id');
  const body = req.body as z.infer<typeof updateUserSchema>;
  if (id === currentUser(req).id && (body.role !== undefined || body.isActive === false)) {
    throw badRequest('CANNOT_MODIFY_SELF', 'You cannot change your own role or suspend yourself');
  }
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw notFound('USER_NOT_FOUND', 'User not found');
  if (body.role === 'NOTARY' && !(body.licenseNumber ?? existing.licenseNumber)) {
    throw badRequest('LICENSE_REQUIRED', 'Notaries need a licence number');
  }
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id }, data: body, select: privateUserSelect });
    if (body.isActive === false) {
      // Suspension logs the user out everywhere.
      await tx.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await audit(
      {
        action: 'USER_UPDATED_BY_ADMIN',
        entityType: 'User',
        entityId: id,
        metadata: { before: { role: existing.role, isActive: existing.isActive }, after: body },
        req,
      },
      tx,
    );
    return updated;
  });
  res.json({ user });
});

// ---------------------------------------------------------------------------
// Listings & transfers oversight
// ---------------------------------------------------------------------------

const landsQuery = paginationSchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['DRAFT', 'PENDING_VERIFICATION', 'REJECTED', 'PUBLISHED', 'UNDER_OFFER', 'SOLD', 'ARCHIVED']).optional(),
});

router.get('/lands', async (req, res) => {
  const f = parseQuery(landsQuery, req);
  const where: Prisma.LandWhereInput = {
    status: f.status,
    OR: f.q
      ? [
          { title: { contains: f.q, mode: 'insensitive' } },
          { reference: { contains: f.q, mode: 'insensitive' } },
          { parcelNumber: { contains: f.q, mode: 'insensitive' } },
          { city: { contains: f.q, mode: 'insensitive' } },
        ]
      : undefined,
  };
  const [items, total] = await Promise.all([
    prisma.land.findMany({ where, include: landCardInclude, orderBy: { updatedAt: 'desc' }, ...paginate(f.page, f.pageSize) }),
    prisma.land.count({ where }),
  ]);
  res.json(pageResult(items, total, f.page, f.pageSize));
});

const suspendSchema = z.object({ reason: z.string().trim().min(3).max(2000) });

/** Takes a listing off the market (e.g. after a fraud report). Chain history is never altered. */
router.post('/lands/:id/suspend', validateBody(suspendSchema), async (req, res) => {
  const land = await prisma.land.findUnique({ where: { id: param(req, 'id') } });
  if (!land) throw notFound('LAND_NOT_FOUND', 'Land not found');
  if (land.status === 'UNDER_OFFER') {
    throw badRequest('TRANSFER_IN_PROGRESS', 'A transfer is in progress; ask a notary to cancel it first');
  }
  const { reason } = req.body as z.infer<typeof suspendSchema>;
  await prisma.$transaction(async (tx) => {
    await tx.offer.updateMany({ where: { landId: land.id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    await tx.land.update({ where: { id: land.id }, data: { status: 'ARCHIVED', rejectionReason: reason } });
    await notify(land.ownerId, 'LAND_REJECTED', { landId: land.id, title: land.title, reason }, tx);
    await audit({ action: 'LAND_SUSPENDED', entityType: 'Land', entityId: land.id, metadata: { reason }, req }, tx);
  });
  res.json({ ok: true });
});

const transfersQuery = paginationSchema.extend({
  status: z.enum(['PENDING_NOTARY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
});

router.get('/transfers', async (req, res) => {
  const f = parseQuery(transfersQuery, req);
  const where: Prisma.TransferWhereInput = { status: f.status };
  const [items, total] = await Promise.all([
    prisma.transfer.findMany({ where, include: transferInclude, orderBy: { createdAt: 'desc' }, ...paginate(f.page, f.pageSize) }),
    prisma.transfer.count({ where }),
  ]);
  res.json(pageResult(items, total, f.page, f.pageSize));
});

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

const reportsQuery = z.object({ status: z.enum(['OPEN', 'RESOLVED', 'DISMISSED']).default('OPEN') });

router.get('/reports', async (req, res) => {
  const { status } = parseQuery(reportsQuery, req);
  const items = await prisma.report.findMany({
    where: { status },
    include: {
      land: { include: landCardInclude },
      reporter: { select: publicUserSelect },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ items });
});

const resolveSchema = z.object({ status: z.enum(['RESOLVED', 'DISMISSED']) });

router.patch('/reports/:id', validateBody(resolveSchema), async (req, res) => {
  const { status } = req.body as z.infer<typeof resolveSchema>;
  const report = await prisma.report.update({
    where: { id: param(req, 'id') },
    data: { status, resolvedAt: new Date() },
  });
  await audit({ action: `REPORT_${status}`, entityType: 'Report', entityId: report.id, req });
  res.json({ report });
});

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

const auditQuery = paginationSchema.extend({
  action: z.string().trim().max(60).optional(),
  entityType: z.string().trim().max(60).optional(),
});

router.get('/audit-logs', async (req, res) => {
  const f = parseQuery(auditQuery, req);
  const where: Prisma.AuditLogWhereInput = { action: f.action, entityType: f.entityType };
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, firstName: true, lastName: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      ...paginate(f.page, f.pageSize),
    }),
    prisma.auditLog.count({ where }),
  ]);
  res.json(pageResult(items, total, f.page, f.pageSize));
});

export default router;
