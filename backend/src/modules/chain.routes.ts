import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { landHistory, verifyBlock, verifyChain } from '../blockchain/ledger';
import { publicKeyPem } from '../blockchain/signer';
import { optionalAuth } from '../middleware/auth';
import { param, parseQuery } from '../middleware/validate';
import { notFound } from '../utils/errors';
import { pageResult, paginate, paginationSchema } from '../utils/pagination';
import { canViewLand } from './lands.shared';

/**
 * Public blockchain explorer. Everything here is readable without an account so that
 * buyers, banks or courts can independently check a parcel's ownership history.
 */
const router = Router();

router.get('/public-key', (_req, res) => {
  res.json({ algorithm: 'Ed25519', publicKeyPem });
});

router.get('/blocks', async (req, res) => {
  const { page, pageSize } = parseQuery(paginationSchema, req);
  const [items, total] = await Promise.all([
    prisma.block.findMany({
      orderBy: { index: 'desc' },
      include: { land: { select: { id: true, reference: true, title: true } } },
      ...paginate(page, pageSize),
    }),
    prisma.block.count(),
  ]);
  res.json(pageResult(items, total, page, pageSize));
});

router.get('/blocks/:hash', async (req, res) => {
  const block = await prisma.block.findUnique({
    where: { hash: param(req, 'hash') },
    include: {
      land: { select: { id: true, reference: true, title: true } },
      signer: { select: { id: true, firstName: true, lastName: true, walletAddress: true } },
    },
  });
  if (!block) throw notFound('BLOCK_NOT_FOUND', 'Block not found');
  const previous = block.index > 0 ? await prisma.block.findUnique({ where: { index: block.index - 1 } }) : null;
  const problems = verifyBlock(block, previous);
  res.json({ block, verified: problems.length === 0, problems });
});

/** Full-chain integrity check (hashes, links, signatures). */
router.get('/verify', async (_req, res) => {
  res.json(await verifyChain());
});

router.get('/lands/:id/history', optionalAuth, async (req, res) => {
  const land = await prisma.land.findUnique({ where: { id: param(req, 'id') } });
  if (!land || !canViewLand(land, req.user)) throw notFound('LAND_NOT_FOUND', 'Land not found');
  const history = await landHistory(land.id);
  // Resolve wallet addresses to display names for the ownership timeline.
  const wallets = new Set<string>();
  for (const b of history.blocks) {
    const data = b.data as Record<string, unknown>;
    for (const key of ['owner', 'from', 'to', 'payer'] as const) if (typeof data[key] === 'string') wallets.add(data[key] as string);
  }
  const owners = await prisma.user.findMany({
    where: { walletAddress: { in: [...wallets] } },
    select: { id: true, firstName: true, lastName: true, walletAddress: true, avatarUrl: true },
  });
  res.json({ land: { id: land.id, reference: land.reference, title: land.title }, ...history, parties: owners });
});

/**
 * Ownership certificate: resolves a land reference (e.g. from a QR code) to its current
 * owner and the chain proof backing it.
 */
router.get('/certificate/:reference', async (req, res) => {
  const land = await prisma.land.findUnique({
    where: { reference: param(req, 'reference').toUpperCase() },
    include: { owner: { select: { id: true, firstName: true, lastName: true, walletAddress: true } } },
  });
  if (!land || !land.registeredOnChain) throw notFound('CERTIFICATE_NOT_FOUND', 'No registered land with this reference');
  const history = await landHistory(land.id);
  const registration = history.blocks.find((b) => b.type === 'LAND_REGISTERED') ?? null;
  const lastTransfer = [...history.blocks].reverse().find((b) => b.type === 'OWNERSHIP_TRANSFERRED') ?? null;
  // Current owner = the latest block that names one (payment blocks don't).
  const ownerOf = (b: (typeof history.blocks)[number]) => {
    const d = b.data as Record<string, unknown>;
    return (d.to ?? d.owner) as string | undefined;
  };
  const latestOwnerBlock = [...history.blocks].reverse().find((b) => ownerOf(b));
  const chainOwner = latestOwnerBlock ? ownerOf(latestOwnerBlock) : null;
  res.json({
    reference: land.reference,
    title: land.title,
    parcelNumber: land.parcelNumber,
    titleDeedNumber: land.titleDeedNumber,
    city: land.city,
    country: land.country,
    areaSqm: land.areaSqm,
    boundaryHash: land.boundaryOnChain ? land.boundaryHash : null,
    boundaryAreaSqm: land.boundaryOnChain ? land.boundaryAreaSqm : null,
    owner: land.owner,
    // The database owner must match the owner recorded by the most recent block.
    ownerMatchesChain: chainOwner === land.owner.walletAddress,
    chainValid: history.valid,
    registration: registration && { index: registration.index, hash: registration.hash, timestamp: registration.timestamp },
    lastTransfer: lastTransfer && { index: lastTransfer.index, hash: lastTransfer.hash, timestamp: lastTransfer.timestamp },
    transfersCount: history.blocks.filter((b) => b.type === 'OWNERSHIP_TRANSFERRED').length,
    issuedAt: new Date(),
  });
});

export default router;
