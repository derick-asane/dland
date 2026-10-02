import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { AppNotification, Page } from '@/api/types';
import { EmptyState, ErrorState, Loading } from '@/components/ui';
import { colors, font, spacing } from '@/theme';
import { errorMessage, formatDate } from '@/utils/format';
import { notificationIcons, notificationTarget, notificationText } from '@/utils/notifications';

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

  const text = (n: AppNotification) => notificationText(t, n);

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
              const href = notificationTarget(item.type, item.data);
              if (href) router.push(href);
            }}
          >
            <Ionicons name={notificationIcons[item.type]} size={22} color={colors.primary} />
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
