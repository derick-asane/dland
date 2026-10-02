import { type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Land, OverlapReport } from '@/api/types';
import { useLand } from '@/hooks/useLand';
import { LandForm, toPayload } from '@/components/LandForm';
import { Stepper, type StepItem } from '@/components/land/Stepper';
import { PhotosManager } from '@/components/land/PhotosManager';
import { DocumentsManager, missingDocuments } from '@/components/land/DocumentsManager';
import { BoundaryEditor } from '@/components/map/BoundaryEditor';
import { BoundaryReport } from '@/components/map/BoundaryReport';
import { Banner, Button, Card, ErrorState, KeyValue, Loading, Row, Screen, Section } from '@/components/ui';
import { colors, font, spacing } from '@/theme';
import { errorMessage, formatMoney, formatNumber } from '@/utils/format';
import { showAlert } from '@/utils/alert';

const STEPS = ['details', 'photos', 'boundary', 'documents', 'review'] as const;
type SetupStep = (typeof STEPS)[number];
const EDITABLE = ['DRAFT', 'REJECTED', 'SOLD', 'ARCHIVED'];

/**
 * Guided listing: 1 Details → 2 Photos → 3 Draw the plot on the map → 4 Documents → 5 Review & submit.
 * Step 1 of a brand-new listing happens on /land/new; this screen covers an existing draft.
 */
export default function LandSetupScreen() {
  const { id, step: stepParam } = useLocalSearchParams<{ id: string; step?: string }>();
  const { t } = useTranslation();
  const query = useLand(id);
  const step: SetupStep = STEPS.includes(stepParam as SetupStep) ? (stepParam as SetupStep) : 'photos';

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const land = query.data;

  if (!land.isOwner || !EDITABLE.includes(land.status)) {
    return (
      <Screen>
        <Banner tone="info" text={t('wizard.notEditable')} />
        <Button title={t('wizard.viewListing')} onPress={() => router.replace(`/land/${land.id}`)} />
      </Screen>
    );
  }

  const done: Record<SetupStep, boolean> = {
    details: true,
    photos: land.images.length > 0,
    boundary: Boolean(land.boundary),
    documents: missingDocuments(land).length === 0,
    review: false,
  };
  const steps: StepItem<SetupStep>[] = STEPS.map((key) => ({ key, label: t(`wizard.step.${key}`), done: done[key] }));
  const go = (next: SetupStep) => router.setParams({ step: next });
  const index = STEPS.indexOf(step);
  const back = index > 0 ? () => go(STEPS[index - 1]) : undefined;
  const next = index < STEPS.length - 1 ? () => go(STEPS[index + 1]) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: t('wizard.stepOf', { n: index + 1, total: STEPS.length }) }} />
      <Stepper steps={steps} current={step} onSelect={go} />
      {step === 'boundary' ? (
        <BoundaryEditor
          land={land}
          // Move on automatically once the outline is saved without conflicts.
          onSaved={(r) => !r.overlaps.some((o) => o.registeredOnChain) && next?.()}
          footer={<StepNav onBack={back} onNext={next} nextDisabled={!done.boundary} />}
        />
      ) : (
        <Screen edges={['bottom']} footer={step === 'review' ? undefined : <StepNav onBack={back} onNext={next} nextDisabled={!done[step]} />}>
          {land.status === 'REJECTED' && land.rejectionReason ? (
            <Banner tone="danger" icon="close-circle" text={t('land.rejectedInfo', { reason: land.rejectionReason })} />
          ) : null}
          {step === 'details' ? <DetailsStep land={land} onSaved={() => go('photos')} /> : null}
          {step === 'photos' ? (
            <StepIntro title={t('wizard.photosTitle')} hint={t('wizard.photosHint')}>
              <PhotosManager land={land} />
              {!done.photos ? <Text style={[font.small, { marginTop: spacing.md, color: colors.warning }]}>{t('wizard.photosRequired')}</Text> : null}
            </StepIntro>
          ) : null}
          {step === 'documents' ? (
            <StepIntro title={t('wizard.documentsTitle')} hint={t('wizard.documentsHint')}>
              <DocumentsManager land={land} />
            </StepIntro>
          ) : null}
          {step === 'review' ? <ReviewStep land={land} done={done} go={go} onBack={back} /> : null}
        </Screen>
      )}
    </View>
  );
}

function StepIntro({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <View>
      <Text style={font.h2}>{title}</Text>
      <Text style={[font.small, { marginTop: spacing.xs, marginBottom: spacing.lg, lineHeight: 19 }]}>{hint}</Text>
      {children}
    </View>
  );
}

function StepNav({ onBack, onNext, nextDisabled }: { onBack?: () => void; onNext?: () => void; nextDisabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <Row style={{ marginTop: spacing.md }}>
      {onBack ? <Button title={t('wizard.back')} icon="arrow-back" variant="secondary" style={{ flex: 1 }} onPress={onBack} /> : null}
      {onNext ? <Button title={t('wizard.next')} style={{ flex: 1 }} onPress={onNext} disabled={nextDisabled} /> : null}
    </Row>
  );
}

function DetailsStep({ land, onSaved }: { land: Land; onSaved: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (payload: object) => api.patch(`/lands/${land.id}`, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['land', land.id] });
      onSaved();
    },
    onError: (err) => showAlert(t('common.error'), errorMessage(err)),
  });
  return <LandForm initial={land} submitLabel={t('wizard.saveAndContinue')} loading={save.isPending} onSubmit={(v) => save.mutate(toPayload(v))} />;
}

function ReviewStep({
  land,
  done,
  go,
  onBack,
}: {
  land: Land;
  done: Record<SetupStep, boolean>;
  go: (s: SetupStep) => void;
  onBack?: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const report = useQuery({
    queryKey: ['land', land.id, 'overlaps', land.boundaryHash],
    queryFn: async () => (await api.get<OverlapReport>(`/lands/${land.id}/overlaps`)).data,
    enabled: Boolean(land.boundaryHash),
  });
  const blocked = Boolean(report.data?.overlaps.some((o) => o.registeredOnChain));
  const ready = done.photos && done.boundary && done.documents && !blocked;
  const fee = land.listingFee;
  const feeDue = Boolean(fee?.required && !fee.paid);

  const submit = useMutation({
    mutationFn: () => api.post(`/lands/${land.id}/submit`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['land', land.id] });
      void queryClient.invalidateQueries({ queryKey: ['lands'] });
      showAlert(t('common.success'), t('land.submitted'));
      router.replace(`/land/${land.id}`);
    },
    onError: (err) => showAlert(t('common.error'), errorMessage(err)),
  });

  const check = (ok: boolean, label: string, fix: SetupStep) => (
    <Row style={{ paddingVertical: spacing.sm }}>
      <Ionicons name={ok ? 'checkmark-circle' : 'close-circle'} size={22} color={ok ? colors.primary : colors.danger} />
      <Text style={[font.body, { flex: 1 }]}>{label}</Text>
      {!ok ? <Button title={t('wizard.fix')} variant="ghost" small onPress={() => go(fix)} /> : null}
    </Row>
  );
  const missing = missingDocuments(land);

  return (
    <StepIntro title={t('wizard.reviewTitle')} hint={t('wizard.reviewHint')}>
      <Card>
        <Text style={font.h3}>{land.title}</Text>
        <Text style={[font.h2, { color: colors.primaryDark }]}>{formatMoney(land.price, land.currency)}</Text>
        <KeyValue label={t('land.location')} value={`${land.city}, ${land.country}`} />
        <KeyValue label={t('land.parcelNumber')} value={land.parcelNumber} />
        <KeyValue label={t('land.area')} value={t('common.sqm', { value: formatNumber(land.areaSqm) })} />
        <Button title={t('common.edit')} variant="ghost" small onPress={() => go('details')} />
      </Card>

      <Section title={t('wizard.checklist')}>
        <Card>
          {check(done.photos, t('wizard.checkPhotos', { count: land.images.length }), 'photos')}
          {check(done.boundary, t('wizard.checkBoundary'), 'boundary')}
          {check(
            done.documents,
            missing.length ? t('wizard.checkMissing', { documents: missing.map((m) => t(`documentType.${m}`)).join(', ') }) : t('wizard.checkDocuments'),
            'documents',
          )}
        </Card>
      </Section>

      {report.data?.hasBoundary ? (
        <Section title={t('map.boundaryCheck')}>
          <BoundaryReport overlaps={report.data.overlaps} areaCheck={report.data.areaCheck} />
        </Section>
      ) : null}

      {fee?.required ? (
        <Section title={t('pay.listingFee')}>
          <Card>
            {fee.paid ? (
              <Row>
                <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                <Text style={[font.body, { flex: 1 }]}>{t('pay.feePaid', { amount: formatMoney(fee.amount, fee.currency) })}</Text>
              </Row>
            ) : (
              <>
                <Text style={[font.h2, { color: colors.primaryDark }]}>{formatMoney(fee.amount, fee.currency)}</Text>
                <Text style={[font.small, { marginBottom: spacing.md }]}>{t('pay.why')}</Text>
                <Button
                  title={fee.pendingPaymentId ? t('pay.resume') : t('pay.payButton', { amount: formatMoney(fee.amount, fee.currency) })}
                  icon="phone-portrait-outline"
                  disabled={!ready}
                  onPress={() => router.push({ pathname: '/pay/listing-fee', params: { landId: land.id } })}
                />
              </>
            )}
          </Card>
        </Section>
      ) : null}

      <Banner tone="info" icon="ribbon-outline" text={t('wizard.notaryNext')} />
      <Button
        title={t('land.submitForVerification')}
        icon="send-outline"
        disabled={!ready || feeDue}
        loading={submit.isPending}
        onPress={() => submit.mutate()}
      />
      {onBack ? <Button title={t('wizard.back')} variant="ghost" style={{ marginTop: spacing.sm }} onPress={onBack} /> : null}
    </StepIntro>
  );
}
