import { Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { AdminStats } from '@/api/types';
import { ChainStatus } from '@/components/ChainStatus';
import { Badge, Card, ErrorState, ListItem, Loading, Screen, Section, Stat, type IconName } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme';
import { errorMessage, formatDate, formatMoney, fullName } from '@/utils/format';

/** Admin console: platform-wide KPIs, work queues and the audit trail. */
export default function AdminScreen() {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => (await api.get<AdminStats>('/admin/stats')).data,
  });

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const s = query.data;
  const totalUsers = Object.values(s.usersByRole).reduce((a, b) => a + (b ?? 0), 0);
  const totalLands = Object.values(s.landsByStatus).reduce((a, b) => a + (b ?? 0), 0);

  const menu: { label: string; icon: IconName; href: Href; badge?: number }[] = [
    { label: t('admin.reports'), icon: 'flag-outline', href: '/admin/reports', badge: s.openReports },
    { label: t('admin.users'), icon: 'people-outline', href: '/admin/users' },
    { label: t('admin.listings'), icon: 'map-outline', href: '/admin/lands' },
    { label: t('admin.transfers'), icon: 'swap-horizontal-outline', href: '/admin/transfers' },
    { label: t('admin.audit'), icon: 'document-text-outline', href: '/admin/audit' },
    { label: t('chain.explorer'), icon: 'cube-outline', href: '/chain' },
  ];

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <Section title={t('admin.dashboard')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <Stat icon="people" label={t('admin.stats.users')} value={totalUsers} />
          <Stat icon="person-add" label={t('admin.stats.newUsers')} value={s.newUsersLast30Days} />
          <Stat icon="map" label={t('admin.stats.lands')} value={totalLands} />
          <Stat icon="checkmark-circle" label={t('admin.stats.published')} value={s.landsByStatus.PUBLISHED ?? 0} />
          <Stat icon="hourglass" label={t('admin.stats.pending')} value={s.landsByStatus.PENDING_VERIFICATION ?? 0} />
          <Stat icon="swap-horizontal" label={t('admin.stats.transfers')} value={s.transfersByStatus.COMPLETED ?? 0} />
          <Stat icon="cube" label={t('admin.stats.blocks')} value={s.blocks} />
          <Stat icon="flag" label={t('admin.stats.openReports')} value={s.openReports} />
        </View>
        {s.salesVolume.length > 0 ? (
          <Card style={{ marginTop: spacing.md }}>
            <Text style={font.small}>{t('admin.stats.volume')}</Text>
            {s.salesVolume.map((v) => (
              <Text key={v.currency} style={font.h2}>
                {formatMoney(v.total, v.currency)}
              </Text>
            ))}
          </Card>
        ) : null}
      </Section>

      <View style={{ borderRadius: radius.lg, overflow: 'hidden', marginBottom: spacing.xl }}>
        {menu.map((m) => (
          <ListItem
            key={m.label}
            title={m.label}
            icon={m.icon}
            onPress={() => router.push(m.href)}
            right={m.badge ? <Badge label={String(m.badge)} tone="warning" /> : undefined}
          />
        ))}
      </View>

      <Section title={t('admin.chainHealth')}>
        <ChainStatus />
      </Section>

      <Section title={t('admin.recentActivity')}>
        {s.recentActivity.map((a) => (
          <View key={a.id} style={{ paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={font.body}>{a.action}</Text>
            <Text style={font.small}>
              {a.actor ? `${fullName(a.actor)} · ` : ''}
              {a.entityType} · {formatDate(a.createdAt, true)}
            </Text>
          </View>
        ))}
      </Section>
    </Screen>
  );
}
