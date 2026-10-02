import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { audit } from '../lib/audit';
import { guessOperator, normalizeCameroonPhone } from '../lib/payments/phone';
import { paymentProvider, ProviderRejectedError, verifyCampaySignature } from '../lib/payments/providers';
import { LISTING_FEE, listingFeeState, refreshPayment, withReceipt } from '../lib/payments/service';
import { authenticate, currentUser } from '../middleware/auth';
import { param, validateBody } from '../middleware/validate';
import { AppError, badRequest, conflict, forbidden, notFound } from '../utils/errors';
import { assertNotBlocked, assertNotFrozen, EDITABLE_STATUSES } from './lands.shared';

/**
 * Platform fees paid with MTN MoMo / Orange Money (through Campay). This is DLand's own revenue;
 * the money for a land sale never goes through the platform.
 */
const router = Router();

/** A payment started less than this ago is still being approved: don't start a second one. */
const RETRY_AFTER_MS = 90_000;

export const paymentInclude = { land: { select: { id: true, reference: true, title: true } } } satisfies Prisma.PaymentInclude;

// ---------------------------------------------------------------------------
// Campay webhook (no login: authenticated by its signature)
// ---------------------------------------------------------------------------

router.all('/webhooks/campay', async (req, res) => {
  const params: Record<string, unknown> = { ...(req.query as Record<string, unknown>), ...((req.body as Record<string, unknown> | undefined) ?? {}) };
  if (env.PAYMENT_PROVIDER !== 'campay' || !verifyCampaySignature(typeof params.signature === 'string' ? params.signature : undefined)) {
    res.status(401).json({ error: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' } });
    return;
  }
  const reference = typeof params.reference === 'string' ? params.reference : null;
  const payment = reference ? await prisma.payment.findUnique({ where: { reference } }) : null;
  // The callback only says "look again": the status is always read back from Campay's API.
  if (payment) await refreshPayment(payment, { force: true });
  res.json({ ok: true });
});

router.use(authenticate);

router.get('/config', (_req, res) => {
  res.json({ listingFee: LISTING_FEE, provider: paymentProvider.name, sandbox: paymentProvider.sandbox });
});

// ---------------------------------------------------------------------------
// Listing fee
// ---------------------------------------------------------------------------

const listingFeeSchema = z.object({ landId: z.string().uuid(), phone: z.string().trim().min(1).max(20) });

router.post('/listing-fee', validateBody(listingFeeSchema), async (req, res) => {
  const me = currentUser(req);
  const body = req.body as z.infer<typeof listingFeeSchema>;
  if (LISTING_FEE.amount === 0) throw badRequest('LISTING_FEE_NOT_REQUIRED', 'Listing is free');
  const phone = normalizeCameroonPhone(body.phone);
  if (!phone) throw badRequest('INVALID_PHONE', 'Enter an MTN or Orange mobile number (6XX XX XX XX)');

  const land = await prisma.land.findUnique({ where: { id: body.landId } });
  if (!land) throw notFound('LAND_NOT_FOUND', 'Land not found');
  if (land.ownerId !== me.id) throw forbidden('NOT_LAND_OWNER', 'You do not own this land');
  assertNotBlocked(land);
  assertNotFrozen(land);
  if (!EDITABLE_STATUSES.includes(land.status)) throw badRequest('LAND_NOT_EDITABLE', 'This listing cannot be submitted now');

  const state = await listingFeeState(land.id, me.id);
  if (state.paid) throw conflict('LISTING_FEE_ALREADY_PAID', 'The listing fee is already paid');
  if (state.pendingPaymentId) {
    const pending = await refreshPayment(await prisma.payment.findUniqueOrThrow({ where: { id: state.pendingPaymentId } }), { force: true });
    if (pending.status === 'SUCCESSFUL') throw conflict('LISTING_FEE_ALREADY_PAID', 'The listing fee is already paid');
    if (pending.status === 'PENDING' && Date.now() - pending.createdAt.getTime() < RETRY_AFTER_MS) {
      throw new AppError(409, 'PAYMENT_PENDING', 'A payment is waiting for approval on your phone', { paymentId: pending.id });
    }
  }

  // Saved first, so the provider's answer always finds its payment (external_reference = our id).
  const payment = await prisma.payment.create({
    data: {
      userId: me.id,
      landId: land.id,
      purpose: 'LISTING_FEE',
      amount: LISTING_FEE.amount,
      currency: LISTING_FEE.currency,
      phone,
      provider: paymentProvider.name,
      operator: guessOperator(phone),
    },
  });
  try {
    const started = await paymentProvider.collect({
      amount: payment.amount,
      currency: payment.currency,
      phone,
      description: `DLand listing fee ${land.reference}`,
      externalReference: payment.id,
    });
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: { reference: started.reference, ussdCode: started.ussdCode ?? null, operator: started.operator ?? payment.operator },
      include: paymentInclude,
    });
    await audit({ action: 'PAYMENT_STARTED', entityType: 'Payment', entityId: payment.id, metadata: { purpose: 'LISTING_FEE', landId: land.id, amount: payment.amount }, req });
    res.status(201).json({ payment: withReceipt(updated) });
  } catch (err) {
    const rejected = err instanceof ProviderRejectedError;
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: rejected ? 'REJECTED' : 'PROVIDER_UNAVAILABLE' } });
    console.warn(`[payments] collect failed for ${payment.id}:`, (err as Error).message);
    if (rejected) throw badRequest('PAYMENT_REJECTED', (err as Error).message);
    throw new AppError(503, 'PAYMENT_PROVIDER_UNAVAILABLE', 'Mobile money is unavailable right now. Try again in a few minutes.');
  }
});

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

router.get('/mine', async (req, res) => {
  const items = await prisma.payment.findMany({
    where: { userId: currentUser(req).id },
    include: paymentInclude,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ items: items.map(withReceipt) });
});

/** The app polls this while the payer approves on their phone; pending payments are re-checked with the provider. */
router.get('/:id', async (req, res) => {
  const me = currentUser(req);
  const payment = await prisma.payment.findUnique({ where: { id: param(req, 'id') } });
  if (!payment) throw notFound('PAYMENT_NOT_FOUND', 'Payment not found');
  if (payment.userId !== me.id && me.role !== 'ADMIN') throw forbidden();
  await refreshPayment(payment);
  const fresh = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, include: paymentInclude });
  res.json({ payment: withReceipt(fresh) });
});

export default router;
