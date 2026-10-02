import type { Payment } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../prisma';
import { audit } from '../audit';
import { notify } from '../notify';
import { paymentProvider, type StatusResult } from './providers';

export const LISTING_FEE = { amount: env.LISTING_FEE_AMOUNT, currency: env.LISTING_FEE_CURRENCY };

/** A payment the payer never approved is closed after this delay. */
export const PAYMENT_EXPIRY_MS = 15 * 60 * 1000;
/** Do not ask the provider about the same payment more often than this. */
const REFRESH_THROTTLE_MS = 2_500;

export const receiptNumber = (id: string) => `DL-PY-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
export const withReceipt = <T extends { id: string }>(p: T) => ({ ...p, receipt: receiptNumber(p.id) });

/**
 * The listing fee is paid once per owner and listing: resubmitting after a rejection or relisting
 * your own archived land is free; a new owner relisting a land they bought pays again.
 */
export async function listingFeeState(landId: string, ownerId: string) {
  if (LISTING_FEE.amount === 0) return { required: false, ...LISTING_FEE, paid: true, paymentId: null, pendingPaymentId: null };
  const [paid, pending] = await Promise.all([
    prisma.payment.findFirst({ where: { landId, userId: ownerId, purpose: 'LISTING_FEE', status: 'SUCCESSFUL' }, select: { id: true } }),
    prisma.payment.findFirst({
      where: { landId, userId: ownerId, purpose: 'LISTING_FEE', status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    }),
  ]);
  return { required: true, ...LISTING_FEE, paid: Boolean(paid), paymentId: paid?.id ?? null, pendingPaymentId: pending?.id ?? null };
}

/**
 * Records the provider's final answer exactly once (webhook, polling and the background check can
 * all report the same result), then notifies the payer.
 */
async function applyResult(payment: Payment, result: StatusResult & { status: 'SUCCESSFUL' | 'FAILED' }) {
  return prisma.$transaction(async (tx) => {
    const changed = await tx.payment.updateMany({
      where: { id: payment.id, status: 'PENDING' },
      data: {
        status: result.status,
        operator: result.operator ?? payment.operator,
        operatorReference: result.operatorReference ?? null,
        failureReason: result.status === 'FAILED' ? (result.reason ?? 'FAILED') : null,
        paidAt: result.status === 'SUCCESSFUL' ? new Date() : null,
      },
    });
    if (changed.count === 1 && payment.landId) {
      const land = await tx.land.findUnique({ where: { id: payment.landId }, select: { id: true, title: true } });
      const data = { landId: payment.landId, title: land?.title ?? '', paymentId: payment.id, amount: payment.amount, currency: payment.currency };
      if (result.status === 'SUCCESSFUL') {
        await notify(payment.userId, 'LISTING_FEE_PAID', { ...data, receipt: receiptNumber(payment.id) }, tx);
      } else {
        await notify(payment.userId, 'LISTING_FEE_FAILED', { ...data, reason: result.reason ?? 'FAILED' }, tx);
      }
      await audit(
        {
          actorId: payment.userId,
          action: result.status === 'SUCCESSFUL' ? 'PAYMENT_SUCCEEDED' : 'PAYMENT_FAILED',
          entityType: 'Payment',
          entityId: payment.id,
          metadata: { purpose: payment.purpose, amount: payment.amount, currency: payment.currency, reference: payment.reference, reason: result.reason ?? null },
        },
        tx,
      );
    }
    return tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
  });
}

/** Asks the provider for the latest status of a pending payment and records it. */
export async function refreshPayment(payment: Payment, { force = false } = {}): Promise<Payment> {
  if (payment.status !== 'PENDING') return payment;
  const age = Date.now() - payment.createdAt.getTime();
  // The collection request never reached the provider (crash between the two steps).
  if (!payment.reference) {
    return age > 2 * 60 * 1000 ? applyResult(payment, { status: 'FAILED', reason: 'NOT_STARTED' }) : payment;
  }
  if (!force && Date.now() - payment.updatedAt.getTime() < REFRESH_THROTTLE_MS) return payment;
  // Started with another provider (the configuration changed since): only that provider knows its status.
  if (payment.provider !== paymentProvider.name) return payment;

  let result: StatusResult;
  try {
    result = await paymentProvider.status({ reference: payment.reference, phone: payment.phone, createdAt: payment.createdAt });
  } catch (err) {
    console.warn(`[payments] status check failed for ${payment.id}:`, (err as Error).message);
    return payment;
  }
  if (result.status === 'PENDING') {
    if (age > PAYMENT_EXPIRY_MS) return applyResult(payment, { status: 'FAILED', reason: 'EXPIRED' });
    // Touch it, so the throttle and the background check know it was just checked.
    return prisma.payment.update({ where: { id: payment.id }, data: { operator: result.operator ?? payment.operator } });
  }
  return applyResult(payment, { ...result, status: result.status });
}

// ---------------------------------------------------------------------------
// Background check: webhooks can be lost (and cannot reach a development PC), so pending
// payments are also checked every few seconds until they succeed, fail or expire.
// ---------------------------------------------------------------------------

const RECONCILE_EVERY_MS = 5_000;
let timer: NodeJS.Timeout | null = null;
let running = false;

async function reconcileOnce() {
  if (running) return;
  running = true;
  try {
    const pending = await prisma.payment.findMany({
      where: { status: 'PENDING', provider: paymentProvider.name, updatedAt: { lt: new Date(Date.now() - 4_000) } },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    for (const p of pending) await refreshPayment(p, { force: true });
  } catch (err) {
    console.error('[payments] background check failed:', err);
  } finally {
    running = false;
  }
}

export function startPaymentReconciler() {
  if (timer) return;
  timer = setInterval(() => void reconcileOnce(), RECONCILE_EVERY_MS);
  timer.unref();
}

export function stopPaymentReconciler() {
  if (timer) clearInterval(timer);
  timer = null;
}
