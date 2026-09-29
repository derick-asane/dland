import { Router } from 'express';
import { z } from 'zod';
import { Prisma, type Block, type TransferStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { findOverlaps, type BoundaryGeometry } from '../lib/geo';
import { audit } from '../lib/audit';
import { notify, notifyMany } from '../lib/notify';
import { afterBlockCommitted, appendBlock } from '../blockchain/ledger';
import { authenticate, currentUser, requireRole } from '../middleware/auth';
import { param, parseQuery, validateBody } from '../middleware/validate';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors';
import { privateUserSelect } from '../utils/serialize';
import { landDetailInclude } from './lands.shared';
import { escrowSelect, initialSteps, PAYMENT_STEPS, transferInclude, transferReference } from './transfers.shared';

/**
 * Notaries are the trust anchor of DLand:
 *  - a listing only becomes public once a notary approves it (and registers it on the chain);
 *  - ownership only changes once a notary completes the transfer (a new chain block).
 * Admins can read the queues for oversight, but only notaries can sign decisions.
 */
const router = Router();
router.use(authenticate, requireRole('NOTARY', 'ADMIN'));
const notaryOnly = requireRole('NOTARY');

// ---------------------------------------------------------------------------
// Listing verification
// ---------------------------------------------------------------------------

const landQuery = z.object({
  status: z.enum(['PENDING_VERIFICATION', 'PUBLISHED', 'REJECTED']).default('PENDING_VERIFICATION'),
});

router.get('/lands', async (req, res) => {
  const { status } = parseQuery(landQuery, req);
  const lands = await prisma.land.findMany({
    where: { status },
    include: landDetailInclude,
    orderBy: status === 'PENDING_VERIFICATION' ? { submittedAt: 'asc' } : { updatedAt: 'desc' },
    take: 100,
  });
  res.json({ items: lands });
});

async function pendingLand(id: string, notaryId: string) {
  const land = await prisma.land.findUnique({
    where: { id },
    include: { documents: true, owner: { select: { id: true, walletAddress: true } } },
  });
  if (!land) throw notFound('LAND_NOT_FOUND', 'Land not found');
  if (land.status !== 'PENDING_VERIFICATION') throw badRequest('LAND_NOT_PENDING', 'This land is not awaiting verification');
  if (land.ownerId === notaryId) throw forbidden('CONFLICT_OF_INTEREST', 'You cannot verify your own land');
  return land;
}

const decisionSchema = z.object({ comment: z.string().trim().max(2000).optional() });

router.post('/lands/:id/approve', notaryOnly, validateBody(decisionSchema), async (req, res) => {
  const notaryId = currentUser(req).id;
  const land = await pendingLand(param(req, 'id'), notaryId);
  const { comment } = req.body as z.infer<typeof decisionSchema>;
  const notary = await prisma.user.findUniqueOrThrow({ where: { id: notaryId }, select: { walletAddress: true } });

  // Safety net: never register a parcel that overlaps one already on the chain.
  if (!land.boundary) throw badRequest('BOUNDARY_REQUIRED', 'This land has no boundary');
  const blocking = (await findOverlaps(land.boundary as unknown as BoundaryGeometry, land.id)).filter((o) => o.registeredOnChain);
  if (blocking.length > 0) {
    throw badRequest('PARCEL_OVERLAP', 'This boundary overlaps a parcel already registered on the blockchain', { overlaps: blocking });
  }
  const boundaryData = { boundaryHash: land.boundaryHash, measuredAreaSqm: land.boundaryAreaSqm };

  const { updated, block } = await prisma.$transaction(async (tx) => {
    let block: Block | null = null;
    // First approval registers the parcel on the chain; re-listings after a sale are already registered.
    if (land.registeredOnChain && !land.boundaryOnChain) {
      // A parcel registered before it had an outline: record the newly surveyed boundary.
      block = await appendBlock(tx, {
        type: 'BOUNDARY_RECORDED',
        landId: land.id,
        signerId: notaryId,
        data: {
          landReference: land.reference,
          parcelNumber: land.parcelNumber,
          country: land.country,
          owner: land.owner.walletAddress,
          notary: notary.walletAddress,
          ...boundaryData,
        },
      });
    }
    if (!land.registeredOnChain) {
      block = await appendBlock(tx, {
        type: 'LAND_REGISTERED',
        landId: land.id,
        signerId: notaryId,
        data: {
          landReference: land.reference,
          parcelNumber: land.parcelNumber,
          titleDeedNumber: land.titleDeedNumber,
          country: land.country,
          city: land.city,
          areaSqm: land.areaSqm,
          owner: land.owner.walletAddress,
          notary: notary.walletAddress,
          documents: land.documents.map((d) => ({ type: d.type, sha256: d.sha256 })),
          ...boundaryData,
        },
      });
    }
    await tx.landVerification.create({ data: { landId: land.id, notaryId, decision: 'APPROVED', comment } });
    const result = await tx.land.update({
      where: { id: land.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        notaryId,
        rejectionReason: null,
        registeredOnChain: true,
        boundaryOnChain: true,
      },
      include: landDetailInclude,
    });
    await notify(land.ownerId, 'LAND_APPROVED', { landId: land.id, title: land.title }, tx);
    await audit({ action: 'LAND_APPROVED', entityType: 'Land', entityId: land.id, req }, tx);
    return { updated: result, block };
  });
  if (block) afterBlockCommitted(block);
  res.json({ land: updated, block });
});

const rejectSchema = z.object({ reason: z.string().trim().min(3).max(2000) });

router.post('/lands/:id/reject', notaryOnly, validateBody(rejectSchema), async (req, res) => {
  const notaryId = currentUser(req).id;
  const land = await pendingLand(param(req, 'id'), notaryId);
  const { reason } = req.body as z.infer<typeof rejectSchema>;
  const updated = await prisma.$transaction(async (tx) => {
    await tx.landVerification.create({ data: { landId: land.id, notaryId, decision: 'REJECTED', comment: reason } });
    const result = await tx.land.update({
      where: { id: land.id },
      data: { status: 'REJECTED', rejectionReason: reason, notaryId },
      include: landDetailInclude,
    });
    await notify(land.ownerId, 'LAND_REJECTED', { landId: land.id, title: land.title, reason }, tx);
    await audit({ action: 'LAND_REJECTED', entityType: 'Land', entityId: land.id, metadata: { reason }, req }, tx);
    return result;
  });
  res.json({ land: updated });
});

// ---------------------------------------------------------------------------
// Sale files (money is paid off-platform to the notary's escrow account)
// ---------------------------------------------------------------------------

const escrowSchema = z.object({
  escrowBankName: z.string().trim().min(2).max(120),
  escrowAccountName: z.string().trim().min(2).max(120),
  escrowAccountNumber: z.string().trim().min(4).max(60),
  escrowMobileMoney: z.string().trim().max(60).nullable().optional(),
});

/** The notary's escrow account, shown to buyers as payment instructions. */
router.patch('/escrow', notaryOnly, validateBody(escrowSchema), async (req, res) => {
  const body = req.body as z.infer<typeof escrowSchema>;
  const user = await prisma.user.update({
    where: { id: currentUser(req).id },
    data: { ...body, escrowMobileMoney: body.escrowMobileMoney || null },
    select: privateUserSelect,
  });
  await audit({ action: 'ESCROW_ACCOUNT_UPDATED', entityType: 'User', entityId: user.id, req });
  res.json({ user });
});

const transferQuery = z.object({
  // new: unclaimed files · active: my files in progress or awaiting registry · done: my closed files
  view: z.enum(['new', 'active', 'done']).default('new'),
});

router.get('/transfers', async (req, res) => {
  const me = currentUser(req);
  const { view } = parseQuery(transferQuery, req);
  const mine = me.role === 'NOTARY' ? { notaryId: me.id } : {};
  const where: Prisma.TransferWhereInput =
    view === 'new'
      ? { status: 'PENDING_NOTARY' }
      : view === 'active'
        ? { ...mine, OR: [{ status: 'IN_PROGRESS' }, { status: 'COMPLETED', registeredAt: null }] }
        : { ...mine, OR: [{ status: 'CANCELLED' }, { status: 'COMPLETED', registeredAt: { not: null } }] };
  const transfers = await prisma.transfer.findMany({
    where,
    include: transferInclude,
    orderBy: { createdAt: view === 'new' ? 'asc' : 'desc' },
    take: 100,
  });
  res.json({ items: transfers.map((t) => ({ ...t, reference: transferReference(t.id) })) });
});

const transferParties = {
  land: true,
  steps: { orderBy: { position: 'asc' as const } },
  seller: { select: { walletAddress: true } },
  buyer: { select: { walletAddress: true } },
} satisfies Prisma.TransferInclude;

/** Loads a file the current notary may act on. */
async function loadTransfer(id: string, notaryId: string, expected: TransferStatus[]) {
  const transfer = await prisma.transfer.findUnique({ where: { id }, include: transferParties });
  if (!transfer) throw notFound('TRANSFER_NOT_FOUND', 'Transfer not found');
  if (!expected.includes(transfer.status)) throw badRequest('TRANSFER_WRONG_STATUS', 'This action is not possible at this stage');
  if (notaryId === transfer.sellerId || notaryId === transfer.buyerId) {
    throw forbidden('CONFLICT_OF_INTEREST', 'You cannot notarize a transfer you are part of');
  }
  if (transfer.status !== 'PENDING_NOTARY' && transfer.notaryId !== notaryId) {
    throw forbidden('NOT_ASSIGNED_NOTARY', 'Another notary handles this file');
  }
  return transfer;
}

const claimSchema = z.object({
  // Deposit the buyer pays first; 10% of the price when omitted, 0 for a single payment.
  depositAmount: z.coerce.number().min(0).optional(),
});

/** A notary takes the file: the payment steps are created and the buyer sees the escrow details. */
router.post('/transfers/:id/claim', notaryOnly, validateBody(claimSchema), async (req, res) => {
  const notaryId = currentUser(req).id;
  const transfer = await loadTransfer(param(req, 'id'), notaryId, ['PENDING_NOTARY']);
  const notary = await prisma.user.findUniqueOrThrow({ where: { id: notaryId }, select: escrowSelect });
  if (!notary.escrowBankName || !notary.escrowAccountNumber) {
    throw badRequest('ESCROW_DETAILS_REQUIRED', 'Add your escrow account before taking a file');
  }
  const { depositAmount } = req.body as z.infer<typeof claimSchema>;
  const deposit =
    depositAmount === undefined ? transfer.price.mul(0.1).toDecimalPlaces(0) : new Prisma.Decimal(depositAmount);
  if (deposit.gte(transfer.price)) throw badRequest('DEPOSIT_TOO_HIGH', 'The deposit must be lower than the price');

  const claimed = await prisma.$transaction(async (tx) => {
    // Guard against two notaries claiming the same file at once.
    const taken = await tx.transfer.updateMany({
      where: { id: transfer.id, status: 'PENDING_NOTARY', notaryId: null },
      data: { status: 'IN_PROGRESS', notaryId, claimedAt: new Date() },
    });
    if (taken.count === 0) throw badRequest('TRANSFER_WRONG_STATUS', 'This file was already taken');
    await tx.transferStep.createMany({
      data: initialSteps(transfer.price, deposit).map((s) => ({ ...s, transferId: transfer.id })),
    });
    const data = { transferId: transfer.id, title: transfer.land.title, landId: transfer.landId };
    await notifyMany([transfer.buyerId, transfer.sellerId], 'TRANSFER_CLAIMED', data, tx);
    await audit({ action: 'TRANSFER_CLAIMED', entityType: 'Transfer', entityId: transfer.id, metadata: { deposit: deposit.toString() }, req }, tx);
    return tx.transfer.findUniqueOrThrow({ where: { id: transfer.id }, include: transferInclude });
  });
  res.json({ transfer: { ...claimed, reference: transferReference(claimed.id) } });
});

async function paymentStep(transferId: string, stepId: string, notaryId: string) {
  const transfer = await loadTransfer(transferId, notaryId, ['IN_PROGRESS']);
  const step = transfer.steps.find((s) => s.id === stepId);
  if (!step || !PAYMENT_STEPS.includes(step.type)) throw notFound('STEP_NOT_FOUND', 'Payment step not found');
  if (step.status !== 'SUBMITTED') throw badRequest('STEP_NOT_SUBMITTED', 'No receipt is waiting for review');
  return { transfer, step };
}

const noteSchema = z.object({ note: z.string().trim().max(2000).optional() });

/** Confirms that money reached the escrow account; the receipt's fingerprint goes on the chain. */
router.post('/transfers/:id/steps/:stepId/confirm', notaryOnly, validateBody(noteSchema), async (req, res) => {
  const notaryId = currentUser(req).id;
  const { transfer, step } = await paymentStep(param(req, 'id'), param(req, 'stepId'), notaryId);
  const { note } = req.body as z.infer<typeof noteSchema>;
  const notary = await prisma.user.findUniqueOrThrow({ where: { id: notaryId }, select: { walletAddress: true } });

  const { block, updated } = await prisma.$transaction(async (tx) => {
    const newBlock = await appendBlock(tx, {
      type: 'PAYMENT_CONFIRMED',
      landId: transfer.landId,
      signerId: notaryId,
      data: {
        landReference: transfer.land.reference,
        transferReference: transferReference(transfer.id),
        step: step.type,
        amount: step.amount?.toString() ?? null,
        currency: transfer.currency,
        receiptSha256: step.proofSha256,
        paymentReference: step.paymentReference,
        payer: transfer.buyer.walletAddress,
        notary: notary.walletAddress,
      },
    });
    const result = await tx.transferStep.update({
      where: { id: step.id },
      data: { status: 'CONFIRMED', confirmedById: notaryId, confirmedAt: new Date(), note: note || null, blockId: newBlock.id },
    });
    const data = {
      transferId: transfer.id,
      title: transfer.land.title,
      step: step.type,
      amount: step.amount?.toString() ?? null,
      currency: transfer.currency,
    };
    await notifyMany([transfer.buyerId, transfer.sellerId], 'PAYMENT_CONFIRMED', data, tx);
    await audit({ action: 'PAYMENT_CONFIRMED', entityType: 'Transfer', entityId: transfer.id, metadata: { step: step.type, blockIndex: newBlock.index }, req }, tx);
    return { block: newBlock, updated: result };
  });
  afterBlockCommitted(block);
  res.json({ step: updated, block });
});

const reasonSchema = z.object({ reason: z.string().trim().min(3).max(2000) });

/** Rejects a receipt (unreadable, wrong amount, not received…); the buyer can upload a new one. */
router.post('/transfers/:id/steps/:stepId/reject', notaryOnly, validateBody(reasonSchema), async (req, res) => {
  const notaryId = currentUser(req).id;
  const { transfer, step } = await paymentStep(param(req, 'id'), param(req, 'stepId'), notaryId);
  const { reason } = req.body as z.infer<typeof reasonSchema>;
  const updated = await prisma.transferStep.update({ where: { id: step.id }, data: { status: 'REJECTED', note: reason } });
  await notify(transfer.buyerId, 'PAYMENT_REJECTED', { transferId: transfer.id, title: transfer.land.title, step: step.type, reason });
  await audit({ action: 'PAYMENT_REJECTED', entityType: 'Transfer', entityId: transfer.id, metadata: { step: step.type, reason }, req });
  res.json({ step: updated });
});

const completeSchema = z.object({
  deedReference: z.string().trim().min(2).max(120),
  comment: z.string().trim().max(2000).optional(),
});

/**
 * The deed is signed: once every payment is confirmed, writes an OWNERSHIP_TRANSFERRED block
 * and moves the land to the buyer.
 */
router.post('/transfers/:id/complete', notaryOnly, validateBody(completeSchema), async (req, res) => {
  const notaryId = currentUser(req).id;
  const transfer = await loadTransfer(param(req, 'id'), notaryId, ['IN_PROGRESS']);
  const unpaid = transfer.steps.filter((s) => PAYMENT_STEPS.includes(s.type) && s.status !== 'CONFIRMED');
  if (unpaid.length > 0) throw badRequest('PAYMENTS_NOT_CONFIRMED', 'All payments must be confirmed before the deed is signed');
  const { deedReference, comment } = req.body as z.infer<typeof completeSchema>;
  const notary = await prisma.user.findUniqueOrThrow({ where: { id: notaryId }, select: { walletAddress: true } });

  const { block, completed } = await prisma.$transaction(async (tx) => {
    const newBlock = await appendBlock(tx, {
      type: 'OWNERSHIP_TRANSFERRED',
      landId: transfer.landId,
      signerId: notaryId,
      data: {
        landReference: transfer.land.reference,
        parcelNumber: transfer.land.parcelNumber,
        country: transfer.land.country,
        from: transfer.seller.walletAddress,
        to: transfer.buyer.walletAddress,
        price: transfer.price.toString(),
        currency: transfer.currency,
        boundaryHash: transfer.land.boundaryHash,
        transferId: transfer.id,
        transferReference: transferReference(transfer.id),
        deedReference,
        notary: notary.walletAddress,
      },
    });
    await tx.transferStep.updateMany({
      where: { transferId: transfer.id, type: 'DEED_SIGNED' },
      data: { status: 'CONFIRMED', confirmedById: notaryId, confirmedAt: new Date(), note: deedReference },
    });
    const done = await tx.transfer.update({
      where: { id: transfer.id },
      data: { status: 'COMPLETED', notaryNote: comment, deedReference, blockId: newBlock.id, completedAt: new Date() },
      include: transferInclude,
    });
    await tx.land.update({
      where: { id: transfer.landId },
      data: { ownerId: transfer.buyerId, status: 'SOLD', notaryId },
    });
    // The new owner starts with a clean slate: stale favorites of the buyer are irrelevant now.
    await tx.favorite.deleteMany({ where: { landId: transfer.landId, userId: transfer.buyerId } });
    const data = { landId: transfer.landId, title: transfer.land.title, transferId: transfer.id, blockHash: newBlock.hash };
    await notifyMany([transfer.sellerId, transfer.buyerId], 'TRANSFER_COMPLETED', data, tx);
    await audit({ action: 'TRANSFER_COMPLETED', entityType: 'Transfer', entityId: transfer.id, metadata: { blockIndex: newBlock.index, deedReference }, req }, tx);
    return { block: newBlock, completed: done };
  });
  afterBlockCommitted(block);
  res.json({ transfer: { ...completed, reference: transferReference(completed.id) }, block });
});

const registrySchema = z.object({
  registryReference: z.string().trim().min(2).max(120),
  // Set when the registry issued a new title number (e.g. after a subdivision)
  titleDeedNumber: z.string().trim().min(1).max(60).optional(),
});

/** The sale is recorded at the official land registry: the last step, anchored on the chain. */
router.post('/transfers/:id/registry', notaryOnly, validateBody(registrySchema), async (req, res) => {
  const notaryId = currentUser(req).id;
  const transfer = await loadTransfer(param(req, 'id'), notaryId, ['COMPLETED']);
  if (transfer.registeredAt) throw conflict('ALREADY_REGISTERED', 'This sale is already recorded at the registry');
  const { registryReference, titleDeedNumber } = req.body as z.infer<typeof registrySchema>;
  const notary = await prisma.user.findUniqueOrThrow({ where: { id: notaryId }, select: { walletAddress: true } });

  const block = await prisma.$transaction(async (tx) => {
    const newBlock = await appendBlock(tx, {
      type: 'REGISTRY_RECORDED',
      landId: transfer.landId,
      signerId: notaryId,
      data: {
        landReference: transfer.land.reference,
        transferReference: transferReference(transfer.id),
        registryReference,
        titleDeedNumber: titleDeedNumber ?? transfer.land.titleDeedNumber,
        owner: transfer.buyer.walletAddress,
        notary: notary.walletAddress,
      },
    });
    await tx.transferStep.updateMany({
      where: { transferId: transfer.id, type: 'REGISTERED' },
      data: { status: 'CONFIRMED', confirmedById: notaryId, confirmedAt: new Date(), note: registryReference, blockId: newBlock.id },
    });
    await tx.transfer.update({ where: { id: transfer.id }, data: { registryReference, registeredAt: new Date() } });
    if (titleDeedNumber) await tx.land.update({ where: { id: transfer.landId }, data: { titleDeedNumber } });
    const data = { transferId: transfer.id, title: transfer.land.title, landId: transfer.landId, registryReference };
    await notifyMany([transfer.buyerId, transfer.sellerId], 'TITLE_REGISTERED', data, tx);
    await audit({ action: 'REGISTRY_RECORDED', entityType: 'Transfer', entityId: transfer.id, metadata: { registryReference }, req }, tx);
    return newBlock;
  });
  afterBlockCommitted(block);
  res.json({ ok: true, block });
});

/** Cancels the sale (e.g. payment never arrived); the land goes back on the market. */
router.post('/transfers/:id/cancel', notaryOnly, validateBody(reasonSchema), async (req, res) => {
  const notaryId = currentUser(req).id;
  const transfer = await loadTransfer(param(req, 'id'), notaryId, ['PENDING_NOTARY', 'IN_PROGRESS']);
  const { reason } = req.body as z.infer<typeof reasonSchema>;
  await prisma.$transaction(async (tx) => {
    await tx.transfer.update({ where: { id: transfer.id }, data: { status: 'CANCELLED', notaryId, notaryNote: reason } });
    if (transfer.offerId) await tx.offer.update({ where: { id: transfer.offerId }, data: { status: 'CANCELLED' } });
    await tx.land.update({ where: { id: transfer.landId }, data: { status: 'PUBLISHED' } });
    const data = { landId: transfer.landId, title: transfer.land.title, transferId: transfer.id, reason };
    await notifyMany([transfer.sellerId, transfer.buyerId], 'TRANSFER_CANCELLED', data, tx);
    await audit({ action: 'TRANSFER_CANCELLED', entityType: 'Transfer', entityId: transfer.id, metadata: { reason }, req }, tx);
  });
  res.json({ ok: true });
});

export default router;
