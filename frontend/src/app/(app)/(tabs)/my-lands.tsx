import { FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Land } from '@/api/types';
import { LandCard } from '@/components/LandCard';
import { Button, EmptyState, ErrorState, Loading } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { errorMessage } from '@/utils/format';

/** Seller workspace: every listing the user owns, whatever its status. */
export default function MyLandsScreen() {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['lands', 'mine'],
    queryFn: async () => (await api.get<{ items: Land[] }>('/lands/mine')).data.items,
  });

  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg, flexGrow: 1 }}
      data={query.data}
      keyExtractor={(l) => l.id}
      ListHeaderComponent={
        <View style={{ marginBottom: spacing.lg }}>
          <Button title={t('landForm.newTitle')} icon="add-circle-outline" onPress={() => router.push('/land/new')} />
        </View>
      }
      renderItem={({ item }) => <LandCard land={item} showStatus />}
      ListEmptyComponent={<EmptyState icon="map-outline" text={t('land.draftInfo')} />}
      refreshing={query.isRefetching}
      onRefresh={() => query.refetch()}
    />
  );
}
