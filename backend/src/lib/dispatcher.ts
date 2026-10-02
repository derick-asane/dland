import { prisma } from './prisma';
import { emitToUser } from './realtime';
import { sendPush, type PushMessage } from './push';
import { pushText } from './pushMessages';

/**
 * Delivers new notifications live (socket) and as mobile push.
 *
 * Notifications are often created inside database transactions. Delivering them right away could
 * announce something that is then rolled back, so this loop only picks up committed rows
 * (`dispatchedAt` is null), claims them, and delivers them. Delay: about one interval.
 */
const INTERVAL_MS = 1500;
let timer: NodeJS.Timeout | null = null;
let running = false;

async function dispatchOnce() {
  if (running) return;
  running = true;
  try {
    const pending = await prisma.notification.findMany({
      where: { dispatchedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: { user: { select: { language: true, pushTokens: { select: { token: true } } } } },
    });
    if (!pending.length) return;
    // Claim first, so a second API instance never delivers the same notification twice.
    const claimed = await prisma.notification.updateMany({
      where: { id: { in: pending.map((n) => n.id) }, dispatchedAt: null },
      data: { dispatchedAt: new Date() },
    });
    if (claimed.count === 0) return;

    const pushes: PushMessage[] = [];
    for (const n of pending) {
      const { user, ...notification } = n;
      emitToUser(n.userId, 'notification:new', notification);
      const data = (n.data ?? {}) as Record<string, unknown>;
      const body = pushText(user.language, n.type, data);
      for (const { token } of user.pushTokens) {
        pushes.push({ to: token, title: 'DLand', body, data: { notificationId: n.id, type: n.type, ...data } });
      }
    }
    if (pushes.length) await sendPush(pushes);
  } catch (err) {
    console.error('[dispatcher]', err);
  } finally {
    running = false;
  }
}

export function startDispatcher() {
  timer ??= setInterval(() => void dispatchOnce(), INTERVAL_MS);
}

export function stopDispatcher() {
  if (timer) clearInterval(timer);
  timer = null;
}
