import { useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { AuditLog, Page } from '@/api/types';
import { Badge, ChipGroup, EmptyState, ErrorState, Loading } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme';
import { errorMessage, formatDate, fullName } from '@/utils/format';

const ENTITY_TYPES = ['ALL', 'User', 'Land', 'Transfer', 'Offer', 'Report'] as const;
type Entity = (typeof ENTITY_TYPES)[number];

/** Append-only trail of every sensitive action on the platform. */
export default function AuditScreen() {
  const { t } = useTranslation();
  const [entity, setEntity] = useState<Entity>('ALL');
  const query = useInfiniteQuery({
    queryKey: ['admin', 'audit', entity],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (await api.get<Page<AuditLog>>('/admin/audit-logs', { params: { page: pageParam, entityType: entity === 'ALL' ? undefined : entity } })).data,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg }}
      data={items}
      keyExtractor={(a) => a.id}
      ListHeaderComponent={
        <ChipGroup value={entity} onChange={setEntity} options={ENTITY_TYPES.map((e) => ({ value: e, label: e === 'ALL' ? t('admin.all') : e }))} />
      }
      renderItem={({ item }) => (
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
            <Text style={[font.h3, { flex: 1 }]}>{item.action}</Text>
            <Badge label={item.entityType} />
          </View>
          <Text style={font.small}>
            {item.actor ? `${fullName(item.actor)} (${t(`roles.${item.actor.role}`)})` : '—'} · {formatDate(item.createdAt, true)}
          </Text>
          {item.metadata ? (
            <Text style={[font.mono, { color: colors.textMuted, marginTop: 4 }]} numberOfLines={3}>
              {JSON.stringify(item.metadata)}
            </Text>
          ) : null}
          {item.ip ? <Text style={[font.small, { fontSize: 11 }]}>IP {item.ip}</Text> : null}
        </View>
      )}
      ListEmptyComponent={
        query.isLoading ? <Loading /> : query.isError ? <ErrorState message={errorMessage(query.error)} /> : <EmptyState text={t('admin.empty')} />
      }
      onEndReached={() => query.hasNextPage && query.fetchNextPage()}
      refreshing={query.isRefetching}
      onRefresh={() => query.refetch()}
    />
  );
}
