import i18n, { localeTag } from '@/i18n';
import { apiErrorCode } from '@/api/client';

export function formatMoney(amount: string | number, currency = 'USD') {
  const value = typeof amount === 'string' ? Number(amount) : amount;
  try {
    return new Intl.NumberFormat(localeTag(), { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${value.toLocaleString()} ${currency}`;
  }
}

export function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat(localeTag(), { maximumFractionDigits: digits }).format(value);
}

export function formatDate(value: string | Date, withTime = false) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat(localeTag(), {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' as const } : {}),
  }).format(date);
}

export const shortHash = (hash?: string | null, size = 8) =>
  hash ? `${hash.slice(0, size)}…${hash.slice(-size / 2)}` : '—';

export const fullName = (u?: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}` : '');

/** Translated message for any API error (uses the stable error code sent by the backend). */
export function errorMessage(err: unknown): string {
  const code = apiErrorCode(err);
  const key = `errors.${code}`;
  return i18n.exists(key) ? i18n.t(key as 'errors.INTERNAL_ERROR') : i18n.t('errors.INTERNAL_ERROR');
}
