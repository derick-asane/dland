import { useMemo } from 'react';
import { Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Land, MapLand } from '@/api/types';
import { colors, font, radius, spacing } from '@/theme';
import { formatNumber } from '@/utils/format';
import { LandMap, ringFromBoundary, type MapParcel } from './LandMap';

interface Props {
  land: Land;
  /** Also draw registered neighbours (grey) and highlight these overlapping ones (red). */
  showNeighbours?: boolean;
  overlappingIds?: string[];
  height?: number;
  /** Caption with measured vs declared area (off when a BoundaryReport is shown next to it). */
  showArea?: boolean;
}

/** Small map of one parcel: its outline if drawn, otherwise its pin. */
export function ParcelPreview({ land, showNeighbours, overlappingIds = [], height = 220, showArea = true }: Props) {
  const { t } = useTranslation();
  const ring = ringFromBoundary(land.boundary);

  const pad = 0.003;
  const neighbours = useQuery({
    queryKey: ['lands', 'map', 'registry', 'around', land.id],
    queryFn: async () =>
      (
        await api.get<{ items: MapLand[] }>('/lands/map', {
          params: {
            layer: 'registry',
            minLat: Math.min(...ring.map((p) => p[1])) - pad,
            maxLat: Math.max(...ring.map((p) => p[1])) + pad,
            minLng: Math.min(...ring.map((p) => p[0])) - pad,
            maxLng: Math.max(...ring.map((p) => p[0])) + pad,
          },
        })
      ).data.items,
    enabled: Boolean(showNeighbours && ring.length >= 3),
  });

  const parcels = useMemo<MapParcel[]>(() => {
    const others = (neighbours.data ?? [])
      .filter((l) => l.id !== land.id && l.boundary)
      .map((l) => {
        const overlapping = overlappingIds.includes(l.id);
        return {
          id: l.id,
          coords: ringFromBoundary(l.boundary),
          label: l.reference,
          color: overlapping ? colors.danger : '#6B7570',
          fillOpacity: overlapping ? 0.35 : 0.2,
          dashed: !overlapping,
        };
      });
    return ring.length >= 3 ? [...others, { id: land.id, coords: ring, label: land.reference }] : others;
  }, [neighbours.data, overlappingIds, ring, land.id, land.reference]);

  const markers =
    ring.length < 3 && land.latitude != null && land.longitude != null
      ? [{ id: land.id, lat: land.latitude, lng: land.longitude, label: land.reference }]
      : [];

  if (!parcels.length && !markers.length) return null;

  return (
    <>
      <LandMap
        style={{ height, borderRadius: radius.lg }}
        parcels={parcels}
        markers={markers}
        fitKey={`${land.id}:${land.boundaryHash ?? 'pin'}`}
        baseLayer={ring.length >= 3 ? 'satellite' : 'streets'}
      />
      {showArea && land.boundaryAreaSqm ? (
        <Text style={[font.small, { marginTop: spacing.xs }]}>
          {t('map.measured', { value: t('common.sqm', { value: formatNumber(land.boundaryAreaSqm) }) })} ·{' '}
          {t('map.declared', { value: t('common.sqm', { value: formatNumber(land.areaSqm) }) })}
        </Text>
      ) : null}
    </>
  );
}
