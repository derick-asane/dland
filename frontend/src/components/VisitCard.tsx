import { Image, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { fileUrl } from '@/api/client';
import type { Visit } from '@/api/types';
import { colors, font, radius } from '@/theme';
import { formatDate, fullName } from '@/utils/format';
import { Badge, Card, Row, toneForStatus } from './ui';

/** One visit in a list. `as` decides whose name is shown: the owner's or the visitor's. */
export function VisitCard({ visit: v, as }: { visit: Visit; as: 'visitor' | 'owner' }) {
  const { t } = useTranslation();
  const other = as === 'visitor' ? v.land?.owner : v.visitor;
  const when = v.status === 'CONFIRMED' && v.scheduledAt ? v.scheduledAt : v.preferredAt;
  return (
    <Card onPress={() => router.push(`/visit/${v.id}`)}>
      <Row>
        <Image source={{ uri: fileUrl(v.land?.images[0]?.url) }} style={{ width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.border }} />
        <View style={{ flex: 1 }}>
          <Text style={font.h3} numberOfLines={1}>
            {v.land?.title}
          </Text>
          {other ? (
            <Text style={font.small} numberOfLines={1}>
              {as === 'visitor' ? t('visit.owner') : t('visit.visitor')}: {fullName(other)}
            </Text>
          ) : null}
          {when ? (
            <Row style={{ gap: 4 }}>
              <Ionicons name={v.status === 'CONFIRMED' ? 'calendar' : 'time-outline'} size={13} color={colors.textMuted} />
              <Text style={font.small} numberOfLines={1}>
                {v.status === 'CONFIRMED' ? '' : `${t('visit.preferred')}: `}
                {formatDate(when, true)}
              </Text>
            </Row>
          ) : null}
          <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>
            <Badge label={t(`visit.statuses.${v.status}`)} tone={toneForStatus(v.status)} />
          </View>
        </View>
      </Row>
    </Card>
  );
}
