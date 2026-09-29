import { FlatList, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Block, Page } from '@/api/types';
import { ChainStatus } from '@/components/ChainStatus';
import { Badge, Card, ErrorState, Loading, Row } from '@/components/ui';
import { colors, font, spacing } from '@/theme';
import { errorMessage, formatDate, shortHash } from '@/utils/format';

/** Public explorer: every block of the ledger, newest first. */
export default function ChainExplorerScreen() {
  const { t } = useTranslation();
  const query = useInfiniteQuery({
    queryKey: ['chain', 'blocks'],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => (await api.get<Page<Block>>('/chain/blocks', { params: { page: pageParam } })).data,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });

  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const blocks = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg }}
      data={blocks}
      keyExtractor={(b) => b.id}
      ListHeaderComponent={
        <View>
          <Text style={[font.small, { marginBottom: spacing.md, lineHeight: 19 }]}>{t('chain.intro')}</Text>
          <ChainStatus />
        </View>
      }
      renderItem={({ item }) => (
        <Card onPress={() => router.push(`/chain/${item.hash}`)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text style={font.h3}>#{item.index}</Text>
            <Badge label={t(`blockType.${item.type}`)} tone={item.type === 'OWNERSHIP_TRANSFERRED' ? 'chain' : 'info'} />
          </Row>
          {item.land ? (
            <Text style={font.body} numberOfLines={1}>
              {item.land.title} · {item.land.reference}
            </Text>
          ) : null}
          <Text style={[font.mono, { color: colors.textMuted, marginTop: 4 }]}>{shortHash(item.hash, 20)}</Text>
          <Text style={font.small}>{formatDate(item.timestamp, true)}</Text>
        </Card>
      )}
      onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
      refreshing={query.isRefetching}
      onRefresh={() => query.refetch()}
    />
  );
}
