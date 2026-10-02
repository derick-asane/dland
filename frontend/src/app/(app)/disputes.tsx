import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Dispute } from '@/api/types';
import { DisputeCard } from '@/components/DisputeCard';
import { EmptyState, ErrorState, Loading, Screen } from '@/components/ui';
import { errorMessage } from '@/utils/format';

/** Disputes I opened, and disputes about my land. */
export default function MyDisputesScreen() {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['disputes', 'mine'],
    queryFn: async () => (await api.get<{ items: Dispute[] }>('/disputes/mine')).data.items,
  });
  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      {query.data?.length === 0 ? <EmptyState icon="shield-checkmark-outline" text={t('dispute.empty')} /> : null}
      {query.data?.map((d) => <DisputeCard key={d.id} dispute={d} />)}
    </Screen>
  );
}
