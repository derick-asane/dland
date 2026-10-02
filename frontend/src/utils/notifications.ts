import type { Href } from 'expo-router';
import type { TFunction } from 'i18next';
import type { AppNotification, NotificationType } from '@/api/types';
import type { IconName } from '@/components/ui';
import { formatDate } from '@/utils/format';

/** Shared by the notifications list, mobile push taps and browser notifications. */
export const notificationIcons: Record<NotificationType, IconName> = {
  LAND_SUBMITTED: 'document-text-outline',
  LAND_APPROVED: 'checkmark-circle-outline',
  LAND_REJECTED: 'close-circle-outline',
  OFFER_RECEIVED: 'pricetag-outline',
  OFFER_ACCEPTED: 'thumbs-up-outline',
  OFFER_REJECTED: 'thumbs-down-outline',
  OFFER_WITHDRAWN: 'return-down-back-outline',
  TRANSFER_PENDING: 'hourglass-outline',
  TRANSFER_COMPLETED: 'cube-outline',
  TRANSFER_CANCELLED: 'ban-outline',
  NEW_MESSAGE: 'chatbubble-outline',
  NEW_REVIEW: 'star-outline',
  TRANSFER_CLAIMED: 'briefcase-outline',
  PAYMENT_PROOF_SUBMITTED: 'receipt-outline',
  PAYMENT_CONFIRMED: 'checkmark-done-outline',
  PAYMENT_REJECTED: 'alert-circle-outline',
  TITLE_REGISTERED: 'library-outline',
  DISPUTE_OPENED: 'warning-outline',
  DISPUTE_TAKEN: 'ribbon-outline',
  DISPUTE_RESPONSE: 'chatbox-ellipses-outline',
  LAND_FROZEN: 'lock-closed-outline',
  LAND_UNFROZEN: 'lock-open-outline',
  DISPUTE_RESOLVED: 'shield-checkmark-outline',
  LAND_BLOCKED: 'ban-outline',
  LAND_UNBLOCKED: 'checkmark-circle-outline',
  VISIT_REQUESTED: 'walk-outline',
  VISIT_CONFIRMED: 'calendar-outline',
  VISIT_DECLINED: 'calendar-clear-outline',
  VISIT_CANCELLED: 'calendar-clear-outline',
  LISTING_FEE_PAID: 'wallet-outline',
  LISTING_FEE_FAILED: 'alert-circle-outline',
  SYSTEM: 'megaphone-outline',
};

type NotificationData = Record<string, unknown>;

/** Where tapping a notification leads. */
export function notificationTarget(type: NotificationType, data: NotificationData | null | undefined): Href | null {
  const d = data ?? {};
  const id = (key: string) => (typeof d[key] === 'string' ? (d[key] as string) : null);
  if (type === 'NEW_MESSAGE' && id('conversationId')) return `/chat/${id('conversationId')}`;
  if (type === 'OFFER_RECEIVED' || type === 'OFFER_WITHDRAWN') return '/offers';
  if (type.startsWith('VISIT_') && id('visitId')) return `/visit/${id('visitId')}`;
  // Fee paid: back to the last listing step, where the owner submits.
  if (type.startsWith('LISTING_FEE_') && id('landId')) return `/land/${id('landId')}/setup?step=review`;
  // Disputes and freezes open the dispute file.
  if ((type.startsWith('DISPUTE_') || type === 'LAND_FROZEN' || type === 'LAND_UNFROZEN') && id('disputeId')) {
    return `/dispute/${id('disputeId')}`;
  }
  // Every step of a sale opens its sale file.
  if (type !== 'TRANSFER_PENDING' && type.startsWith('TRANSFER_') && id('transferId')) return `/transfer/${id('transferId')}`;
  if ((type.startsWith('PAYMENT_') || type === 'TITLE_REGISTERED' || type === 'OFFER_ACCEPTED') && id('transferId')) {
    return `/transfer/${id('transferId')}`;
  }
  if (type === 'NEW_REVIEW') return '/transfers';
  if (type === 'LAND_SUBMITTED' || type === 'TRANSFER_PENDING') return '/notary';
  if (type === 'SYSTEM' && d.kind === 'NEW_REPORT') return '/admin/reports';
  if (id('landId')) return `/land/${id('landId')}`;
  return null;
}

/** Translated text of a notification, in the app's current language. */
export function notificationText(t: TFunction, n: Pick<AppNotification, 'type' | 'data'>) {
  const data: Record<string, string | number | null> = { title: '', reason: '', ...(n.data ?? {}) };
  if (n.type === 'SYSTEM' && data.kind === 'NEW_REPORT') return t('notifications.SYSTEM_NEW_REPORT', data);
  if (n.type === 'VISIT_CONFIRMED' && typeof data.scheduledAt === 'string') {
    return t('notifications.VISIT_CONFIRMED', { ...data, when: formatDate(data.scheduledAt, true) });
  }
  return t(`notifications.${n.type}`, data);
}
