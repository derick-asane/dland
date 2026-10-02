import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, apiErrorCode } from '@/api/client';
import type { Payment, PaymentsConfig } from '@/api/types';
import { useLand } from '@/hooks/useLand';
import { useAuth } from '@/store/auth';
import { Badge, Banner, Button, Card, ErrorState, KeyValue, Loading, Screen, TextField } from '@/components/ui';
import { colors, font, spacing } from '@/theme';
import { errorMessage, formatDate, formatMoney } from '@/utils/format';
import { cameroonLocalNumber, formatCameroonPhone, guessOperator } from '@/utils/phone';
import { showAlert } from '@/utils/alert';

const FAILURE_REASONS = ['INSUFFICIENT_FUNDS', 'EXPIRED', 'REJECTED', 'PROVIDER_UNAVAILABLE', 'NOT_STARTED'] as const;

/**
 * Pays the listing fee with MTN MoMo or Orange Money: the payer enters their number, approves
 * the request on their phone, and this screen follows the payment until it succeeds or fails.
 */
export default function ListingFeeScreen() {
  const { landId } = useLocalSearchParams<{ landId: string }>();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const me = useAuth((s) => s.user);
  const land = useLand(landId);
  const [phone, setPhone] = useState(me?.phone ?? '');
  // undefined: not chosen yet, so resume a payment still waiting for approval (e.g. after leaving the screen).
  const [chosenId, setPaymentId] = useState<string | null | undefined>(undefined);
  const paymentId = chosenId === undefined ? (land.data?.listingFee?.pendingPaymentId ?? null) : chosenId;

  const config = useQuery({
    queryKey: ['payments', 'config'],
    queryFn: async () => (await api.get<PaymentsConfig>('/payments/config')).data,
  });

  const payment = useQuery({
    queryKey: ['payment', paymentId],
    queryFn: async () => {
      const p = (await api.get<{ payment: Payment }>(`/payments/${paymentId}`)).data.payment;
      if (p.status === 'SUCCESSFUL') {
        // The listing's review step can now submit.
        void queryClient.invalidateQueries({ queryKey: ['land', landId] });
        void queryClient.invalidateQueries({ queryKey: ['payments', 'mine'] });
      }
      return p;
    },
    enabled: Boolean(paymentId),
    // Follow the payment while the payer approves it on their phone.
    refetchInterval: (q) => (q.state.data?.status === 'PENDING' || !q.state.data ? 3000 : false),
  });

  const start = useMutation({
    mutationFn: async () =>
      (await api.post<{ payment: Payment }>('/payments/listing-fee', { landId, phone })).data.payment,
    onSuccess: (p) => {
      queryClient.setQueryData(['payment', p.id], p);
      setPaymentId(p.id);
    },
    onError: async (err) => {
      const code = apiErrorCode(err);
      if (code === 'PAYMENT_PENDING' || code === 'LISTING_FEE_ALREADY_PAID') {
        const fresh = await land.refetch();
        const fee = fresh.data?.listingFee;
        setPaymentId(fee?.pendingPaymentId ?? fee?.paymentId ?? null);
        return;
      }
      showAlert(t('common.error'), errorMessage(err));
    },
  });

  if (land.isLoading || config.isLoading) return <Loading />;
  if (land.isError || !land.data || !config.data) return <ErrorState message={errorMessage(land.error ?? config.error)} />;
  const fee = config.data.listingFee;
  const local = cameroonLocalNumber(phone);
  const operator = local ? guessOperator(local) : null;
  const p = payment.data;

  return (
    <Screen edges={['bottom']}>
      <Card>
        <Text style={font.small}>{t('pay.listingFee')}</Text>
        <Text style={[font.h1, { color: colors.primaryDark }]}>{formatMoney(fee.amount, fee.currency)}</Text>
        <Text style={font.h3}>{land.data.title}</Text>
        <Text style={font.small}>{land.data.reference}</Text>
      </Card>

      {config.data.sandbox ? (
        <Banner
          tone="warning"
          icon="flask-outline"
          text={config.data.provider === 'simulator' ? t('pay.simulatorMode') : t('pay.sandboxMode')}
        />
      ) : null}

      {!p ? (
        <>
          <Banner tone="info" icon="information-circle-outline" text={t('pay.why')} />
          <TextField
            label={t('pay.phone')}
            hint={t('pay.phoneHint')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            maxLength={20}
            error={phone.trim() && !local ? t('errors.INVALID_PHONE') : undefined}
          />
          {operator ? (
            <View style={{ flexDirection: 'row', marginBottom: spacing.md }}>
              <Badge label={operator === 'MTN' ? 'MTN Mobile Money' : 'Orange Money'} tone={operator === 'MTN' ? 'warning' : 'info'} icon="phone-portrait-outline" />
            </View>
          ) : null}
          <Button
            title={t('pay.payButton', { amount: formatMoney(fee.amount, fee.currency) })}
            icon="phone-portrait-outline"
            disabled={!local}
            loading={start.isPending}
            onPress={() => start.mutate()}
          />
        </>
      ) : p.status === 'PENDING' ? (
        <Card style={{ alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.md }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[font.h3, { textAlign: 'center' }]}>{t('pay.approveTitle')}</Text>
          <Text style={[font.body, { textAlign: 'center' }]}>
            {t(p.operator === 'ORANGE' ? 'pay.approveOrange' : 'pay.approveMtn', { phone: formatCameroonPhone(p.phone) })}
          </Text>
          {p.ussdCode ? <Text style={[font.small, { textAlign: 'center' }]}>{t('pay.ussdHint', { code: p.ussdCode })}</Text> : null}
          <Text style={[font.small, { textAlign: 'center' }]}>{t('pay.keepOpen')}</Text>
        </Card>
      ) : p.status === 'SUCCESSFUL' ? (
        <>
          <Card style={{ alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm }}>
            <Ionicons name="checkmark-circle" size={56} color={colors.primary} />
            <Text style={font.h2}>{t('pay.success')}</Text>
            <Text style={[font.body, { textAlign: 'center' }]}>{t('pay.successHint')}</Text>
          </Card>
          <Receipt payment={p} />
          <Button title={t('pay.continue')} icon="arrow-forward" onPress={() => router.back()} />
        </>
      ) : (
        <>
          <Card style={{ alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm }}>
            <Ionicons name="close-circle" size={56} color={colors.danger} />
            <Text style={font.h2}>{t('pay.failed')}</Text>
            <Text style={[font.body, { textAlign: 'center' }]}>
              {FAILURE_REASONS.includes(p.failureReason as (typeof FAILURE_REASONS)[number])
                ? t(`pay.reasons.${p.failureReason as (typeof FAILURE_REASONS)[number]}`)
                : t('pay.reasons.OTHER')}
            </Text>
          </Card>
          <Button title={t('pay.tryAgain')} icon="refresh" onPress={() => setPaymentId(null)} />
        </>
      )}
    </Screen>
  );
}

function Receipt({ payment: p }: { payment: Payment }) {
  const { t } = useTranslation();
  return (
    <Card>
      <KeyValue label={t('pay.receipt')} value={p.receipt} mono />
      <KeyValue label={t('pay.amount')} value={formatMoney(p.amount, p.currency)} />
      <KeyValue label={t('pay.paidWith')} value={`${p.operator ?? ''} ${formatCameroonPhone(p.phone)}`.trim()} />
      {p.operatorReference ? <KeyValue label={t('pay.operatorReference')} value={p.operatorReference} mono /> : null}
      {p.paidAt ? <KeyValue label={t('pay.date')} value={formatDate(p.paidAt, true)} /> : null}
    </Card>
  );
}
