import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { notify } from '../lib/notify';
import { emitToUser } from '../lib/realtime';
import { authenticate, currentUser } from '../middleware/auth';
import { param, parseQuery, validateBody } from '../middleware/validate';
import { badRequest, forbidden, notFound } from '../utils/errors';
import { publicUserSelect } from '../utils/serialize';
import { canViewLand } from './lands.shared';

/** Buyer ↔ seller messaging, one conversation per (land, buyer). */
const router = Router();
router.use(authenticate);

const conversationInclude = {
  land: { select: { id: true, title: true, reference: true, images: { orderBy: { position: 'asc' as const }, take: 1 } } },
  buyer: { select: publicUserSelect },
  seller: { select: publicUserSelect },
  messages: { orderBy: { createdAt: 'desc' as const }, take: 1 },
};

router.get('/', async (req, res) => {
  const userId = currentUser(req).id;
  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
    include: conversationInclude,
    orderBy: { updatedAt: 'desc' },
  });
  const unread = await prisma.message.groupBy({
    by: ['conversationId'],
    where: { conversationId: { in: conversations.map((c) => c.id) }, senderId: { not: userId }, readAt: null },
    _count: true,
  });
  const unreadMap = new Map(unread.map((u) => [u.conversationId, u._count]));
  res.json({
    items: conversations.map(({ messages, ...c }) => ({
      ...c,
      lastMessage: messages[0] ?? null,
      unreadCount: unreadMap.get(c.id) ?? 0,
    })),
  });
});

const startSchema = z.object({ landId: z.string().uuid() });

router.post('/', validateBody(startSchema), async (req, res) => {
  const me = currentUser(req);
  const { landId } = req.body as z.infer<typeof startSchema>;
  const land = await prisma.land.findUnique({ where: { id: landId } });
  if (!land || !canViewLand(land, me)) throw notFound('LAND_NOT_FOUND', 'Land not found');
  if (land.ownerId === me.id) throw badRequest('OWN_LAND', 'You cannot message yourself');
  const conversation = await prisma.conversation.upsert({
    where: { landId_buyerId: { landId, buyerId: me.id } },
    create: { landId, buyerId: me.id, sellerId: land.ownerId },
    update: {},
    include: conversationInclude,
  });
  res.status(201).json({ conversation });
});

async function participantConversation(id: string, userId: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id }, include: conversationInclude });
  if (!conversation) throw notFound('CONVERSATION_NOT_FOUND', 'Conversation not found');
  if (conversation.buyerId !== userId && conversation.sellerId !== userId) throw forbidden();
  return conversation;
}

const messagesQuery = z.object({ before: z.string().datetime().optional() });

router.get('/:id/messages', async (req, res) => {
  const userId = currentUser(req).id;
  const conversation = await participantConversation(param(req, 'id'), userId);
  const { before } = parseQuery(messagesQuery, req);
  const messages = await prisma.message.findMany({
    where: { conversationId: conversation.id, createdAt: before ? { lt: new Date(before) } : undefined },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const readAt = new Date();
  const read = await prisma.message.updateMany({
    where: { conversationId: conversation.id, senderId: { not: userId }, readAt: null },
    data: { readAt },
  });
  // Read receipt: the other person's "Seen" appears instantly.
  if (read.count > 0) {
    const other = conversation.buyerId === userId ? conversation.sellerId : conversation.buyerId;
    emitToUser(other, 'messages:read', { conversationId: conversation.id, readAt });
  }
  const { messages: _last, ...meta } = conversation;
  res.json({ conversation: meta, items: messages });
});

const sendSchema = z.object({ body: z.string().trim().min(1).max(4000) });

router.post('/:id/messages', validateBody(sendSchema), async (req, res) => {
  const userId = currentUser(req).id;
  const conversation = await participantConversation(param(req, 'id'), userId);
  const { body } = req.body as z.infer<typeof sendSchema>;
  const [message] = await prisma.$transaction([
    prisma.message.create({ data: { conversationId: conversation.id, senderId: userId, body } }),
    prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } }),
  ]);
  const recipient = conversation.buyerId === userId ? conversation.sellerId : conversation.buyerId;
  const sender = conversation.buyerId === userId ? conversation.buyer : conversation.seller;
  // Instant delivery to the recipient, and to the sender's other devices.
  for (const user of [recipient, userId]) emitToUser(user, 'message:new', { conversationId: conversation.id, message });
  await notify(recipient, 'NEW_MESSAGE', {
    conversationId: conversation.id,
    title: conversation.land.title,
    from: `${sender.firstName} ${sender.lastName}`,
  });
  res.status(201).json({ message });
});

export default router;
