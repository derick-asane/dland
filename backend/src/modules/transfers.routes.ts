import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { audit } from '../lib/audit';
import { notify } from '../lib/notify';
import { privateStorage } from '../lib/storage';
import { authenticate, currentUser } from '../middleware/auth';
import { discardIncoming, privateUpload, storePrivate } from '../middleware/upload';
import { param, validateBody } from '../middleware/validate';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors';
import {
  assertCanViewTransfer,
  PAYMENT_STEPS,
  transferDetailInclude,
  transferInclude,
  transferReference,
} from './transfers.shared';

/**
 * A sale file. DLand never receives money: the buyer pays the notary's escrow account
 * off-platform and uploads the receipt here; the notary confirms each payment.
 */
const router = Router();
router.use(authenticate);

// Kept for other modules that import it from here.
export { transferInclude };

/** Purchases and sales of the current user. */
router.get('/mine', async (req, res) => {
  const userId = currentUser(req).id;
  const transfers = await prisma.transfer.findMany({
    where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
    include: transferInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json({ items: transfers.map((t) => ({ ...t, reference: transferReference(t.id) })) });
});

router.get('/:id', async (req, res) => {
  const transfer = await prisma.transfer.findUnique({ where: { id: param(req, 'id') }, include: transferDetailInclude });
  if (!transfer) throw notFound('TRANSFER_NOT_FOUND', 'Transfer not found');
  assertCanViewTransfer(transfer, currentUser(req));
  res.json({ transfer: { ...transfer, reference: transferReference(transfer.id) } });
});

const proofBody = z.object({ paymentReference: z.string().trim().max(120).optional() });

/** The buyer uploads the receipt of an off-platform payment (deposit or balance). Stored privately. */
router.post('/:id/steps/:stepId/proof', privateUpload.single('proof'), async (req, res) => {
  const file = req.file;
  try {
    const me = currentUser(req);
    const transfer = await prisma.transfer.findUnique({
      where: { id: param(req, 'id') },
      include: { land: true, steps: { omit: { proofKey: false } } },
    });
    if (!transfer) throw notFound('TRANSFER_NOT_FOUND', 'Transfer not found');
    if (transfer.buyerId !== me.id) throw forbidden('NOT_BUYER', 'Only the buyer uploads payment receipts');
    if (transfer.status !== 'IN_PROGRESS') throw badRequest('TRANSFER_NOT_IN_PROGRESS', 'This sale is not awaiting payments');
    const step = transfer.steps.find((s) => s.id === param(req, 'stepId'));
    if (!step || !PAYMENT_STEPS.includes(step.type)) throw notFound('STEP_NOT_FOUND', 'Payment step not found');
    if (step.status === 'CONFIRMED') throw conflict('STEP_ALREADY_CONFIRMED', 'This payment is already confirmed');
    if (!file) throw badRequest('FILE_REQUIRED', 'Upload the payment receipt');
    const { paymentReference } = proofBody.parse(req.body);
    const stored = await storePrivate(file);

    const updated = await prisma.transferStep.update({
      where: { id: step.id },
      data: {
        status: 'SUBMITTED',
        proofKey: stored.key,
        proofName: file.originalname,
        proofMime: file.mimetype,
        proofSha256: stored.sha256,
        paymentReference: paymentReference || null,
        submittedById: me.id,
        submittedAt: new Date(),
        note: null,
      },
    });
    // A re-upload after a rejection replaces the previous receipt.
    if (step.proofKey) await privateStorage.remove(step.proofKey);
    if (transfer.notaryId) {
      await notify(transfer.notaryId, 'PAYMENT_PROOF_SUBMITTED', {
        transferId: transfer.id,
        title: transfer.land.title,
        step: step.type,
        amount: step.amount?.toString() ?? null,
        currency: transfer.currency,
      });
    }
    await audit({ action: 'PAYMENT_PROOF_SUBMITTED', entityType: 'Transfer', entityId: transfer.id, metadata: { step: step.type }, req });
    res.status(201).json({ step: updated });
  } catch (err) {
    discardIncoming(file);
    throw err;
  }
});

/**
 * A temporary link to open a payment receipt: buyer, seller, the assigned notary and admins.
 * Every access is written to the audit log.
 */
router.get('/:id/steps/:stepId/proof/link', async (req, res) => {
  const transfer = await prisma.transfer.findUnique({ where: { id: param(req, 'id') } });
  if (!transfer) throw notFound('TRANSFER_NOT_FOUND', 'Transfer not found');
  assertCanViewTransfer(transfer, currentUser(req));
  const step = await prisma.transferStep.findFirst({
    where: { id: param(req, 'stepId'), transferId: transfer.id },
    omit: { proofKey: false },
  });
  if (!step?.proofKey) throw notFound('DOCUMENT_NOT_FOUND', 'No receipt for this step');
  const link = privateStorage.signedUrl(step.proofKey);
  await audit({ action: 'RECEIPT_OPENED', entityType: 'Transfer', entityId: transfer.id, metadata: { step: step.type }, req });
  res.json(link);
});

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
});

/** Buyers can rate the seller once the notary has completed the transfer. */
router.post('/:id/review', validateBody(reviewSchema), async (req, res) => {
  const me = currentUser(req);
  const transfer = await prisma.transfer.findUnique({ where: { id: param(req, 'id') }, include: { review: true, land: true } });
  if (!transfer) throw notFound('TRANSFER_NOT_FOUND', 'Transfer not found');
  if (transfer.buyerId !== me.id) throw forbidden('NOT_BUYER', 'Only the buyer can review this sale');
  if (transfer.status !== 'COMPLETED') throw badRequest('TRANSFER_NOT_COMPLETED', 'The transfer is not completed yet');
  if (transfer.review) throw conflict('ALREADY_REVIEWED', 'You already reviewed this sale');

  const body = req.body as z.infer<typeof reviewSchema>;
  const review = await prisma.review.create({
    data: { transferId: transfer.id, sellerId: transfer.sellerId, authorId: me.id, rating: body.rating, comment: body.comment },
  });
  await notify(transfer.sellerId, 'NEW_REVIEW', { rating: body.rating, title: transfer.land.title });
  res.status(201).json({ review });
});

export default router;
