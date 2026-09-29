import { useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Land, LandStatus, Page } from '@/api/types';
import { LandCard } from '@/components/LandCard';
import { ChipGroup, EmptyState, ErrorState, Loading } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';
import { errorMessage } from '@/utils/format';

type StatusFilter = LandStatus | 'ALL';
const STATUSES: LandStatus[] = ['PENDING_VERIFICATION', 'PUBLISHED', 'UNDER_OFFER', 'SOLD', 'REJECTED', 'DRAFT', 'ARCHIVED'];

export default function AdminLandsScreen() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');

  const query = useInfiniteQuery({
    queryKey: ['admin', 'lands', search, status],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (
        await api.get<Page<Land>>('/admin/lands', {
          params: { page: pageParam, q: search || undefined, status: status === 'ALL' ? undefined : status },
        })
      ).data,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });
  const lands = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg }}
      data={lands}
      keyExtractor={(l) => l.id}
      ListHeaderComponent={
        <View>
          <TextInput
            value={q}
            onChangeText={setQ}
            onSubmitEditing={() => setSearch(q.trim())}
            placeholder={t('admin.searchLands')}
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.md,
              fontSize: 16,
              marginBottom: spacing.md,
              color: colors.text,
            }}
          />
          <ChipGroup
            value={status}
            onChange={setStatus}
            options={[{ value: 'ALL' as StatusFilter, label: t('admin.all') }, ...STATUSES.map((s) => ({ value: s as StatusFilter, label: t(`status.${s}`) }))]}
          />
        </View>
      }
      renderItem={({ item }) => <LandCard land={item} showStatus />}
      ListEmptyComponent={
        query.isLoading ? <Loading /> : query.isError ? <ErrorState message={errorMessage(query.error)} /> : <EmptyState text={t('admin.empty')} />
      }
      onEndReached={() => query.hasNextPage && query.fetchNextPage()}
      refreshing={query.isRefetching}
      onRefresh={() => query.refetch()}
    />
  );
}
