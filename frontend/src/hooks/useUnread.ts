import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Conversation } from '@/api/types';

/** Polls unread counters for tab/header badges. */
export function useUnreadNotifications() {
  return useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: async () => (await api.get<{ count: number }>('/notifications/unread-count')).data.count,
    // Updated live; this slow poll is only a fallback if the live connection drops.
    refetchInterval: 60_000,
  });
}

export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: async () => (await api.get<{ items: Conversation[] }>('/conversations')).data.items,
    refetchInterval: 60_000,
  });
}
