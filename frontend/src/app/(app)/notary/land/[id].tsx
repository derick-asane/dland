import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import { openPrivateFile } from '@/api/files';
import type { OverlapReport } from '@/api/types';
import { useLand } from '@/hooks/useLand';
import { ParcelPreview } from '@/components/map/ParcelPreview';
import { BoundaryReport } from '@/components/map/BoundaryReport';
import { ImageGallery } from '@/components/ImageGallery';
import { PromptModal } from '@/components/PromptModal';
import { Banner, Button, Card, ErrorState, KeyValue, Loading, Row, Screen, Section } from '@/components/ui';
import { colors, font, spacing } from '@/theme';
import { errorMessage, formatDate, formatMoney, formatNumber, fullName, shortHash } from '@/utils/format';
import { showAlert } from '@/utils/alert';

/** Notary review: check the documents against the registry, then approve (→ chain) or reject. */
export default function NotaryReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const query = useLand(id);
  const report = useQuery({
    queryKey: ['land', id, 'overlaps', query.data?.boundaryHash],
    queryFn: async () => (await api.get<OverlapReport>(`/lands/${id}/overlaps`)).data,
    enabled: Boolean(query.data),
  });
  const [checks, setChecks] = useState([false, false, false]);
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);

  const decide = useMutation({
    mutationFn: async ({ kind, text }: { kind: 'approve' | 'reject'; text: string }) => {
      if (kind === 'approve') await api.post(`/notary/lands/${id}/approve`, { comment: text || undefined });
      else await api.post(`/notary/lands/${id}/reject`, { reason: text });
    },
    onSuccess: (_r, { kind }) => {
      setDecision(null);
      void queryClient.invalidateQueries({ queryKey: ['notary'] });
      void queryClient.invalidateQueries({ queryKey: ['land', id] });
      showAlert(t('common.success'), kind === 'approve' ? t('notary.approved') : t('notary.rejected'));
      router.back();
    },
    onError: (err) => {
      setDecision(null);
      showAlert(t('common.error'), errorMessage(err));
    },
  });

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const land = query.data;
  const pending = land.status === 'PENDING_VERIFICATION';
  const checklist = [t('notary.check1'), t('notary.check2'), t('notary.check3')];
  // Why "Approve" is disabled, in priority order (null = can approve).
  // The server also refuses to register a parcel with no boundary or overlapping one already on the chain.
  const approveBlocker = !land.boundary
    ? t('notary.blockNoBoundary')
    : report.data?.overlaps.some((o) => o.registeredOnChain)
      ? t('notary.blockOverlap')
      : !report.data
        ? t('notary.blockLoading')
        : !checks.every(Boolean)
          ? t('notary.blockChecklist', { done: checks.filter(Boolean).length, total: checks.length })
          : null;

  return (
    <>
      <Screen
        contentStyle={{ padding: 0 }}
        footer={
          pending ? (
            <View>
              {approveBlocker ? (
                <Row style={{ marginBottom: spacing.sm, alignItems: 'flex-start' }}>
                  <Ionicons name="information-circle" size={18} color={colors.warning} />
                  <Text style={[font.small, { flex: 1, color: colors.warning }]}>{approveBlocker}</Text>
                </Row>
              ) : null}
              <Row>
                <Button title={t('notary.reject')} variant="danger" style={{ flex: 1 }} onPress={() => setDecision('reject')} />
                <Button
                  title={t('notary.approve')}
                  icon="cube-outline"
                  style={{ flex: 1 }}
                  disabled={approveBlocker !== null}
                  onPress={() => setDecision('approve')}
                />
              </Row>
            </View>
          ) : undefined
        }
      >
        <ImageGallery images={land.images} height={200} />
        <View style={{ padding: spacing.lg }}>
          <Text style={font.h2}>{land.title}</Text>
          <Text style={[font.small, { marginBottom: spacing.lg }]}>
            {land.reference} · {land.submittedAt ? t('notary.submittedOn', { date: formatDate(land.submittedAt) }) : ''}
          </Text>

          <Section title={t('land.details')}>
            <Card>
              <KeyValue label={t('land.owner')} value={fullName(land.owner)} />
              <KeyValue label={t('land.parcelNumber')} value={land.parcelNumber} />
              <KeyValue label={t('land.titleDeedNumber')} value={land.titleDeedNumber} />
              <KeyValue label={t('land.area')} value={t('common.sqm', { value: formatNumber(land.areaSqm) })} />
              <KeyValue label={t('land.location')} value={`${land.address}, ${land.city}, ${land.country}`} />
              <KeyValue label={t('land.type')} value={t(`landType.${land.landType}`)} />
              <KeyValue label={t('land.price')} value={formatMoney(land.price, land.currency)} />
              <KeyValue label={t('land.history')} value={land.registeredOnChain ? t('land.onChain') : t('land.notOnChain')} />
            </Card>
          </Section>

          <Section title={t('map.boundaryCheck')}>
            {land.boundary ? (
              <>
                <ParcelPreview land={land} showNeighbours showArea={false} overlappingIds={report.data?.overlaps.map((o) => o.landId)} height={260} />
                {report.data ? (
                  <View style={{ marginTop: spacing.md }}>
                    <BoundaryReport overlaps={report.data.overlaps} areaCheck={report.data.areaCheck} />
                  </View>
                ) : null}
              </>
            ) : (
              <Banner tone="danger" icon="map-outline" text={t('errors.BOUNDARY_REQUIRED')} />
            )}
          </Section>

          <Section title={t('land.documents')}>
            {land.documents?.map((d) => (
              <Card key={d.id} onPress={() => openPrivateFile(`/lands/${land.id}/documents/${d.id}/link`).catch((err) => showAlert(t('common.error'), errorMessage(err)))}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={font.h3}>{t(`documentType.${d.type}`)}</Text>
                    <Text style={font.small}>{d.name}</Text>
                    <Text style={[font.mono, { color: colors.textMuted }]}>SHA-256 {shortHash(d.sha256, 12)}</Text>
                  </View>
                  <Ionicons name="open-outline" size={20} color={colors.primary} />
                </Row>
              </Card>
            ))}
          </Section>

          <Section title={t('land.description')}>
            <Text style={font.body}>{land.description}</Text>
          </Section>

          {pending ? (
            <Section title={t('notary.checklist')}>
              {checklist.map((label, i) => (
                <Pressable
                  key={label}
                  onPress={() => setChecks((c) => c.map((v, j) => (j === i ? !v : v)))}
                  style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', paddingVertical: spacing.sm }}
                >
                  <Ionicons name={checks[i] ? 'checkbox' : 'square-outline'} size={24} color={colors.primary} />
                  <Text style={[font.body, { flex: 1 }]}>{label}</Text>
                </Pressable>
              ))}
            </Section>
          ) : null}
        </View>
      </Screen>

      <PromptModal
        visible={decision !== null}
        title={decision === 'approve' ? t('notary.approve') : t('notary.reject')}
        message={decision === 'approve' ? t('notary.approveConfirm') : undefined}
        inputLabel={decision === 'approve' ? t('notary.comment') : t('notary.rejectReason')}
        inputRequired={decision === 'reject'}
        destructive={decision === 'reject'}
        loading={decide.isPending}
        onClose={() => setDecision(null)}
        onConfirm={(text) => decision && decide.mutate({ kind: decision, text })}
      />
    </>
  );
}
