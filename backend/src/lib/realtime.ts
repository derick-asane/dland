import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import type { Role } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from './prisma';

/**
 * Live connection between the API and the apps (Socket.IO).
 * Each signed-in user joins a private room `user:<id>`; the API pushes chat messages, read
 * receipts and new notifications to it. Clients only send "typing" signals.
 */
let io: Server | null = null;

const room = (userId: string) => `user:${userId}`;

export function attachRealtime(server: HttpServer) {
  io = new Server(server, {
    cors: { origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',') },
  });

  // Same access token as the REST API; an expired token makes the client refresh and reconnect.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error('UNAUTHORIZED'));
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as { sub: string; role: Role };
      const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, isActive: true } });
      if (!user?.isActive) return next(new Error('UNAUTHORIZED'));
      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error('TOKEN_INVALID'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    void socket.join(room(userId));

    // "is typing…" goes only to the other participant of a conversation the sender belongs to.
    socket.on('typing', async (payload: { conversationId?: unknown }) => {
      if (typeof payload?.conversationId !== 'string') return;
      const conversation = await prisma.conversation.findUnique({
        where: { id: payload.conversationId },
        select: { buyerId: true, sellerId: true },
      });
      if (!conversation || (conversation.buyerId !== userId && conversation.sellerId !== userId)) return;
      const other = conversation.buyerId === userId ? conversation.sellerId : conversation.buyerId;
      io?.to(room(other)).emit('typing', { conversationId: payload.conversationId, userId });
    });
  });
  return io;
}

/** Sends an event to every connected device of a user (no-op when the user is offline). */
export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(room(userId)).emit(event, payload);
}

export function closeRealtime() {
  return new Promise<void>((resolve) => (io ? io.close(() => resolve()) : resolve()));
}
