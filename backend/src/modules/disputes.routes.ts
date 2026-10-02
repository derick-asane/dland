import { Router } from 'express';
import { z } from 'zod';
import type { Block, Dispute, DisputeStatus, Prisma } from '@prisma/client';
import { prisma, type Tx } from '../lib/prisma';
import { audit } from '../lib/audit';
import { notify, notifyMany, notifyRole } from '../lib/notify';
import { privateStorage } from '../lib/storage';
import { afterBlockCommitted, appendBlock } from '../blockchain/ledger';
import { authenticate, currentUser, requireRole, type AuthUser } from '../middleware/auth';
import { discardIncoming, privateUpload, storePrivate } from '../middleware/upload';
import { param, parseQuery, validateBody } from '../middleware/validate';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors';
import { publicUserSelect } from '../utils/serialize';
import { canViewLand, isStaff } from './lands.shared';

/**
 * Ownership disputes. Any client can challenge a land; a notary takes the dispute and may freeze
 * the land (LAND_FROZEN block: no offer, sale or relisting) while investigating. Dismissing or
 * withdrawing the dispute lifts the freeze (LAND_UNFROZEN block); upholding it keeps the land
 * frozen and off the market until a notary lifts the freeze once the matter is settled officially.
 */
const router = Router();
router.use(authenticate);

const MAX_EVIDENCE = 5;
const ACTIVE: DisputeStatus[] = ['OPEN', 'UNDER_REVIEW'];
const REASONS = ['OWNERSHIP_CLAIM', 'DOUBLE_SALE', 'FORGED_DOCUMENTS', 'BOUNDARY_CONFLICT', 'INHERITANCE', 'OTHER'] as const;

export const disputeReference = (id: string) => `DL-DS-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

const disputeInclude = {
  land: {
    select: {
      id: true,
      reference: true,
      title: true,
      city: true,
      country: true,
      status: true,
      frozen: true,
      ownerId: true,
      owner: { select: publicUserSelect },
      images: { orderBy: { position: 'asc' as const }, take: 1 },
    },
  },
  claimant: { select: publicUserSelect },
  notary: { select: publicUserSelect },
  evidence: { orderBy: { createdAt: 'asc' as const }, include: { uploadedBy: { select: publicUserSelect } } },
} satisfies Prisma.DisputeInclude;

type DisputeWithLand = Prisma.DisputeGetPayload<{ include: typeof disputeInclude }>;
const withReference = <T extends { id: string }>(d: T) => ({ ...d, reference: disputeReference(d.id) });

/** Claimant, land owner, notaries and admins. */
function assertCanView(d: Pick<Dispute, 'claimantId'> & { land: { ownerId: string } }, user: AuthUser) {
  if (user.id !== d.claimantId && user.id !== d.land.ownerId && !isStaff(user)) throw forbidden();
}

async function loadDispute(id: string) {
  const dispute = await prisma.dispute.findUnique({ where: { id }, include: disputeInclude });
  if (!dispute) throw notFound('DISPUTE_NOT_FOUND', 'Dispute not found');
  return dispute;
}

async function saveEvidence(disputeId: string, userId: string, files: Express.Multer.File[], db: Tx = prisma) {
  for (const file of files) {
    const stored = await storePrivate(file);
    await db.disputeEvidence.create({
      data: { disputeId, uploadedById: userId, name: file.originalname, storageKey: stored.key, mimeType: file.mimetype, sha256: stored.sha256 },
    });
  }
}

/** Wallet addresses written to freeze blocks (no personal data on the chain). */
async function wallets(d: DisputeWithLand, notaryId: string) {
  const [owner, claimant, notary] = await Promise.all(
    [d.land.ownerId, d.claimantId, notaryId].map((id) => prisma.user.findUniqueOrThrow({ where: { id }, select: { walletAddress: true } })),
  );
  return { owner: owner.walletAddress, claimant: claimant.walletAddress, notary: notary.walletAddress };
}

/**
 * Lifts the freeze if no other dispute still holds it. Returns the LAND_UNFROZEN block, if any.
 * `outcome` explains why: the dispute was dismissed or withdrawn, or the freeze was lifted.
 */
async function releaseFreeze(
  tx: Tx,
  d: DisputeWithLand,
  outcome: 'DISMISSED' | 'WITHDRAWN' | 'LIFTED',
  signerId: string,
  notaryWallet: string,
): Promise<Block | null> {
  const stillHolding = await tx.dispute.count({ where: { landId: d.landId, frozenAt: { not: null }, id: { not: d.id } } });
  if (stillHolding > 0 || !d.land.frozen) return null;
  const owner = await tx.user.findUniqueOrThrow({ where: { id: d.land.ownerId }, select: { walletAddress: true } });
  const block = await appendBlock(tx, {
    type: 'LAND_UNFROZEN',
    landId: d.landId,
    signerId,
    data: { landReference: d.land.reference, disputeReference: disputeReference(d.id), outcome, owner: owner.walletAddress, notary: notaryWallet },
  });
  await tx.land.update({ where: { id: d.landId }, data: { frozen: false } });
  await notifyMany([d.land.ownerId, d.claimantId], 'LAND_UNFROZEN', { landId: d.landId, title: d.land.title, disputeId: d.id, outcome }, tx);
  return block;
}

// ---------------------------------------------------------------------------
// Clients: open, follow, respond, withdraw
// ---------------------------------------------------------------------------

const openSchema = z.object({
  landId: z.string().uuid(),
  reason: z.enum(REASONS),
  description: z.string().trim().min(20).max(5000),
});

/** Any client can challenge the ownership of a visible land, with optional evidence files. */
router.post('/', privateUpload.array('evidence', MAX_EVIDENCE), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  try {
    const me = currentUser(req);
    const body = openSchema.parse(req.body);
    const land = await prisma.land.findUnique({ where: { id: body.landId } });
    if (!land || !canViewLand(land, me)) throw notFound('LAND_NOT_FOUND', 'Land not found');
    if (land.ownerId === me.id) throw badRequest('OWN_LAND', 'You cannot dispute your own land');
    if (!land.registeredOnChain) throw badRequest('LAND_NOT_REGISTERED', 'Only registered land can be disputed');
    const existing = await prisma.dispute.findFirst({ where: { landId: land.id, claimantId: me.id, status: { in: ACTIVE } } });
    if (existing) throw conflict('DISPUTE_ALREADY_OPEN', 'You already have an open dispute on this land');

    const dispute = await prisma.dispute.create({
      data: { landId: land.id, claimantId: me.id, reason: body.reason, description: body.description },
    });
    await saveEvidence(dispute.id, me.id, files);
    const data = { disputeId: dispute.id, landId: land.id, title: land.title, reason: body.reason };
    await notify(land.ownerId, 'DISPUTE_OPENED', data);
    await notifyRole('NOTARY', 'DISPUTE_OPENED', data);
    await audit({ action: 'DISPUTE_OPENED', entityType: 'Land', entityId: land.id, metadata: { disputeId: dispute.id, reason: body.reason }, req });
    res.status(201).json({ dispute: withReference(await loadDispute(dispute.id)) });
  } catch (err) {
    files.forEach(discardIncoming);
    throw err;
  }
});

/** Disputes I filed or that concern my land. */
router.get('/mine', async (req, res) => {
  const me = currentUser(req);
  const items = await prisma.dispute.findMany({
    where: { OR: [{ claimantId: me.id }, { land: { ownerId: me.id } }] },
    include: disputeInclude,
    orderBy: { updatedAt: 'desc' },
  });
  res.json({ items: items.map(withReference) });
});

const listQuery = z.object({
  // new: waiting for a notary · active: under review · closed: upheld, dismissed or withdrawn
  view: z.enum(['new', 'active', 'closed']).default('new'),
  landId: z.string().uuid().optional(),
});

/** Notary / admin queue. Notaries see the disputes they handle under "active" and "closed". */
router.get('/', requireRole('NOTARY', 'ADMIN'), async (req, res) => {
  const me = currentUser(req);
  const { view, landId } = parseQuery(listQuery, req);
  const mine = me.role === 'NOTARY' && view !== 'new' ? { notaryId: me.id } : {};
  const status: DisputeStatus[] = view === 'new' ? ['OPEN'] : view === 'active' ? ['UNDER_REVIEW'] : ['UPHELD', 'DISMISSED', 'WITHDRAWN'];
  const items = await prisma.dispute.findMany({
    where: { ...mine, landId, status: { in: status } },
    include: disputeInclude,
    orderBy: { createdAt: view === 'new' ? 'asc' : 'desc' },
    take: 100,
  });
  res.json({ items: items.map(withReference) });
});

router.get('/:id', async (req, res) => {
  const dispute = await loadDispute(param(req, 'id'));
  assertCanView(dispute, currentUser(req));
  res.json({ dispute: withReference(dispute) });
});

/** Claimant or owner adds evidence while the dispute is active. */
router.post('/:id/evidence', privateUpload.array('evidence', MAX_EVIDENCE), async (req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  try {
    const me = currentUser(req);
    const dispute = await loadDispute(param(req, 'id'));
    if (me.id !== dispute.claimantId && me.id !== dispute.land.ownerId) throw forbidden();
    if (!ACTIVE.includes(dispute.status)) throw badRequest('DISPUTE_CLOSED', 'This dispute is closed');
    if (files.length === 0) throw badRequest('FILE_REQUIRED', 'Choose at least one file');
    if (dispute.evidence.length + files.length > MAX_EVIDENCE * 4) throw badRequest('TOO_MANY_FILES', 'Too many evidence files');
    await saveEvidence(dispute.id, me.id, files);
    const other = me.id === dispute.claimantId ? dispute.land.ownerId : dispute.claimantId;
    const data = { disputeId: dispute.id, landId: dispute.landId, title: dispute.land.title };
    await notifyMany([other, ...(dispute.notaryId ? [dispute.notaryId] : [])], 'DISPUTE_RESPONSE', data);
    res.status(201).json({ dispute: withReference(await loadDispute(dispute.id)) });
  } catch (err) {
    files.forEach(discardIncoming);
    throw err;
  }
});

const responseSchema = z.object({ text: z.string().trim().min(10).max(5000) });

/** The owner gives their side of the story. */
router.post('/:id/response', validateBody(responseSchema), async (req, res) => {
  const me = currentUser(req);
  const dispute = await loadDispute(param(req, 'id'));
  if (me.id !== dispute.land.ownerId) throw forbidden('NOT_LAND_OWNER', 'Only the owner can respond');
  if (!ACTIVE.includes(dispute.status)) throw badRequest('DISPUTE_CLOSED', 'This dispute is closed');
  const { text } = req.body as z.infer<typeof responseSchema>;
  await prisma.dispute.update({ where: { id: dispute.id }, data: { ownerResponse: text } });
  const data = { disputeId: dispute.id, landId: dispute.landId, title: dispute.land.title };
  await notifyMany([dispute.claimantId, ...(dispute.notaryId ? [dispute.notaryId] : [])], 'DISPUTE_RESPONSE', data);
  res.json({ dispute: withReference(await loadDispute(dispute.id)) });
});

/** The claimant drops the dispute; a freeze it holds is lifted. */
router.post('/:id/withdraw', async (req, res) => {
  const me = currentUser(req);
  const dispute = await loadDispute(param(req, 'id'));
  if (me.id !== dispute.claimantId) throw forbidden('NOT_CLAIMANT', 'Only the claimant can withdraw');
  if (!ACTIVE.includes(dispute.status)) throw badRequest('DISPUTE_CLOSED', 'This dispute is closed');
  const block = await prisma.$transaction(async (tx) => {
    await tx.dispute.update({ where: { id: dispute.id }, data: { status: 'WITHDRAWN', frozenAt: null, resolvedAt: new Date() } });
    const notaryWallet = dispute.notaryId ? (await wallets(dispute, dispute.notaryId)).notary : null;
    const released = dispute.frozenAt && notaryWallet ? await releaseFreeze(tx, dispute, 'WITHDRAWN', dispute.notaryId!, notaryWallet) : null;
    await notifyMany([dispute.land.ownerId, ...(dispute.notaryId ? [dispute.notaryId] : [])], 'DISPUTE_RESOLVED', {
      disputeId: dispute.id,
      landId: dispute.landId,
      title: dispute.land.title,
      outcome: 'WITHDRAWN',
    }, tx);
    await audit({ action: 'DISPUTE_WITHDRAWN', entityType: 'Land', entityId: dispute.landId, metadata: { disputeId: dispute.id }, req }, tx);
    return released;
  });
  if (block) afterBlockCommitted(block);
  res.json({ dispute: withReference(await loadDispute(dispute.id)) });
});

/** Temporary link to one evidence file (claimant, owner, notaries, admins), logged in the audit trail. */
router.get('/:id/evidence/:evidenceId/link', async (req, res) => {
  const dispute = await loadDispute(param(req, 'id'));
  assertCanView(dispute, currentUser(req));
  const evidence = await prisma.disputeEvidence.findFirst({
    where: { id: param(req, 'evidenceId'), disputeId: dispute.id },
    omit: { storageKey: false },
  });
  if (!evidence) throw notFound('DOCUMENT_NOT_FOUND', 'Evidence not found');
  const link = privateStorage.signedUrl(evidence.storageKey);
  await audit({ action: 'EVIDENCE_OPENED', entityType: 'Land', entityId: dispute.landId, metadata: { disputeId: dispute.id, evidenceId: evidence.id }, req });
  res.json(link);
});

// ---------------------------------------------------------------------------
// Notaries: take, freeze, resolve, lift
// ---------------------------------------------------------------------------

const notaryOnly = requireRole('NOTARY');

function assertIndependent(d: DisputeWithLand, notaryId: string) {
  if (notaryId === d.claimantId || notaryId === d.land.ownerId) {
    throw forbidden('CONFLICT_OF_INTEREST', 'You cannot handle a dispute you are part of');
  }
}

function assertHandling(d: DisputeWithLand, notaryId: string) {
  if (d.status !== 'UNDER_REVIEW') throw badRequest('DISPUTE_WRONG_STATUS', 'This action is not possible at this stage');
  if (d.notaryId !== notaryId) throw forbidden('NOT_ASSIGNED_NOTARY', 'Another notary handles this dispute');
}

router.post('/:id/take', notaryOnly, async (req, res) => {
  const notaryId = currentUser(req).id;
  const dispute = await loadDispute(param(req, 'id'));
  assertIndependent(dispute, notaryId);
  const taken = await prisma.dispute.updateMany({
    where: { id: dispute.id, status: 'OPEN', notaryId: null },
    data: { status: 'UNDER_REVIEW', notaryId },
  });
  if (taken.count === 0) throw badRequest('DISPUTE_WRONG_STATUS', 'This dispute was already taken');
  await notifyMany([dispute.claimantId, dispute.land.ownerId], 'DISPUTE_TAKEN', {
    disputeId: dispute.id,
    landId: dispute.landId,
    title: dispute.land.title,
  });
  await audit({ action: 'DISPUTE_TAKEN', entityType: 'Land', entityId: dispute.landId, metadata: { disputeId: dispute.id }, req });
  res.json({ dispute: withReference(await loadDispute(dispute.id)) });
});

/** Freezes the land while the dispute is investigated: written to the chain. */
router.post('/:id/freeze', notaryOnly, async (req, res) => {
  const notaryId = currentUser(req).id;
  const dispute = await loadDispute(param(req, 'id'));
  assertHandling(dispute, notaryId);
  if (dispute.frozenAt) throw conflict('ALREADY_FROZEN', 'This dispute already froze the land');
  const w = await wallets(dispute, notaryId);

  const block = await prisma.$transaction(async (tx) => {
    let frozenBlock: Block | null = null;
    // A land already frozen by another dispute gets no second block.
    if (!dispute.land.frozen) {
      frozenBlock = await appendBlock(tx, {
        type: 'LAND_FROZEN',
        landId: dispute.landId,
        signerId: notaryId,
        data: { landReference: dispute.land.reference, disputeReference: disputeReference(dispute.id), reason: dispute.reason, ...w },
      });
      await tx.land.update({ where: { id: dispute.landId }, data: { frozen: true } });
    }
    await tx.dispute.update({ where: { id: dispute.id }, data: { frozenAt: new Date() } });
    // Anyone in the middle of buying this land must know the sale is on hold.
    const buyers = await tx.transfer.findMany({
      where: { landId: dispute.landId, status: { in: ['PENDING_NOTARY', 'IN_PROGRESS'] } },
      select: { buyerId: true },
    });
    await notifyMany(
      [...new Set([dispute.land.ownerId, dispute.claimantId, ...buyers.map((b) => b.buyerId)])],
      'LAND_FROZEN',
      { disputeId: dispute.id, landId: dispute.landId, title: dispute.land.title },
      tx,
    );
    await audit({ action: 'LAND_FROZEN', entityType: 'Land', entityId: dispute.landId, metadata: { disputeId: dispute.id }, req }, tx);
    return frozenBlock;
  });
  if (block) afterBlockCommitted(block);
  res.json({ dispute: withReference(await loadDispute(dispute.id)), block });
});

const resolveSchema = z.object({
  outcome: z.enum(['UPHELD', 'DISMISSED']),
  note: z.string().trim().min(10).max(5000),
});

/**
 * DISMISSED: the claim is unfounded, the freeze held by this dispute is lifted.
 * UPHELD: the claim is founded, the land stays frozen and is taken off the market; any sale in
 * progress is cancelled. A notary lifts the freeze later, once the matter is settled officially.
 */
router.post('/:id/resolve', notaryOnly, validateBody(resolveSchema), async (req, res) => {
  const notaryId = currentUser(req).id;
  const dispute = await loadDispute(param(req, 'id'));
  assertHandling(dispute, notaryId);
  const { outcome, note } = req.body as z.infer<typeof resolveSchema>;
  const w = await wallets(dispute, notaryId);

  const block = await prisma.$transaction(async (tx) => {
    let chainBlock: Block | null = null;
    if (outcome === 'DISMISSED') {
      await tx.dispute.update({ where: { id: dispute.id }, data: { status: 'DISMISSED', resolutionNote: note, resolvedAt: new Date(), frozenAt: null } });
      if (dispute.frozenAt) chainBlock = await releaseFreeze(tx, dispute, 'DISMISSED', notaryId, w.notary);
    } else {
      await tx.dispute.update({ where: { id: dispute.id }, data: { status: 'UPHELD', resolutionNote: note, resolvedAt: new Date() } });
      // Keep (or start) the freeze and take the land off the market.
      if (!dispute.land.frozen) {
        chainBlock = await appendBlock(tx, {
          type: 'LAND_FROZEN',
          landId: dispute.landId,
          signerId: notaryId,
          data: { landReference: dispute.land.reference, disputeReference: disputeReference(dispute.id), reason: dispute.reason, ...w },
        });
      }
      await tx.dispute.update({ where: { id: dispute.id }, data: { frozenAt: dispute.frozenAt ?? new Date() } });
      await tx.land.update({
        where: { id: dispute.landId },
        data: { frozen: true, ...(['PUBLISHED', 'UNDER_OFFER'].includes(dispute.land.status) ? { status: 'ARCHIVED' } : {}) },
      });
      await tx.offer.updateMany({ where: { landId: dispute.landId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
      const active = await tx.transfer.findMany({ where: { landId: dispute.landId, status: { in: ['PENDING_NOTARY', 'IN_PROGRESS'] } } });
      for (const t of active) {
        await tx.transfer.update({ where: { id: t.id }, data: { status: 'CANCELLED', notaryNote: note } });
        if (t.offerId) await tx.offer.update({ where: { id: t.offerId }, data: { status: 'CANCELLED' } });
        await notifyMany([t.buyerId, t.sellerId], 'TRANSFER_CANCELLED', { landId: t.landId, title: dispute.land.title, transferId: t.id, reason: note }, tx);
      }
    }
    await notifyMany([dispute.land.ownerId, dispute.claimantId], 'DISPUTE_RESOLVED', {
      disputeId: dispute.id,
      landId: dispute.landId,
      title: dispute.land.title,
      outcome,
    }, tx);
    await audit({ action: `DISPUTE_${outcome}`, entityType: 'Land', entityId: dispute.landId, metadata: { disputeId: dispute.id }, req }, tx);
    return chainBlock;
  });
  if (block) afterBlockCommitted(block);
  res.json({ dispute: withReference(await loadDispute(dispute.id)), block });
});

const liftSchema = z.object({ note: z.string().trim().min(10).max(5000) });

/** After an upheld dispute is settled officially (e.g. court decision), a notary lifts the freeze. */
router.post('/lands/:landId/unfreeze', notaryOnly, validateBody(liftSchema), async (req, res) => {
  const notaryId = currentUser(req).id;
  const holding = await prisma.dispute.findFirst({
    where: { landId: param(req, 'landId'), frozenAt: { not: null }, status: 'UPHELD' },
    include: disputeInclude,
  });
  if (!holding) throw badRequest('NOT_FROZEN', 'No settled dispute keeps this land frozen');
  assertIndependent(holding, notaryId);
  const { note } = req.body as z.infer<typeof liftSchema>;
  const w = await wallets(holding, notaryId);
  const block = await prisma.$transaction(async (tx) => {
    const upheld = await tx.dispute.findMany({ where: { landId: holding.landId, frozenAt: { not: null }, status: 'UPHELD' } });
    await tx.dispute.updateMany({ where: { id: { in: upheld.map((d) => d.id) } }, data: { frozenAt: null } });
    const released = await releaseFreeze(tx, holding, 'LIFTED', notaryId, w.notary);
    await audit({ action: 'LAND_UNFROZEN', entityType: 'Land', entityId: holding.landId, metadata: { note }, req }, tx);
    return released;
  });
  if (block) afterBlockCommitted(block);
  res.json({ ok: true, block });
});

export default router;
