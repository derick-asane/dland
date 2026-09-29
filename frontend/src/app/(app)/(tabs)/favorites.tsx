import { FlatList } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Land } from '@/api/types';
import { LandCard } from '@/components/LandCard';
import { EmptyState, ErrorState, Loading } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { errorMessage } from '@/utils/format';

export default function FavoritesScreen() {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['favorites'],
    queryFn: async () => (await api.get<{ items: Land[] }>('/lands/favorites')).data.items,
  });

  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
      data={query.data}
      keyExtractor={(l) => l.id}
      renderItem={({ item }) => <LandCard land={item} />}
      ListEmptyComponent={<EmptyState icon="heart-outline" text={t('favorites.empty')} />}
      refreshing={query.isRefetching}
      onRefresh={() => query.refetch()}
    />
  );
}
