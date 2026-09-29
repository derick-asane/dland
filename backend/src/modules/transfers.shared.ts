import type { Prisma, Transfer, TransferStepType } from '@prisma/client';
import type { AuthUser } from '../middleware/auth';
import { forbidden } from '../utils/errors';
import { publicUserSelect } from '../utils/serialize';

/** Short code the buyer writes in the bank / Mobile Money transfer so the notary can match it. */
export const transferReference = (id: string) => `DL-TR-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

export const PAYMENT_STEPS: TransferStepType[] = ['DEPOSIT', 'BALANCE'];

export const escrowSelect = {
  escrowBankName: true,
  escrowAccountName: true,
  escrowAccountNumber: true,
  escrowMobileMoney: true,
} satisfies Prisma.UserSelect;

export const transferInclude = {
  land: { include: { images: { orderBy: { position: 'asc' as const }, take: 1 } } },
  seller: { select: publicUserSelect },
  buyer: { select: publicUserSelect },
  notary: { select: publicUserSelect },
  block: { select: { index: true, hash: true, timestamp: true, anchorTxHash: true } },
  review: true,
  steps: { orderBy: { position: 'asc' as const } },
} satisfies Prisma.TransferInclude;

/** Full file: parties' contacts and the notary's escrow account (payment instructions). */
export const transferDetailInclude = {
  ...transferInclude,
  seller: { select: { ...publicUserSelect, phone: true } },
  buyer: { select: { ...publicUserSelect, phone: true } },
  notary: { select: { ...publicUserSelect, phone: true, email: true, licenseNumber: true, ...escrowSelect } },
  steps: {
    orderBy: { position: 'asc' as const },
    include: { block: { select: { index: true, hash: true } } },
  },
} satisfies Prisma.TransferInclude;

/** Buyer, seller, the assigned notary, any notary while the file is unclaimed, and admins. */
export function assertCanViewTransfer(t: Pick<Transfer, 'buyerId' | 'sellerId' | 'notaryId' | 'status'>, user: AuthUser) {
  const allowed =
    user.id === t.buyerId ||
    user.id === t.sellerId ||
    user.id === t.notaryId ||
    user.role === 'ADMIN' ||
    (user.role === 'NOTARY' && t.status === 'PENDING_NOTARY');
  if (!allowed) throw forbidden();
}

/** Milestones created when a notary takes the file; the deposit step is skipped when it is 0. */
export function initialSteps(price: Prisma.Decimal, deposit: Prisma.Decimal) {
  const steps: { type: TransferStepType; position: number; amount?: Prisma.Decimal }[] = [];
  if (deposit.gt(0)) steps.push({ type: 'DEPOSIT', position: 1, amount: deposit });
  steps.push({ type: 'BALANCE', position: 2, amount: price.minus(deposit) });
  steps.push({ type: 'DEED_SIGNED', position: 3 });
  steps.push({ type: 'REGISTERED', position: 4 });
  return steps;
}
