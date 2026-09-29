import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { fileUrl } from '@/api/client';
import { useConversations } from '@/hooks/useUnread';
import { useAuth } from '@/store/auth';
import { EmptyState, ErrorState, Loading } from '@/components/ui';
import { colors, font, spacing } from '@/theme';
import { errorMessage, formatDate, fullName } from '@/utils/format';

export default function MessagesScreen() {
  const { t } = useTranslation();
  const me = useAuth((s) => s.user);
  const query = useConversations();

  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ flexGrow: 1 }}
      data={query.data}
      keyExtractor={(c) => c.id}
      refreshing={query.isRefetching}
      onRefresh={() => query.refetch()}
      ListEmptyComponent={<EmptyState icon="chatbubbles-outline" text={t('messages.empty')} />}
      renderItem={({ item }) => {
        const other = item.buyerId === me?.id ? item.seller : item.buyer;
        const unread = item.unreadCount ?? 0;
        return (
          <Pressable style={styles.row} onPress={() => router.push(`/chat/${item.id}`)}>
            <Image source={{ uri: fileUrl(item.land.images[0]?.url) }} style={styles.thumb} />
            <View style={{ flex: 1 }}>
              <View style={styles.titleRow}>
                <Text style={[font.h3, { flex: 1 }]} numberOfLines={1}>
                  {fullName(other)}
                </Text>
                {item.lastMessage ? <Text style={font.small}>{formatDate(item.lastMessage.createdAt)}</Text> : null}
              </View>
              <Text style={font.small} numberOfLines={1}>
                {item.land.title}
              </Text>
              <Text style={[font.body, unread > 0 && { fontWeight: '700' }]} numberOfLines={1}>
                {item.lastMessage
                  ? `${item.lastMessage.senderId === me?.id ? `${t('messages.you')}: ` : ''}${item.lastMessage.body}`
                  : t('messages.noMessages')}
              </Text>
            </View>
            {unread > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: colors.border },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: 11,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
