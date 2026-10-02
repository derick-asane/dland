import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Payment } from '@/api/types';
import { PaymentCard } from '@/components/PaymentCard';
import { EmptyState, ErrorState, Loading, Screen } from '@/components/ui';
import { errorMessage } from '@/utils/format';

/** My platform fee payments, with their receipt numbers. */
export default function MyPaymentsScreen() {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['payments', 'mine'],
    queryFn: async () => (await api.get<{ items: Payment[] }>('/payments/mine')).data.items,
  });
  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      {query.data?.length === 0 ? <EmptyState icon="wallet-outline" text={t('pay.empty')} /> : null}
      {query.data?.map((p) => <PaymentCard key={p.id} payment={p} />)}
    </Screen>
  );
}
