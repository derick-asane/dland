import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { Payment } from '@/api/types';
import { font } from '@/theme';
import { formatDate, formatMoney, fullName } from '@/utils/format';
import { formatCameroonPhone } from '@/utils/phone';
import { Badge, Card, Row, toneForStatus } from './ui';

/** One fee payment (receipt) in a list. Admins also see who paid. */
export function PaymentCard({ payment: p, showPayer }: { payment: Payment; showPayer?: boolean }) {
  const { t } = useTranslation();
  return (
    <Card onPress={p.land ? () => router.push(`/land/${p.land!.id}`) : undefined}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={font.h3}>{formatMoney(p.amount, p.currency)}</Text>
        <Badge label={t(`pay.statuses.${p.status}`)} tone={toneForStatus(p.status)} />
      </Row>
      <View style={{ marginTop: 4, gap: 2 }}>
        <Text style={font.small} numberOfLines={1}>
          {t('pay.listingFee')}
          {p.land ? ` · ${p.land.title}` : ''}
        </Text>
        {showPayer && p.user ? (
          <Text style={font.small} numberOfLines={1}>
            {fullName(p.user)} · {formatCameroonPhone(p.phone)}
          </Text>
        ) : null}
        <Text style={[font.small, { fontFamily: 'monospace' }]} numberOfLines={1}>
          {p.receipt} · {p.operator ?? '—'} · {formatDate(p.paidAt ?? p.createdAt, true)}
        </Text>
      </View>
    </Card>
  );
}
