import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Land, LandType, Page } from '@/api/types';
import { useAuth } from '@/store/auth';
import { LandCard } from '@/components/LandCard';
import { ExploreMap } from '@/components/map/ExploreMap';
import { Button, ChipGroup, EmptyState, ErrorState, Loading, TextField } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme';
import { errorMessage } from '@/utils/format';

const SORTS = ['newest', 'price_asc', 'price_desc', 'area_desc', 'popular'] as const;
type Sort = (typeof SORTS)[number];
const LAND_TYPES: LandType[] = ['RESIDENTIAL', 'COMMERCIAL', 'AGRICULTURAL', 'INDUSTRIAL', 'MIXED'];

interface Filters {
  city: string;
  landType?: LandType;
  minPrice: string;
  maxPrice: string;
  minArea: string;
  maxArea: string;
}

const emptyFilters: Filters = { city: '', minPrice: '', maxPrice: '', minArea: '', maxArea: '' };

export default function ExploreScreen() {
  const { t } = useTranslation();
  const user = useAuth((s) => s.user);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);

  const params = useMemo(() => {
    const p: Record<string, string> = { sort, pageSize: '10' };
    if (search) p.q = search;
    if (filters.city) p.city = filters.city;
    if (filters.landType) p.landType = filters.landType;
    for (const key of ['minPrice', 'maxPrice', 'minArea', 'maxArea'] as const) if (filters[key]) p[key] = filters[key];
    return p;
  }, [search, sort, filters]);

  const query = useInfiniteQuery({
    queryKey: ['lands', params],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => (await api.get<Page<Land>>('/lands', { params: { ...params, page: pageParam } })).data,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });

  const lands = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.total ?? 0;
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const setField = (key: keyof Filters) => (value: string) => setDraft((d) => ({ ...d, [key]: value.replace(',', '.') }));

  const header = (
    <View>
      <Text style={font.small}>{t('explore.greeting', { name: user?.firstName ?? '' })}</Text>
      <Text style={[font.h1, { marginBottom: spacing.md }]}>{t('explore.title')}</Text>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            onSubmitEditing={() => setSearch(q.trim())}
            placeholder={t('explore.searchPlaceholder')}
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            style={styles.searchInput}
          />
          {q ? (
            <Pressable
              onPress={() => {
                setQ('');
                setSearch('');
              }}
            >
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable style={[styles.filterBtn, activeFilterCount > 0 && { backgroundColor: colors.primary }]} onPress={() => setShowFilters((s) => !s)}>
          <Ionicons name="options-outline" size={22} color={activeFilterCount > 0 ? '#fff' : colors.text} />
        </Pressable>
        <Pressable style={styles.filterBtn} onPress={() => setView('map')} accessibilityLabel={t('map.map')}>
          <Ionicons name="map-outline" size={22} color={colors.text} />
        </Pressable>
      </View>

      {showFilters ? (
        <View style={styles.filters}>
          <ChipGroup
            label={t('explore.type')}
            value={draft.landType ?? ('ANY' as LandType)}
            onChange={(v) => setDraft((d) => ({ ...d, landType: (v as string) === 'ANY' ? undefined : v }))}
            options={[{ value: 'ANY' as LandType, label: t('explore.anyType') }, ...LAND_TYPES.map((v) => ({ value: v, label: t(`landType.${v}`) }))]}
          />
          <TextField label={t('explore.city')} value={draft.city} onChangeText={(v) => setDraft((d) => ({ ...d, city: v }))} />
          <View style={styles.twoCols}>
            <TextField label={t('explore.minPrice')} value={draft.minPrice} onChangeText={setField('minPrice')} keyboardType="numeric" containerStyle={{ flex: 1 }} />
            <TextField label={t('explore.maxPrice')} value={draft.maxPrice} onChangeText={setField('maxPrice')} keyboardType="numeric" containerStyle={{ flex: 1 }} />
          </View>
          <View style={styles.twoCols}>
            <TextField label={t('explore.minArea')} value={draft.minArea} onChangeText={setField('minArea')} keyboardType="numeric" containerStyle={{ flex: 1 }} />
            <TextField label={t('explore.maxArea')} value={draft.maxArea} onChangeText={setField('maxArea')} keyboardType="numeric" containerStyle={{ flex: 1 }} />
          </View>
          <View style={styles.twoCols}>
            <Button
              title={t('common.reset')}
              variant="ghost"
              style={{ flex: 1 }}
              onPress={() => {
                setDraft(emptyFilters);
                setFilters(emptyFilters);
              }}
            />
            <Button
              title={t('common.apply')}
              style={{ flex: 1 }}
              onPress={() => {
                setFilters(draft);
                setShowFilters(false);
              }}
            />
          </View>
        </View>
      ) : null}

      <ChipGroup value={sort} onChange={setSort} options={SORTS.map((s) => ({ value: s, label: t(`explore.sort.${s}`) }))} />
      {query.isSuccess ? <Text style={[font.small, { marginBottom: spacing.md }]}>{t('explore.results', { count: total })}</Text> : null}
    </View>
  );

  if (view === 'map') return <ExploreMap onShowList={() => setView('list')} />;

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.lg }}
      data={lands}
      keyExtractor={(l) => l.id}
      renderItem={({ item }) => <LandCard land={item} />}
      ListHeaderComponent={header}
      ListEmptyComponent={
        query.isLoading ? (
          <Loading />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
        ) : (
          <EmptyState icon="map-outline" text={t('explore.noResults')} />
        )
      }
      onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
      onEndReachedThreshold={0.4}
      refreshing={query.isRefetching && !query.isFetchingNextPage}
      onRefresh={() => query.refetch()}
      ListFooterComponent={query.isFetchingNextPage ? <Loading /> : null}
    />
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: colors.text },
  filterBtn: {
    width: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filters: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  twoCols: { flexDirection: 'row', gap: spacing.md },
});
