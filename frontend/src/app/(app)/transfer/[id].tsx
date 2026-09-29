import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, fileUrl, upload } from '@/api/client';
import { openPrivateFile } from '@/api/files';
import type { Transfer, TransferStep } from '@/api/types';
import { useAuth } from '@/store/auth';
import { PromptModal } from '@/components/PromptModal';
import { Badge, Banner, Button, Card, ErrorState, KeyValue, Loading, Row, Screen, Section, TextField, toneForStatus } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme';
import { errorMessage, formatDate, formatMoney, fullName, shortHash } from '@/utils/format';
import { showAlert } from '@/utils/alert';

type Action =
  | { kind: 'claim' }
  | { kind: 'receipt'; step: TransferStep }
  | { kind: 'confirm'; step: TransferStep }
  | { kind: 'reject'; step: TransferStep }
  | { kind: 'deed' }
  | { kind: 'registry' }
  | { kind: 'cancel' };

const PAYMENT_TYPES = ['DEPOSIT', 'BALANCE'];

/**
 * A sale file. Money never goes through DLand: the buyer pays the notary's escrow account,
 * uploads the receipt, and the notary confirms each step (each confirmation is a chain block).
 */
export default function TransferScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const me = useAuth((s) => s.user);
  const queryClient = useQueryClient();
  const [action, setAction] = useState<Action | null>(null);
  const [deposit, setDeposit] = useState('');
  const [newTitle, setNewTitle] = useState('');

  const query = useQuery({
    queryKey: ['transfer', id],
    queryFn: async () => (await api.get<{ transfer: Transfer }>(`/transfers/${id}`)).data.transfer,
  });

  const run = useMutation({
    mutationFn: async ({ a, text }: { a: Action; text: string }) => {
      const base = `/notary/transfers/${id}`;
      switch (a.kind) {
        case 'claim':
          return api.post(`${base}/claim`, { depositAmount: deposit.trim() === '' ? undefined : Number(deposit.replace(',', '.')) });
        case 'receipt': {
          const picked = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
          if (picked.canceled || !picked.assets[0]) return 'cancelled';
          const f = picked.assets[0];
          return upload(`/transfers/${id}/steps/${a.step.id}/proof`, { proof: { uri: f.uri, name: f.name, type: f.mimeType ?? 'application/pdf' } }, { paymentReference: text });
        }
        case 'confirm':
          return api.post(`${base}/steps/${a.step.id}/confirm`, { note: text || undefined });
        case 'reject':
          return api.post(`${base}/steps/${a.step.id}/reject`, { reason: text });
        case 'deed':
          return api.post(`${base}/complete`, { deedReference: text });
        case 'registry':
          return api.post(`${base}/registry`, { registryReference: text, titleDeedNumber: newTitle.trim() || undefined });
        case 'cancel':
          return api.post(`${base}/cancel`, { reason: text });
      }
    },
    onSuccess: (result, { a }) => {
      setAction(null);
      if (result === 'cancelled') return;
      void queryClient.invalidateQueries({ queryKey: ['transfer', id] });
      void queryClient.invalidateQueries({ queryKey: ['transfers'] });
      void queryClient.invalidateQueries({ queryKey: ['notary'] });
      void queryClient.invalidateQueries({ queryKey: ['land'] });
      const messages: Partial<Record<Action['kind'], string>> = {
        claim: t('sale.claimed'),
        receipt: t('sale.receiptSent'),
        confirm: t('sale.confirmed'),
        deed: t('notary.completed'),
        registry: t('sale.registryDone'),
        cancel: t('notary.cancelled'),
      };
      if (messages[a.kind]) showAlert(t('common.success'), messages[a.kind]);
    },
    onError: (err) => showAlert(t('common.error'), errorMessage(err)),
  });

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const tr = query.data;
  const steps = tr.steps ?? [];
  const isBuyer = me?.id === tr.buyerId;
  const isAssignedNotary = Boolean(tr.notaryId) && me?.id === tr.notaryId;
  const canClaim = me?.role === 'NOTARY' && tr.status === 'PENDING_NOTARY' && me.id !== tr.buyerId && me.id !== tr.sellerId;
  const paymentsDone = steps.filter((s) => PAYMENT_TYPES.includes(s.type)).every((s) => s.status === 'CONFIRMED');
  const canCancel = (canClaim || isAssignedNotary) && (tr.status === 'PENDING_NOTARY' || tr.status === 'IN_PROGRESS');
  const money = (v: string | null) => (v ? formatMoney(v, tr.currency) : '');

  const openAction = (a: Action) => {
    if (a.kind === 'claim') {
      if (!me?.escrowBankName || !me.escrowAccountNumber) {
        showAlert(t('common.error'), t('sale.escrowMissing'));
        return;
      }
      setDeposit(String(Math.round(Number(tr.price) * 0.1)));
    }
    if (a.kind === 'registry') setNewTitle('');
    setAction(a);
  };

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <Stack.Screen options={{ title: tr.reference ?? t('sale.title') }} />

      <Card onPress={() => router.push(`/land/${tr.landId}`)}>
        <Row>
          <Image source={{ uri: fileUrl(tr.land.images[0]?.url) }} style={styles.thumb} />
          <View style={{ flex: 1 }}>
            <Text style={font.h3} numberOfLines={1}>
              {tr.land.title}
            </Text>
            <Text style={[font.h2, { color: colors.primaryDark }]}>{formatMoney(tr.price, tr.currency)}</Text>
            <Text style={font.small}>{tr.land.reference}</Text>
          </View>
          <Badge label={t(`transferStatus.${tr.status}`)} tone={toneForStatus(tr.status)} />
        </Row>
        <View style={{ marginTop: spacing.sm }}>
          <KeyValue label={t('transfers.seller')} value={fullName(tr.seller)} />
          <KeyValue label={t('transfers.buyer')} value={fullName(tr.buyer)} />
          {tr.notary ? <KeyValue label={t('sale.notary')} value={fullName(tr.notary)} /> : null}
        </View>
      </Card>

      <Banner tone="warning" icon="shield-checkmark" text={t('sale.noMoneyNotice')} />

      {tr.status === 'PENDING_NOTARY' ? <Banner tone="info" icon="hourglass" text={t('sale.waitingNotary')} /> : null}
      {tr.status === 'CANCELLED' && tr.notaryNote ? <Banner tone="danger" icon="close-circle" text={tr.notaryNote} /> : null}

      {tr.notary && tr.status === 'IN_PROGRESS' ? (
        <Section title={t('sale.howToPay')}>
          <Card style={{ borderColor: colors.primary, borderWidth: 1.5 }}>
            <KeyValue label={t('sale.notary')} value={`${fullName(tr.notary)}${tr.notary.licenseNumber ? ` · ${tr.notary.licenseNumber}` : ''}`} />
            <KeyValue label={t('sale.bank')} value={tr.notary.escrowBankName ?? '—'} />
            <KeyValue label={t('sale.accountName')} value={tr.notary.escrowAccountName ?? '—'} />
            <KeyValue label={t('sale.accountNumber')} value={tr.notary.escrowAccountNumber ?? '—'} mono />
            {tr.notary.escrowMobileMoney ? <KeyValue label={t('sale.mobileMoney')} value={tr.notary.escrowMobileMoney} mono /> : null}
            <View style={styles.reference}>
              <Text style={font.small}>{t('sale.reference')}</Text>
              <Text style={styles.referenceText} selectable>
                {tr.reference}
              </Text>
            </View>
          </Card>
        </Section>
      ) : null}

      {steps.length > 0 ? (
        <Section title={t('sale.steps')}>
          {steps.map((step, i) => {
            const isPayment = PAYMENT_TYPES.includes(step.type);
            const buyerCanUpload = isBuyer && isPayment && tr.status === 'IN_PROGRESS' && (step.status === 'PENDING' || step.status === 'REJECTED');
            const notaryCanReview = isAssignedNotary && isPayment && step.status === 'SUBMITTED';
            const notaryCanSign = isAssignedNotary && step.type === 'DEED_SIGNED' && tr.status === 'IN_PROGRESS' && paymentsDone;
            const notaryCanRegister = isAssignedNotary && step.type === 'REGISTERED' && tr.status === 'COMPLETED' && !tr.registeredAt;
            const blockHash = step.block?.hash ?? (step.type === 'DEED_SIGNED' ? tr.block?.hash : undefined);
            const blockIndex = step.block?.index ?? (step.type === 'DEED_SIGNED' ? tr.block?.index : undefined);
            return (
              <Card key={step.id}>
                <Row>
                  <View style={[styles.stepNumber, step.status === 'CONFIRMED' && { backgroundColor: colors.primary }]}>
                    {step.status === 'CONFIRMED' ? (
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    ) : (
                      <Text style={{ fontWeight: '700', color: colors.primaryDark }}>{i + 1}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={font.h3}>{t(`stepType.${step.type}`)}</Text>
                    {step.amount ? <Text style={[font.body, { fontWeight: '600' }]}>{money(step.amount)}</Text> : null}
                  </View>
                  <Badge label={t(`stepStatus.${step.status}`)} tone={toneForStatus(step.status)} />
                </Row>

                {step.proofSha256 ? (
                  <Pressable
                    onPress={() =>
                      openPrivateFile(`/transfers/${tr.id}/steps/${step.id}/proof/link`).catch((err) => showAlert(t('common.error'), errorMessage(err)))
                    }
                    style={{ marginTop: spacing.sm }}
                  >
                    <Row>
                      <Ionicons name="receipt-outline" size={16} color={colors.primary} />
                      <Text style={{ color: colors.primary, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                        {t('sale.viewReceipt')} · {step.proofName}
                      </Text>
                    </Row>
                  </Pressable>
                ) : null}
                {step.paymentReference ? <Text style={font.small}>{step.paymentReference}</Text> : null}
                {step.proofSha256 ? <Text style={[font.mono, { color: colors.textMuted }]}>SHA-256 {shortHash(step.proofSha256, 12)}</Text> : null}
                {step.note ? (
                  <Text style={[font.body, { marginTop: spacing.xs, color: step.status === 'REJECTED' ? colors.danger : colors.text }]}>
                    {step.type === 'DEED_SIGNED'
                      ? t('sale.deedRef', { ref: step.note })
                      : step.type === 'REGISTERED'
                        ? t('sale.registryRef', { ref: step.note })
                        : step.note}
                  </Text>
                ) : null}
                {step.confirmedAt ? <Text style={font.small}>{formatDate(step.confirmedAt, true)}</Text> : null}
                {blockHash ? (
                  <Pressable onPress={() => router.push(`/chain/${blockHash}`)}>
                    <Row style={{ marginTop: spacing.xs }}>
                      <Ionicons name="cube" size={14} color={colors.chain} />
                      <Text style={{ color: colors.chain, fontWeight: '600' }}>
                        {t('sale.block', { index: blockIndex })} · {shortHash(blockHash)}
                      </Text>
                    </Row>
                  </Pressable>
                ) : null}

                {buyerCanUpload ? (
                  <Button
                    title={step.status === 'REJECTED' ? t('sale.reuploadReceipt') : t('sale.uploadReceipt')}
                    icon="cloud-upload-outline"
                    small
                    style={{ marginTop: spacing.md }}
                    onPress={() => openAction({ kind: 'receipt', step })}
                  />
                ) : null}
                {notaryCanReview ? (
                  <Row style={{ marginTop: spacing.md }}>
                    <Button title={t('sale.reject')} variant="danger" small style={{ flex: 1 }} onPress={() => openAction({ kind: 'reject', step })} />
                    <Button title={t('sale.confirm')} icon="checkmark" small style={{ flex: 1 }} onPress={() => openAction({ kind: 'confirm', step })} />
                  </Row>
                ) : null}
                {notaryCanSign ? (
                  <Button title={t('sale.complete')} icon="create-outline" small style={{ marginTop: spacing.md }} onPress={() => openAction({ kind: 'deed' })} />
                ) : null}
                {notaryCanRegister ? (
                  <Button title={t('sale.registry')} icon="library-outline" small style={{ marginTop: spacing.md }} onPress={() => openAction({ kind: 'registry' })} />
                ) : null}
              </Card>
            );
          })}
        </Section>
      ) : tr.status === 'COMPLETED' ? (
        <Banner tone="neutral" text={t('sale.legacy')} />
      ) : null}

      {canClaim ? <Button title={t('sale.claim')} icon="briefcase-outline" onPress={() => openAction({ kind: 'claim' })} /> : null}
      {canCancel ? (
        <Button title={t('sale.cancel')} variant="ghost" small style={{ marginTop: spacing.md }} onPress={() => openAction({ kind: 'cancel' })} />
      ) : null}

      <PromptModal
        visible={action !== null}
        loading={run.isPending}
        onClose={() => setAction(null)}
        onConfirm={(text) => action && run.mutate({ a: action, text })}
        {...promptProps(action, t, tr.currency)}
      >
        {action?.kind === 'claim' ? (
          <TextField label={t('sale.depositLabel', { currency: tr.currency })} value={deposit} onChangeText={setDeposit} keyboardType="numeric" />
        ) : null}
        {action?.kind === 'registry' ? <TextField label={t('sale.newTitleNumber')} value={newTitle} onChangeText={setNewTitle} /> : null}
      </PromptModal>
    </Screen>
  );
}

/** Title, message and input of the confirmation dialog for each action. */
function promptProps(action: Action | null, t: ReturnType<typeof useTranslation>['t'], currency: string) {
  switch (action?.kind) {
    case 'claim':
      return { title: t('sale.claim'), message: t('sale.claimMessage', { currency }) };
    case 'receipt':
      return {
        title: t('sale.receiptTitle'),
        message: t('sale.receiptMessage'),
        inputLabel: t('sale.paymentReferenceLabel'),
        confirmLabel: t('sale.chooseReceipt'),
      };
    case 'confirm':
      return { title: t('sale.confirm'), message: t('sale.confirmMessage'), inputLabel: t('notary.comment') };
    case 'reject':
      return { title: t('sale.reject'), inputLabel: t('sale.rejectReason'), inputRequired: true, destructive: true };
    case 'deed':
      return { title: t('sale.complete'), message: t('sale.completeMessage'), inputLabel: t('sale.deedReference'), inputRequired: true };
    case 'registry':
      return { title: t('sale.registry'), message: t('sale.registryMessage'), inputLabel: t('sale.registryReference'), inputRequired: true };
    case 'cancel':
      return { title: t('sale.cancel'), inputLabel: t('sale.cancelReason'), inputRequired: true, destructive: true };
    default:
      return { title: '' };
  }
}

const styles = StyleSheet.create({
  thumb: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.border },
  reference: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
  },
  referenceText: { fontSize: 22, fontWeight: '800', letterSpacing: 1, color: colors.primaryDark, fontFamily: 'monospace' },
  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
