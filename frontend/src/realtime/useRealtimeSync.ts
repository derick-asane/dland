import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { AppNotification, Conversation, Message } from '@/api/types';
import { enablePush, showLiveNotification, usePushNavigation } from '@/notifications/push';
import { notificationTarget, notificationText } from '@/utils/notifications';
import { connectRealtime, disconnectRealtime } from './socket';
import { useTypingStore } from './typing';

interface MessagesPage {
  conversation: Conversation;
  items: Message[];
}

// Screens whose data a notification may change (a frozen land, a confirmed payment…).
const AFFECTED_QUERIES = [['land'], ['lands'], ['transfer'], ['transfers'], ['offers'], ['disputes'], ['dispute'], ['notary']];

/**
 * Keeps the signed-in app in sync with the live connection: chat messages, read receipts,
 * "typing…" and notifications arrive instantly instead of by polling.
 */
export function useRealtimeSync() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const signalTyping = useTypingStore((s) => s.signal);
  usePushNavigation();

  useEffect(() => {
    // Registers this device for push if the user already allowed it (no prompt here).
    void enablePush(false).catch(() => undefined);

    const socket = connectRealtime();

    socket.on('message:new', ({ conversationId, message }: { conversationId: string; message: Message }) => {
      queryClient.setQueryData<MessagesPage>(['messages', conversationId], (page) =>
        page ? { ...page, items: [message, ...page.items.filter((m) => m.id !== message.id)] } : page,
      );
      // An open chat refetches, which marks the message as read and sends the "Seen" receipt.
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });

    socket.on('messages:read', ({ conversationId }: { conversationId: string }) => {
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    });

    socket.on('typing', ({ conversationId }: { conversationId: string }) => signalTyping(conversationId));

    socket.on('notification:new', (n: AppNotification) => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      for (const queryKey of AFFECTED_QUERIES) void queryClient.invalidateQueries({ queryKey });
      showLiveNotification('DLand', notificationText(t, n), notificationTarget(n.type, n.data));
    });

    return () => disconnectRealtime();
  }, [queryClient, signalTyping, t]);
}
