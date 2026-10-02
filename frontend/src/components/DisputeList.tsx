import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Dispute } from '@/api/types';
import { errorMessage } from '@/utils/format';
import { DisputeCard } from './DisputeCard';
import { ChipGroup, EmptyState, ErrorState, Loading, Screen } from './ui';

type View = 'new' | 'active' | 'closed';

/** Dispute queue for notaries (and admins): new, being handled, closed. */
export function DisputeList() {
  const { t } = useTranslation();
  const [view, setView] = useState<View>('new');
  const query = useQuery({
    queryKey: ['disputes', 'queue', view],
    queryFn: async () => (await api.get<{ items: Dispute[] }>('/disputes', { params: { view } })).data.items,
  });

  return (
    <Screen contentStyle={{ padding: 0 }} refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <ChipGroup
        value={view}
        onChange={setView}
        options={[
          { value: 'new', label: t('dispute.tabNew') },
          { value: 'active', label: t('dispute.tabActive') },
          { value: 'closed', label: t('dispute.tabClosed') },
        ]}
      />
      {query.isLoading ? <Loading /> : null}
      {query.isError ? <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} /> : null}
      {query.data?.length === 0 ? <EmptyState icon="shield-checkmark-outline" text={t('dispute.empty')} /> : null}
      {query.data?.map((d) => <DisputeCard key={d.id} dispute={d} />)}
    </Screen>
  );
}
