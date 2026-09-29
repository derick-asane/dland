import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { AreaCheck, Land, MapLand, Overlap } from '@/api/types';
import { colors, font, spacing } from '@/theme';
import { errorMessage, formatNumber } from '@/utils/format';
import { ringAreaSqm } from '@/utils/geo';
import { showAlert } from '@/utils/alert';
import { Banner, Button, Row } from '../ui';
import { BoundaryReport } from './BoundaryReport';
import { LandMap, ringFromBoundary, type LngLat, type MapBounds, type MapParcel } from './LandMap';

export interface BoundarySaveResult {
  land: Land;
  overlaps: Overlap[];
  areaCheck: AreaCheck | null;
}

interface Props {
  land: Land;
  /** Called after a successful save (the overlap report is also shown in the panel). */
  onSaved?: (result: BoundarySaveResult) => void;
  /** Extra controls under the panel, e.g. the wizard's Back / Next buttons. */
  footer?: ReactNode;
}

/** The owner draws the parcel outline over satellite imagery; registered parcels nearby are shown in grey. */
export function BoundaryEditor({ land, onSaved, footer }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [points, setPoints] = useState<LngLat[]>(() => ringFromBoundary(land.boundary));
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [result, setResult] = useState<BoundarySaveResult | null>(null);

  // Neighbouring parcels already on the chain, for the current viewport.
  const registry = useQuery({
    queryKey: ['lands', 'map', 'registry', bounds && [bounds.minLat, bounds.maxLat, bounds.minLng, bounds.maxLng].map((n) => n.toFixed(3))],
    queryFn: async () => (await api.get<{ items: MapLand[] }>('/lands/map', { params: { ...bounds, layer: 'registry' } })).data.items,
    enabled: Boolean(bounds && bounds.zoom >= 12),
  });

  const neighbours = useMemo<MapParcel[]>(
    () =>
      (registry.data ?? [])
        .filter((l) => l.id !== land.id && l.boundary)
        .map((l) => ({ id: l.id, coords: ringFromBoundary(l.boundary), color: '#6B7570', fillOpacity: 0.35, label: l.reference })),
    [registry.data, land.id],
  );

  // Initial view, decided once: fit an existing outline, else centre on the pin or geocode the address.
  const [initialView] = useState(() => {
    if (land.boundary) return { fitKey: land.id, center: undefined };
    const center =
      land.latitude != null && land.longitude != null
        ? { key: land.id, lat: land.latitude, lng: land.longitude, zoom: 18 }
        : { key: land.id, queries: [`${land.address}, ${land.city}, ${land.country}`, `${land.city}, ${land.country}`] };
    return { fitKey: undefined, center };
  });

  const save = useMutation({
    mutationFn: async () => (await api.put<BoundarySaveResult>(`/lands/${land.id}/boundary`, { coordinates: points })).data,
    onSuccess: (data) => {
      setResult(data);
      void queryClient.invalidateQueries({ queryKey: ['land', land.id] });
      if (data.overlaps.length === 0) showAlert(t('common.success'), t('map.saved'));
      onSaved?.(data);
    },
    onError: (err) => showAlert(t('common.error'), errorMessage(err)),
  });

  const area = ringAreaSqm(points);
  const update = (next: LngLat[]) => {
    setPoints(next);
    setResult(null);
  };

  if (land.boundaryOnChain) {
    return (
      <View style={{ flex: 1 }}>
        <LandMap style={{ flex: 1 }} parcels={[{ id: land.id, coords: points }]} fitKey={land.id} baseLayer="satellite" />
        <View style={{ padding: spacing.lg, backgroundColor: colors.surface }}>
          <Banner tone="chain" icon="lock-closed" text={t('map.locked')} />
          {footer}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LandMap
        style={{ flex: 1 }}
        mode="draw"
        drawing={points}
        parcels={neighbours}
        center={initialView.center}
        fitKey={initialView.fitKey}
        baseLayer="satellite"
        onChange={update}
        onBounds={setBounds}
      />
      <ScrollView style={{ maxHeight: 340, backgroundColor: colors.surface }} contentContainerStyle={{ padding: spacing.lg }}>
        <Text style={[font.small, { marginBottom: spacing.sm }]}>{t('map.drawHint')}</Text>
        <Text style={[font.small, { marginBottom: spacing.sm }]}>{t('map.registeredHint')}</Text>
        <Row style={{ justifyContent: 'space-between', marginBottom: spacing.md }}>
          <Text style={font.h3}>{t('map.points', { count: points.length })}</Text>
          <Text style={font.h3}>{t('map.measured', { value: t('common.sqm', { value: formatNumber(area) }) })}</Text>
        </Row>
        {result ? <BoundaryReport overlaps={result.overlaps} areaCheck={result.areaCheck} /> : null}
        <Row>
          <Button title={t('map.undo')} icon="arrow-undo" variant="ghost" small style={{ flex: 1 }} disabled={!points.length} onPress={() => update(points.slice(0, -1))} />
          <Button title={t('map.clear')} icon="trash-outline" variant="ghost" small style={{ flex: 1 }} disabled={!points.length} onPress={() => update([])} />
        </Row>
        <Button title={t('map.save')} icon="checkmark" onPress={() => save.mutate()} loading={save.isPending} disabled={points.length < 3} style={{ marginTop: spacing.sm }} />
        {footer}
      </ScrollView>
    </View>
  );
}
