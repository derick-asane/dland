import { useState } from 'react';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Land, Transfer } from '@/api/types';
import { useAuth } from '@/store/auth';
import { LandCard } from '@/components/LandCard';
import { TransferCard } from '@/components/TransferCard';
import { Banner, ChipGroup, EmptyState, ErrorState, Loading, Screen, Segmented } from '@/components/ui';
import { spacing } from '@/theme';
import { errorMessage } from '@/utils/format';

type Tab = 'listings' | 'transfers';
type View = 'new' | 'active' | 'done';

/** Notary desk: verify new listings and handle sale files (payments are made off-platform). */
export default function NotaryScreen() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('listings');
  return (
    <Screen scroll={false} contentStyle={{ padding: spacing.lg }}>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'listings', label: t('notary.listings') },
          { value: 'transfers', label: t('notary.transfers') },
        ]}
      />
      {tab === 'listings' ? <ListingQueue /> : <TransferQueue />}
    </Screen>
  );
}

function ListingQueue() {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['notary', 'lands'],
    queryFn: async () => (await api.get<{ items: Land[] }>('/notary/lands')).data.items,
  });
  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  if (!query.data?.length) return <EmptyState icon="checkmark-done-outline" text={t('notary.emptyListings')} />;
  return (
    <Screen contentStyle={{ padding: 0 }} refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      {query.data.map((land) => (
        <LandCard key={land.id} land={land} showStatus onPress={() => router.push(`/notary/land/${land.id}`)} />
      ))}
    </Screen>
  );
}

function TransferQueue() {
  const { t } = useTranslation();
  const me = useAuth((s) => s.user);
  const [view, setView] = useState<View>('new');
  const query = useQuery({
    queryKey: ['notary', 'transfers', view],
    queryFn: async () => (await api.get<{ items: Transfer[] }>('/notary/transfers', { params: { view } })).data.items,
  });
  const empty = { new: t('sale.emptyNew'), active: t('sale.emptyActive'), done: t('sale.emptyDone') }[view];

  return (
    <Screen contentStyle={{ padding: 0 }} refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <ChipGroup
        value={view}
        onChange={setView}
        options={[
          { value: 'new', label: t('sale.tabNew') },
          { value: 'active', label: t('sale.tabActive') },
          { value: 'done', label: t('sale.tabDone') },
        ]}
      />
      {view === 'new' && !me?.escrowAccountNumber ? (
        <Banner tone="warning" icon="wallet-outline" text={t('sale.escrowMissing')} />
      ) : null}
      {query.isLoading ? <Loading /> : null}
      {query.isError ? <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} /> : null}
      {query.data?.length === 0 ? <EmptyState icon="briefcase-outline" text={empty} /> : null}
      {query.data?.map((tr) => <TransferCard key={tr.id} transfer={tr} />)}
    </Screen>
  );
}
