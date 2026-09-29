import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { AreaCheck, Overlap } from '@/api/types';
import { colors, font, spacing } from '@/theme';
import { formatNumber } from '@/utils/format';
import { Banner } from '../ui';

/** Overlap + area check verdict, shown to sellers while drawing and to notaries while reviewing. */
export function BoundaryReport({ overlaps, areaCheck }: { overlaps: Overlap[]; areaCheck: AreaCheck | null }) {
  const { t } = useTranslation();
  const blocking = overlaps.filter((o) => o.registeredOnChain);
  const pending = overlaps.filter((o) => !o.registeredOnChain);
  const sqm = (v: number) => t('common.sqm', { value: formatNumber(v) });

  return (
    <View>
      {blocking.length > 0 ? (
        <Banner tone="danger" icon="warning" text={t('map.overlapBlocking')} />
      ) : pending.length > 0 ? (
        <Banner tone="warning" icon="alert-circle" text={t('map.overlapPending')} />
      ) : (
        <Banner tone="success" icon="shield-checkmark" text={t('map.noOverlap')} />
      )}
      {overlaps.map((o) => (
        <Text
          key={o.landId}
          style={[font.body, { color: o.registeredOnChain ? colors.danger : colors.warning, marginBottom: spacing.xs }]}
          onPress={() => router.push(`/land/${o.landId}`)}
        >
          • {t('map.overlapItem', { reference: o.reference, title: o.title, pct: o.overlapPct })}
        </Text>
      ))}
      {areaCheck ? (
        <View style={{ marginTop: spacing.sm }}>
          <Text style={font.small}>
            {t('map.measured', { value: sqm(areaCheck.measuredSqm) })} · {t('map.declared', { value: sqm(areaCheck.declaredSqm) })}
          </Text>
          {areaCheck.suspicious ? (
            <Banner tone="warning" icon="resize" text={t('map.areaMismatch', { pct: Math.abs(areaCheck.diffPct) })} />
          ) : (
            <Text style={[font.small, { color: colors.primary }]}>{t('map.areaOk')}</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}
