import { Image, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { fileUrl } from '@/api/client';
import type { Dispute } from '@/api/types';
import { colors, font, radius } from '@/theme';
import { formatDate, fullName } from '@/utils/format';
import { Badge, Card, Row, toneForStatus } from './ui';

export function DisputeCard({ dispute: d }: { dispute: Dispute }) {
  const { t } = useTranslation();
  return (
    <Card onPress={() => router.push(`/dispute/${d.id}`)}>
      <Row>
        <Image source={{ uri: fileUrl(d.land.images[0]?.url) }} style={{ width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.border }} />
        <View style={{ flex: 1 }}>
          <Text style={font.h3} numberOfLines={1}>
            {d.land.title}
          </Text>
          <Text style={font.small} numberOfLines={1}>
            {d.reference} · {t(`dispute.reasons.${d.reason}`)}
          </Text>
          <Text style={font.small} numberOfLines={1}>
            {t('dispute.claimant')}: {fullName(d.claimant)} · {t('dispute.filedOn', { date: formatDate(d.createdAt) })}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Badge label={t(`dispute.statuses.${d.status}`)} tone={toneForStatus(d.status)} />
          {d.land.frozen ? (
            <Row style={{ gap: 2 }}>
              <Ionicons name="lock-closed" size={12} color={colors.danger} />
              <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '600' }}>{t('dispute.frozenBadge')}</Text>
            </Row>
          ) : null}
        </View>
      </Row>
    </Card>
  );
}
