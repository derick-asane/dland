import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, fileUrl } from '@/api/client';
import type { MapLand } from '@/api/types';
import { colors, font, radius, spacing } from '@/theme';
import { formatMoney, formatNumber } from '@/utils/format';
import { LandMap, ringFromBoundary, type MapBounds, type MapMarker, type MapParcel } from './LandMap';

const WORLD: MapBounds = { minLat: -85, maxLat: 85, minLng: -180, maxLng: 180, zoom: 2 };
const key = (b: MapBounds) => [b.minLat, b.maxLat, b.minLng, b.maxLng].map((n) => n.toFixed(3)).join(',');

/** Land for sale on a map: parcel outlines, price pins, and a card for the selected listing. */
export function ExploreMap({ onShowList }: { onShowList: () => void }) {
  const { t } = useTranslation();
  // Start with the whole world, fit to the results once, then follow the viewport.
  const [bounds, setBounds] = useState<MapBounds>(WORLD);
  const [following, setFollowing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['lands', 'map', 'market', key(bounds)],
    queryFn: async () => (await api.get<{ items: MapLand[] }>('/lands/map', { params: { ...bounds, zoom: undefined } })).data.items,
    placeholderData: keepPreviousData,
  });
  const lands = useMemo(() => query.data ?? [], [query.data]);

  const parcels = useMemo<MapParcel[]>(
    () => lands.filter((l) => l.boundary).map((l) => ({ id: l.id, coords: ringFromBoundary(l.boundary), label: l.title })),
    [lands],
  );
  const markers = useMemo<MapMarker[]>(
    () =>
      lands
        .filter((l) => l.latitude != null && l.longitude != null)
        .map((l) => ({ id: l.id, lat: l.latitude!, lng: l.longitude!, label: formatMoney(l.price ?? 0, l.currency) })),
    [lands],
  );
  const selected = lands.find((l) => l.id === selectedId);
  // Fit once to the first results; the map ignores a fitKey it has already applied.
  const fitKey = following || lands.length > 0 ? 'initial' : undefined;

  return (
    <View style={{ flex: 1 }}>
      <LandMap
        style={{ flex: 1 }}
        parcels={parcels}
        markers={markers}
        selectedId={selectedId}
        fitKey={fitKey}
        onSelect={setSelectedId}
        onBounds={(b) => {
          // Until the first results are in, keep querying the whole world rather than the default view.
          if (following || lands.length > 0) {
            setFollowing(true);
            setBounds(b);
          }
        }}
      />

      <Pressable style={styles.toggle} onPress={onShowList}>
        <Ionicons name="list" size={18} color={colors.text} />
        <Text style={font.h3}>{t('map.list')}</Text>
      </Pressable>

      {query.isSuccess && lands.length === 0 ? (
        <View style={styles.empty}>
          <Text style={font.small}>{t('map.emptyArea')}</Text>
        </View>
      ) : null}

      {selected ? (
        <Pressable style={styles.card} onPress={() => router.push(`/land/${selected.id}`)}>
          <Image source={{ uri: fileUrl(selected.images?.[0]?.url) }} style={styles.thumb} />
          <View style={{ flex: 1 }}>
            <Text style={[font.h3, { color: colors.primaryDark }]}>{formatMoney(selected.price ?? 0, selected.currency)}</Text>
            <Text style={font.body} numberOfLines={1}>
              {selected.title}
            </Text>
            <Text style={font.small}>
              {selected.city} · {t('common.sqm', { value: formatNumber(selected.areaSqm) })} · {t(`landType.${selected.landType}`)}
            </Text>
          </View>
          <Pressable onPress={() => setSelectedId(null)} hitSlop={10}>
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </Pressable>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    position: 'absolute',
    top: spacing.md,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  empty: {
    position: 'absolute',
    bottom: spacing.xl,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  card: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  thumb: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.border },
});
