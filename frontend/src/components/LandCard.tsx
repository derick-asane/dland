import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { fileUrl } from '@/api/client';
import type { Land } from '@/api/types';
import { colors, radius, spacing } from '@/theme';
import { formatMoney, formatNumber } from '@/utils/format';
import { Badge, toneForStatus } from './ui';
import { FavoriteButton } from './FavoriteButton';

interface Props {
  land: Land;
  showStatus?: boolean;
  onPress?: () => void;
}

export function LandCard({ land, showStatus, onPress }: Props) {
  const { t } = useTranslation();
  const image = fileUrl(land.images[0]?.url);
  return (
    <Pressable
      onPress={onPress ?? (() => router.push(`/land/${land.id}`))}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
    >
      <View>
        {image ? (
          <Image source={{ uri: image }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.placeholder]}>
            <Ionicons name="image-outline" size={36} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.topRow}>
          {showStatus ? (
            <Badge label={t(`status.${land.status}`)} tone={toneForStatus(land.status)} />
          ) : land.registeredOnChain ? (
            <Badge label={t('explore.verified')} tone="success" icon="shield-checkmark" />
          ) : (
            <View />
          )}
          {!showStatus ? <FavoriteButton landId={land.id} isFavorite={Boolean(land.isFavorite)} /> : null}
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.price}>{formatMoney(land.price, land.currency)}</Text>
        <Text style={styles.title} numberOfLines={1}>
          {land.title}
        </Text>
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={14} color={colors.textMuted} />
          <Text style={styles.meta} numberOfLines={1}>
            {land.city}, {land.country}
          </Text>
          <Text style={styles.dot}>•</Text>
          <Text style={styles.meta}>{t('common.sqm', { value: formatNumber(land.areaSqm) })}</Text>
          <Text style={styles.dot}>•</Text>
          <Text style={styles.meta}>{t(`landType.${land.landType}`)}</Text>
        </View>
        {showStatus && land._count?.offers ? (
          <Text style={[styles.meta, { color: colors.primary, marginTop: 4 }]}>
            {t('land.offersCount', { count: land._count.offers })}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  image: { width: '100%', height: 180, backgroundColor: colors.border },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  topRow: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  body: { padding: spacing.md },
  price: { fontSize: 19, fontWeight: '700', color: colors.primaryDark },
  title: { fontSize: 15, fontWeight: '600', color: colors.text, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, flexWrap: 'wrap' },
  meta: { fontSize: 13, color: colors.textMuted },
  dot: { color: colors.textMuted, fontSize: 13 },
});
