import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { guessOperator } from './phone';

/**
 * Mobile money collection (MTN MoMo, Orange Money). The rest of the app only talks to this
 * interface, so changing provider means adding one implementation.
 */
export type ProviderStatus = 'PENDING' | 'SUCCESSFUL' | 'FAILED';

export interface CollectRequest {
  amount: number;
  currency: string;
  /** International format without "+", e.g. 2376XXXXXXXX */
  phone: string;
  description: string;
  /** Our payment id, echoed back by the provider */
  externalReference: string;
}

export interface CollectResult {
  reference: string;
  ussdCode?: string | null;
  operator?: string | null;
}

export interface StatusResult {
  status: ProviderStatus;
  operator?: string | null;
  operatorReference?: string | null;
  reason?: string | null;
}

export interface PaymentProvider {
  name: 'campay' | 'simulator';
  /** True when no real money moves (simulator, Campay demo). */
  sandbox: boolean;
  collect(req: CollectRequest): Promise<CollectResult>;
  status(payment: { reference: string; phone: string; createdAt: Date }): Promise<StatusResult>;
}

/** The provider refused the request (bad number, amount…): `message` can be shown to the payer. */
export class ProviderRejectedError extends Error {}
/** The provider could not be reached or failed: try again later. */
export class ProviderUnavailableError extends Error {}

// ---------------------------------------------------------------------------
// Campay (https://www.campay.net): one API for MTN MoMo and Orange Money in Cameroon
// ---------------------------------------------------------------------------

const CAMPAY_BASE =
  env.CAMPAY_BASE_URL?.replace(/\/$/, '') ??(env.CAMPAY_ENV === 'live' ? 'https://www.campay.net/api' : 'https://demo.campay.net/api');
let cachedToken: { value: string; expiresAt: number } | null = null;

async function campayToken(): Promise<string> {
  if (env.CAMPAY_TOKEN) return env.CAMPAY_TOKEN;
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  const res = await fetch(`${CAMPAY_BASE}/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: env.CAMPAY_USERNAME, password: env.CAMPAY_PASSWORD }),
    signal: AbortSignal.timeout(15_000),
  }).catch((err: Error) => {
    throw new ProviderUnavailableError(`Campay unreachable: ${err.message}`);
  });
  if (!res.ok) throw new ProviderUnavailableError(`Campay authentication failed (${res.status})`);
  const body = (await res.json()) as { token: string; expires_in?: number };
  // Renew a minute before it expires.
  cachedToken = { value: body.token, expiresAt: Date.now() + Math.max(60, (body.expires_in ?? 3600) - 60) * 1000 };
  return body.token;
}

async function campayCall<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown }, retry = true): Promise<T> {
  const res = await fetch(`${CAMPAY_BASE}${path}`, {
    method: init.method,
    headers: { Authorization: `Token ${await campayToken()}`, 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(20_000),
  }).catch((err: Error) => {
    throw new ProviderUnavailableError(`Campay unreachable: ${err.message}`);
  });
  if (res.status === 401 && retry && !env.CAMPAY_TOKEN) {
    cachedToken = null;
    return campayCall(path, init, false);
  }
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // non-JSON error page
  }
  if (res.status >= 500 || res.status === 401) throw new ProviderUnavailableError(`Campay error ${res.status}`);
  if (!res.ok) {
    const message = [body.message, body.detail, body.error_code].find((v) => typeof v === 'string');
    throw new ProviderRejectedError((message as string | undefined) ?? `Payment refused (${res.status})`);
  }
  return body as T;
}

const campay: PaymentProvider = {
  name: 'campay',
  sandbox: env.CAMPAY_ENV !== 'live',
  async collect(req) {
    const body = await campayCall<{ reference: string; ussd_code?: string; operator?: string }>('/collect/', {
      method: 'POST',
      body: {
        amount: String(req.amount),
        currency: req.currency,
        from: req.phone,
        description: req.description,
        external_reference: req.externalReference,
      },
    });
    if (!body.reference) throw new ProviderUnavailableError('Campay returned no reference');
    return { reference: body.reference, ussdCode: body.ussd_code ?? null, operator: body.operator ?? null };
  },
  async status({ reference }) {
    const body = await campayCall<{ status?: string; operator?: string; operator_reference?: string; reason?: string }>(
      `/transaction/${encodeURIComponent(reference)}/`,
      { method: 'GET' },
    );
    const status: ProviderStatus = body.status === 'SUCCESSFUL' ? 'SUCCESSFUL' : body.status === 'FAILED' ? 'FAILED' : 'PENDING';
    return { status, operator: body.operator ?? null, operatorReference: body.operator_reference ?? null, reason: body.reason ?? null };
  },
};

/** Campay signs each webhook call with a JWT made with the app's webhook key. */
export function verifyCampaySignature(signature: string | undefined): boolean {
  if (!signature || !env.CAMPAY_WEBHOOK_KEY) return false;
  try {
    jwt.verify(signature, env.CAMPAY_WEBHOOK_KEY, { algorithms: ['HS256', 'HS384', 'HS512'] });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Simulator (development): approves after a few seconds, like a payer confirming on their phone.
// Numbers ending in 99 simulate a failed payment (e.g. insufficient balance).
// ---------------------------------------------------------------------------

const SIMULATED_DELAY_MS = 5_000;

const simulator: PaymentProvider = {
  name: 'simulator',
  sandbox: true,
  async collect(req) {
    const operator = guessOperator(req.phone);
    return {
      reference: `SIM-${crypto.randomUUID()}`,
      operator,
      ussdCode: operator === 'ORANGE' ? '#150*50#' : '*126#',
    };
  },
  async status({ phone, createdAt }) {
    if (Date.now() - createdAt.getTime() < SIMULATED_DELAY_MS) return { status: 'PENDING' };
    if (phone.endsWith('99')) return { status: 'FAILED', reason: 'INSUFFICIENT_FUNDS' };
    return { status: 'SUCCESSFUL', operator: guessOperator(phone), operatorReference: `SIMOP${createdAt.getTime()}` };
  },
};

export const paymentProvider: PaymentProvider = env.PAYMENT_PROVIDER === 'campay' ? campay : simulator;
