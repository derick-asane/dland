import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, type Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { AppNotification, NotificationType, Page } from '@/api/types';
import { EmptyState, ErrorState, Loading, type IconName } from '@/components/ui';
import { colors, font, spacing } from '@/theme';
import { errorMessage, formatDate } from '@/utils/format';

const icons: Record<NotificationType, IconName> = {
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
  SYSTEM: 'megaphone-outline',
};

/** Where tapping a notification leads. */
function target(n: AppNotification): Href | null {
  const d = n.data ?? {};
  if (n.type === 'NEW_MESSAGE' && d.conversationId) return `/chat/${d.conversationId}`;
  if (n.type === 'OFFER_RECEIVED' || n.type === 'OFFER_WITHDRAWN') return '/offers';
  // Every step of a sale opens its sale file.
  if (n.type !== 'TRANSFER_PENDING' && n.type.startsWith('TRANSFER_') && d.transferId) return `/transfer/${d.transferId}`;
  if ((n.type.startsWith('PAYMENT_') || n.type === 'TITLE_REGISTERED' || n.type === 'OFFER_ACCEPTED') && d.transferId) {
    return `/transfer/${d.transferId}`;
  }
  if (n.type === 'NEW_REVIEW') return '/transfers';
  if (n.type === 'LAND_SUBMITTED' || n.type === 'TRANSFER_PENDING') return '/notary';
  if (n.type === 'SYSTEM' && d.kind === 'NEW_REPORT') return '/admin/reports';
  if (d.landId) return `/land/${d.landId}`;
  return null;
}

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ['notifications', 'list'],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => (await api.get<Page<AppNotification>>('/notifications', { params: { page: pageParam } })).data,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  const readAll = useMutation({ mutationFn: () => api.post('/notifications/read-all'), onSuccess: invalidate });
  const read = useMutation({ mutationFn: (id: string) => api.post(`/notifications/${id}/read`), onSuccess: invalidate });

  const text = (n: AppNotification) => {
    const data: Record<string, string | number | null> = { title: '', reason: '', ...(n.data ?? {}) };
    if (n.type === 'SYSTEM' && data.kind === 'NEW_REPORT') return t('notifications.SYSTEM_NEW_REPORT', data);
    return t(`notifications.${n.type}`, data);
  };

  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => readAll.mutate()} hitSlop={8}>
              <Ionicons name="checkmark-done" size={24} color={colors.primary} accessibilityLabel={t('notifications.markAllRead')} />
            </Pressable>
          ),
        }}
      />
      <FlatList
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ flexGrow: 1 }}
        data={items}
        keyExtractor={(n) => n.id}
        ListEmptyComponent={<EmptyState icon="notifications-off-outline" text={t('notifications.empty')} />}
        onEndReached={() => query.hasNextPage && query.fetchNextPage()}
        refreshing={query.isRefetching}
        onRefresh={() => query.refetch()}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.row, !item.readAt && { backgroundColor: colors.primaryLight }]}
            onPress={() => {
              if (!item.readAt) read.mutate(item.id);
              const href = target(item);
              if (href) router.push(href);
            }}
          >
            <Ionicons name={icons[item.type]} size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[font.body, !item.readAt && { fontWeight: '600' }]}>{text(item)}</Text>
              <Text style={font.small}>{formatDate(item.createdAt, true)}</Text>
            </View>
          </Pressable>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
