import { Image, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { fileUrl } from '@/api/client';
import type { Transfer } from '@/api/types';
import { useAuth } from '@/store/auth';
import { colors, font, radius, spacing } from '@/theme';
import { formatDate, formatMoney, fullName } from '@/utils/format';
import { Badge, Card, Row, toneForStatus } from './ui';

/** Summary of a sale file, with progress and what the viewer has to do next. */
export function TransferCard({ transfer: tr, children }: { transfer: Transfer; children?: React.ReactNode }) {
  const { t } = useTranslation();
  const me = useAuth((s) => s.user);
  const steps = tr.steps ?? [];
  const done = steps.filter((s) => s.status === 'CONFIRMED').length;
  const isBuyer = me?.id === tr.buyerId;
  const buyerTodo =
    isBuyer && tr.status === 'IN_PROGRESS' && steps.some((s) => ['DEPOSIT', 'BALANCE'].includes(s.type) && ['PENDING', 'REJECTED'].includes(s.status));
  const notaryTodo = me?.id === tr.notaryId && steps.some((s) => s.status === 'SUBMITTED');

  return (
    <Card onPress={() => router.push(`/transfer/${tr.id}`)}>
      <Row>
        <Image source={{ uri: fileUrl(tr.land.images[0]?.url) }} style={{ width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.border }} />
        <View style={{ flex: 1 }}>
          <Text style={font.h3} numberOfLines={1}>
            {tr.land.title}
          </Text>
          <Text style={[font.body, { color: colors.primaryDark, fontWeight: '700' }]}>{formatMoney(tr.price, tr.currency)}</Text>
          <Text style={font.small} numberOfLines={1}>
            {tr.reference ? `${tr.reference} · ` : ''}
            {fullName(tr.seller)} → {fullName(tr.buyer)}
          </Text>
        </View>
        <Badge label={t(`transferStatus.${tr.status}`)} tone={toneForStatus(tr.status)} />
      </Row>
      <Row style={{ marginTop: spacing.sm, justifyContent: 'space-between' }}>
        <Text style={font.small}>
          {steps.length ? t('sale.stepsDone', { done, total: steps.length }) : formatDate(tr.createdAt)}
        </Text>
        {buyerTodo || notaryTodo ? (
          <Row style={{ gap: 4 }}>
            <Ionicons name="alert-circle" size={16} color={colors.warning} />
            <Text style={{ color: colors.warning, fontWeight: '600', fontSize: 13 }}>
              {buyerTodo ? t('sale.buyerTodo') : t('sale.notaryTodo')}
            </Text>
          </Row>
        ) : null}
      </Row>
      {children}
    </Card>
  );
}
