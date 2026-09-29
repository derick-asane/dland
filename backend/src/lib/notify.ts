import type { NotificationType, Prisma } from '@prisma/client';
import { prisma, type Tx } from './prisma';

/**
 * Notifications store a type + data; the mobile app renders the translated text
 * (notifications.<TYPE>) so every user sees them in their own language.
 */
export function notify(userId: string, type: NotificationType, data: Prisma.InputJsonValue = {}, db: Tx = prisma) {
  return db.notification.create({ data: { userId, type, data } });
}

export async function notifyMany(
  userIds: string[],
  type: NotificationType,
  data: Prisma.InputJsonValue = {},
  db: Tx = prisma,
) {
  if (userIds.length === 0) return;
  await db.notification.createMany({ data: userIds.map((userId) => ({ userId, type, data })) });
}

export async function notifyRole(
  role: 'NOTARY' | 'ADMIN',
  type: NotificationType,
  data: Prisma.InputJsonValue = {},
  db: Tx = prisma,
) {
  const users = await db.user.findMany({ where: { role, isActive: true }, select: { id: true } });
  await notifyMany(
    users.map((u) => u.id),
    type,
    data,
    db,
  );
}
