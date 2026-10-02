import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { audit } from '../lib/audit';
import { notify, notifyMany, notifyRole } from '../lib/notify';
import { authenticate, currentUser } from '../middleware/auth';
import { param, validateBody } from '../middleware/validate';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors';
import { publicUserSelect } from '../utils/serialize';
import { assertNotFrozen } from './lands.shared';

/**
 * Offer flow:
 *   buyer makes offer (PENDING) → seller accepts → Transfer(PENDING_NOTARY), land UNDER_OFFER
 *   → notary completes the transfer (see notary.routes.ts) → ownership block on the chain.
 */
const router = Router();
router.use(authenticate);

const offerInclude = {
  land: { include: { images: { orderBy: { position: 'asc' as const }, take: 1 } } },
  buyer: { select: publicUserSelect },
  transfer: true,
};

const createSchema = z.object({
  landId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  message: z.string().trim().max(1000).optional(),
});

router.post('/', validateBody(createSchema), async (req, res) => {
  const body = req.body as z.infer<typeof createSchema>;
  const me = currentUser(req);
  const land = await prisma.land.findUnique({ where: { id: body.landId } });
  if (!land) throw notFound('LAND_NOT_FOUND', 'Land not found');
  if (land.status !== 'PUBLISHED') throw badRequest('LAND_NOT_AVAILABLE', 'This land is not available for offers');
  assertNotFrozen(land);
  if (land.ownerId === me.id) throw badRequest('OWN_LAND', 'You cannot make an offer on your own land');

  const existing = await prisma.offer.findFirst({ where: { landId: land.id, buyerId: me.id, status: 'PENDING' } });
  if (existing) throw conflict('OFFER_ALREADY_PENDING', 'You already have a pending offer on this land');

  const offer = await prisma.offer.create({
    data: { landId: land.id, buyerId: me.id, amount: body.amount, message: body.message },
    include: offerInclude,
  });
  await notify(land.ownerId, 'OFFER_RECEIVED', {
    offerId: offer.id,
    landId: land.id,
    title: land.title,
    amount: body.amount,
    currency: land.currency,
  });
  res.status(201).json({ offer });
});

router.get('/sent', async (req, res) => {
  const offers = await prisma.offer.findMany({
    where: { buyerId: currentUser(req).id },
    include: offerInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json({ items: offers });
});

router.get('/received', async (req, res) => {
  const offers = await prisma.offer.findMany({
    where: { land: { ownerId: currentUser(req).id } },
    include: offerInclude,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
  res.json({ items: offers });
});

async function loadOffer(id: string) {
  const offer = await prisma.offer.findUnique({ where: { id }, include: { land: true } });
  if (!offer) throw notFound('OFFER_NOT_FOUND', 'Offer not found');
  return offer;
}

router.post('/:id/accept', async (req, res) => {
  const me = currentUser(req);
  const offer = await loadOffer(param(req, 'id'));
  if (offer.land.ownerId !== me.id) throw forbidden('NOT_LAND_OWNER', 'You do not own this land');
  if (offer.status !== 'PENDING') throw badRequest('OFFER_NOT_PENDING', 'This offer is no longer pending');
  if (offer.land.status !== 'PUBLISHED') throw badRequest('LAND_NOT_AVAILABLE', 'This land is not available');
  assertNotFrozen(offer.land);

  const others = await prisma.offer.findMany({
    where: { landId: offer.landId, status: 'PENDING', id: { not: offer.id } },
    select: { buyerId: true },
  });

  const transfer = await prisma.$transaction(async (tx) => {
    // Guard against a concurrent accept on the same land.
    const locked = await tx.land.updateMany({
      where: { id: offer.landId, status: 'PUBLISHED' },
      data: { status: 'UNDER_OFFER' },
    });
    if (locked.count === 0) throw badRequest('LAND_NOT_AVAILABLE', 'This land is not available');

    await tx.offer.update({ where: { id: offer.id }, data: { status: 'ACCEPTED' } });
    await tx.offer.updateMany({
      where: { landId: offer.landId, status: 'PENDING', id: { not: offer.id } },
      data: { status: 'REJECTED' },
    });
    const created = await tx.transfer.create({
      data: {
        landId: offer.landId,
        offerId: offer.id,
        sellerId: me.id,
        buyerId: offer.buyerId,
        price: offer.amount,
        currency: offer.land.currency,
      },
    });
    const data = { landId: offer.landId, title: offer.land.title, offerId: offer.id, transferId: created.id };
    await notify(offer.buyerId, 'OFFER_ACCEPTED', data, tx);
    await notifyMany(
      others.map((o) => o.buyerId),
      'OFFER_REJECTED',
      data,
      tx,
    );
    await notifyRole('NOTARY', 'TRANSFER_PENDING', data, tx);
    return created;
  });
  await audit({ action: 'OFFER_ACCEPTED', entityType: 'Offer', entityId: offer.id, metadata: { transferId: transfer.id }, req });
  res.json({ transfer });
});

router.post('/:id/reject', async (req, res) => {
  const offer = await loadOffer(param(req, 'id'));
  if (offer.land.ownerId !== currentUser(req).id) throw forbidden('NOT_LAND_OWNER', 'You do not own this land');
  if (offer.status !== 'PENDING') throw badRequest('OFFER_NOT_PENDING', 'This offer is no longer pending');
  await prisma.offer.update({ where: { id: offer.id }, data: { status: 'REJECTED' } });
  await notify(offer.buyerId, 'OFFER_REJECTED', { landId: offer.landId, title: offer.land.title, offerId: offer.id });
  res.json({ ok: true });
});

router.post('/:id/withdraw', async (req, res) => {
  const offer = await loadOffer(param(req, 'id'));
  if (offer.buyerId !== currentUser(req).id) throw forbidden('NOT_OFFER_OWNER', 'This is not your offer');
  if (offer.status !== 'PENDING') throw badRequest('OFFER_NOT_PENDING', 'This offer is no longer pending');
  await prisma.offer.update({ where: { id: offer.id }, data: { status: 'WITHDRAWN' } });
  await notify(offer.land.ownerId, 'OFFER_WITHDRAWN', { landId: offer.landId, title: offer.land.title, offerId: offer.id });
  res.json({ ok: true });
});

export default router;
