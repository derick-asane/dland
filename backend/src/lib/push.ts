import { prisma } from './prisma';

/**
 * Mobile push notifications through Expo's push service (https://docs.expo.dev/push-notifications/sending-notifications/).
 * Devices register an Expo push token (POST /api/users/me/push-tokens). Expo forwards to Apple / Google.
 */
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100; // Expo accepts up to 100 messages per request

export const isExpoPushToken = (token: string) => /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface PushTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/** Sends push messages; tokens Expo reports as no longer registered are deleted. Never throws. */
export async function sendPush(messages: PushMessage[]) {
  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH).map((m) => ({ ...m, sound: 'default', priority: 'high' }));
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });
      const json = (await res.json()) as { data?: PushTicket[]; errors?: unknown };
      if (!res.ok || !json.data) {
        console.warn('[push] Expo rejected the request', res.status, json.errors ?? '');
        continue;
      }
      const dead = json.data
        .map((ticket, j) => (ticket.details?.error === 'DeviceNotRegistered' ? batch[j].to : null))
        .filter((t): t is string => Boolean(t));
      if (dead.length) await prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
    } catch (err) {
      console.warn('[push] could not reach Expo', (err as Error).message);
    }
  }
}
