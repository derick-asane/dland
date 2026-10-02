import { useState } from 'react';
import { FlatList } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Page, Payment, PaymentStatus } from '@/api/types';
import { PaymentCard } from '@/components/PaymentCard';
import { ChipGroup, EmptyState, ErrorState, Loading } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { errorMessage } from '@/utils/format';

type Filter = PaymentStatus | 'ALL';

/** Every platform fee payment (DLand's revenue), newest first. */
export default function AdminPaymentsScreen() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Filter>('SUCCESSFUL');
  const query = useInfiniteQuery({
    queryKey: ['admin', 'payments', status],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (await api.get<Page<Payment>>('/admin/payments', { params: { page: pageParam, status: status === 'ALL' ? undefined : status } })).data,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg }}
      data={items}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={
        <ChipGroup
          value={status}
          onChange={setStatus}
          options={[
            { value: 'SUCCESSFUL' as Filter, label: t('pay.statuses.SUCCESSFUL') },
            { value: 'PENDING' as Filter, label: t('pay.statuses.PENDING') },
            { value: 'FAILED' as Filter, label: t('pay.statuses.FAILED') },
            { value: 'ALL' as Filter, label: t('admin.all') },
          ]}
        />
      }
      renderItem={({ item }) => <PaymentCard payment={item} showPayer />}
      ListEmptyComponent={
        query.isLoading ? <Loading /> : query.isError ? <ErrorState message={errorMessage(query.error)} /> : <EmptyState icon="wallet-outline" text={t('pay.empty')} />
      }
      onEndReached={() => query.hasNextPage && query.fetchNextPage()}
      refreshing={query.isRefetching}
      onRefresh={() => query.refetch()}
    />
  );
}
