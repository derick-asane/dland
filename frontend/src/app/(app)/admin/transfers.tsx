import { useState } from 'react';
import { FlatList } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Page, Transfer, TransferStatus } from '@/api/types';
import { TransferCard } from '@/components/TransferCard';
import { ChipGroup, EmptyState, ErrorState, Loading } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { errorMessage } from '@/utils/format';

type Filter = TransferStatus | 'ALL';
const STATUSES: TransferStatus[] = ['PENDING_NOTARY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

/** Every sale file on the platform; tapping one opens its full step history. */
export default function AdminTransfersScreen() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Filter>('ALL');
  const query = useInfiniteQuery({
    queryKey: ['admin', 'transfers', status],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (await api.get<Page<Transfer>>('/admin/transfers', { params: { page: pageParam, status: status === 'ALL' ? undefined : status } })).data,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg }}
      data={items}
      keyExtractor={(x) => x.id}
      ListHeaderComponent={
        <ChipGroup
          value={status}
          onChange={setStatus}
          options={[
            { value: 'ALL' as Filter, label: t('admin.all') },
            ...STATUSES.map((s) => ({ value: s as Filter, label: t(`transferStatus.${s}`) })),
          ]}
        />
      }
      renderItem={({ item }) => <TransferCard transfer={item} />}
      ListEmptyComponent={
        query.isLoading ? <Loading /> : query.isError ? <ErrorState message={errorMessage(query.error)} /> : <EmptyState text={t('admin.empty')} />
      }
      onEndReached={() => query.hasNextPage && query.fetchNextPage()}
      refreshing={query.isRefetching}
      onRefresh={() => query.refetch()}
    />
  );
}
