import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Visit } from '@/api/types';
import { VisitCard } from '@/components/VisitCard';
import { ChipGroup, EmptyState, ErrorState, Loading, Screen, Segmented } from '@/components/ui';
import { spacing } from '@/theme';
import { errorMessage } from '@/utils/format';

type As = 'visitor' | 'owner';
type View = 'active' | 'closed';

/** Visits I asked for, and visit requests on my lands. */
export default function VisitsScreen() {
  const params = useLocalSearchParams<{ as?: As }>();
  const { t } = useTranslation();
  const [as, setAs] = useState<As>(params.as === 'owner' ? 'owner' : 'visitor');
  const [view, setView] = useState<View>('active');
  const query = useQuery({
    queryKey: ['visits', as, view],
    queryFn: async () => (await api.get<{ items: Visit[] }>('/visits', { params: { as, view } })).data.items,
  });

  return (
    <Screen contentStyle={{ padding: spacing.lg }} refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <Segmented
        value={as}
        onChange={setAs}
        options={[
          { value: 'visitor', label: t('visit.myRequests') },
          { value: 'owner', label: t('visit.onMyLands') },
        ]}
      />
      <ChipGroup
        value={view}
        onChange={setView}
        options={[
          { value: 'active', label: t('visit.tabActive') },
          { value: 'closed', label: t('visit.tabClosed') },
        ]}
      />
      {query.isLoading ? <Loading /> : null}
      {query.isError ? <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} /> : null}
      {query.data?.length === 0 ? <EmptyState icon="walk-outline" text={t('visit.empty')} /> : null}
      {query.data?.map((v) => <VisitCard key={v.id} visit={v} as={as} />)}
    </Screen>
  );
}
