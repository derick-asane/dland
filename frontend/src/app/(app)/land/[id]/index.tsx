import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import { openPrivateFile } from '@/api/files';
import type { Conversation, Land, Visit } from '@/api/types';
import { useLand } from '@/hooks/useLand';
import { can, useAuth } from '@/store/auth';
import { FavoriteButton } from '@/components/FavoriteButton';
import { ImageGallery } from '@/components/ImageGallery';
import { ParcelPreview } from '@/components/map/ParcelPreview';
import { missingDocuments } from '@/components/land/DocumentsManager';
import { PromptModal } from '@/components/PromptModal';
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  ChipGroup,
  ErrorState,
  KeyValue,
  Loading,
  Row,
  Screen,
  Section,
  toneForStatus,
} from '@/components/ui';
import { colors, font, spacing } from '@/theme';
import { errorMessage, formatDate, formatMoney, formatNumber, fullName, shortHash } from '@/utils/format';
import { showAlert } from '@/utils/alert';

const REPORT_REASONS = ['FRAUD', 'WRONG_INFORMATION', 'DUPLICATE', 'INAPPROPRIATE', 'OTHER'] as const;
type ReportReason = (typeof REPORT_REASONS)[number];

export default function LandDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const query = useLand(id);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>('FRAUD');
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null);
  const [blockAction, setBlockAction] = useState<'block' | 'unblock' | null>(null);
  const isAdmin = can.administer(useAuth((s) => s.user));

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['land', id] });
    void queryClient.invalidateQueries({ queryKey: ['lands'] });
  };

  const action = useMutation({
    mutationFn: async (kind: 'archive' | 'delete') => {
      if (kind === 'delete') return api.delete(`/lands/${id}`);
      return api.post(`/lands/${id}/archive`);
    },
    onSuccess: (_r, kind) => {
      setConfirm(null);
      refreshAll();
      if (kind === 'delete') router.back();
    },
    onError: (err) => {
      setConfirm(null);
      showAlert(t('common.error'), errorMessage(err));
    },
  });

  const contact = useMutation({
    mutationFn: async () => (await api.post<{ conversation: Conversation }>('/conversations', { landId: id })).data.conversation,
    onSuccess: (c) => router.push(`/chat/${c.id}`),
    onError: (err) => showAlert(t('common.error'), errorMessage(err)),
  });

  const block = useMutation({
    mutationFn: ({ kind, reason }: { kind: 'block' | 'unblock'; reason: string }) =>
      api.post(`/admin/lands/${id}/${kind}`, kind === 'block' ? { reason } : {}),
    onSuccess: () => {
      setBlockAction(null);
      refreshAll();
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (err) => showAlert(t('common.error'), errorMessage(err)),
  });

  const report = useMutation({
    mutationFn: (details: string) => api.post(`/lands/${id}/reports`, { reason: reportReason, details: details || undefined }),
    onSuccess: () => {
      setReportOpen(false);
      showAlert(t('common.success'), t('land.reportSent'));
    },
    onError: (err) => showAlert(t('common.error'), errorMessage(err)),
  });

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorState message={t('land.notFound')} onRetry={() => query.refetch()} />;
  const land = query.data;
  const isOwner = Boolean(land.isOwner);
  const canBuy = !isOwner && land.status === 'PUBLISHED' && !land.myOffer && !land.frozen;

  const blocked = Boolean(land.blockedAt);
  const canVisit = !isOwner && land.status === 'PUBLISHED' && !land.frozen && !blocked;

  const footer = blocked ? null : isOwner ? (
    <OwnerActions land={land} onAction={setConfirm} />
  ) : land.status === 'PUBLISHED' || land.status === 'UNDER_OFFER' ? (
    <Row>
      <Button
        title={t('land.contactSeller')}
        icon="chatbubble-outline"
        variant="secondary"
        style={{ flex: 1 }}
        loading={contact.isPending}
        onPress={() => contact.mutate()}
      />
      {canBuy ? (
        <Button title={t('land.makeOffer')} icon="pricetag-outline" style={{ flex: 1 }} onPress={() => router.push(`/land/${land.id}/offer`)} />
      ) : null}
    </Row>
  ) : null;

  return (
    <>
      <Stack.Screen
        options={{
          title: land.reference,
          headerRight: () => <FavoriteButton landId={land.id} isFavorite={Boolean(land.isFavorite)} />,
        }}
      />
      <Screen
        contentStyle={{ padding: 0 }}
        footer={footer}
        refreshing={query.isRefetching}
        onRefresh={() => query.refetch()}
      >
        <ImageGallery images={land.images} />
        <View style={{ padding: spacing.lg }}>
          <Row style={{ flexWrap: 'wrap', marginBottom: spacing.sm }}>
            {blocked ? (
              <Badge label={t('block.badge')} tone="danger" icon="ban" />
            ) : (
              <Badge label={t(`status.${land.status}`)} tone={toneForStatus(land.status)} />
            )}
            <Badge
              label={land.registeredOnChain ? t('land.onChain') : t('land.notOnChain')}
              tone={land.registeredOnChain ? 'chain' : 'neutral'}
              icon={land.registeredOnChain ? 'cube' : 'cube-outline'}
            />
          </Row>
          <Text style={[font.h1, { color: colors.primaryDark }]}>{formatMoney(land.price, land.currency)}</Text>
          <Text style={[font.small, { marginBottom: spacing.sm }]}>
            {t('land.pricePerSqm', { value: formatMoney(Number(land.price) / land.areaSqm, land.currency) })}
          </Text>
          <Text style={font.h2}>{land.title}</Text>
          <Row style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>
            <Ionicons name="location-outline" size={16} color={colors.textMuted} />
            <Text style={font.small}>
              {land.address}, {land.city}
              {land.region ? `, ${land.region}` : ''}, {land.country}
            </Text>
          </Row>

          {blocked ? (
            <Banner tone="danger" icon="ban" text={t('block.banner', { reason: land.blockReason ?? '' })} />
          ) : null}
          {land.frozen ? (
            <Banner tone="danger" icon="lock-closed" text={t('dispute.frozenBanner')} />
          ) : land.openDisputes ? (
            <Banner tone="warning" icon="warning" text={t('dispute.openBanner', { count: land.openDisputes })} />
          ) : null}
          {blocked ? null : <StatusBanner land={land} />}

          {isOwner && land.pendingVisits ? (
            <Card onPress={() => router.push({ pathname: '/visits', params: { as: 'owner' } })} style={{ backgroundColor: colors.warningLight, borderColor: colors.warningLight }}>
              <Row>
                <Ionicons name="walk" size={20} color={colors.warning} />
                <Text style={{ color: colors.warning, flex: 1, fontWeight: '600' }}>{t('visit.pendingOnLand', { count: land.pendingVisits })}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.warning} />
              </Row>
            </Card>
          ) : null}
          {land.myVisit ? <MyVisitCard visit={land.myVisit} /> : canVisit ? (
            <Button
              title={t('visit.request')}
              icon="walk-outline"
              variant="secondary"
              style={{ marginBottom: spacing.md }}
              onPress={() => router.push({ pathname: '/visit/new', params: { landId: land.id } })}
            />
          ) : null}

          {land.myOffer ? (
            <Banner
              tone="info"
              icon="pricetag"
              text={t('land.yourOffer', {
                amount: formatMoney(land.myOffer.amount, land.currency),
                status: t(`offerStatus.${land.myOffer.status}`),
              })}
            />
          ) : null}

          <Section title={t('land.details')}>
            <Card>
              <KeyValue label={t('land.area')} value={t('common.sqm', { value: formatNumber(land.areaSqm) })} />
              <KeyValue label={t('land.type')} value={t(`landType.${land.landType}`)} />
              <KeyValue label={t('land.reference')} value={land.reference} />
              <KeyValue label={t('land.parcelNumber')} value={land.parcelNumber} />
              <KeyValue label={t('land.titleDeedNumber')} value={land.titleDeedNumber} />
              {land.latitude != null && land.longitude != null ? (
                <KeyValue
                  label={t('land.location')}
                  value={
                    <Pressable onPress={() => Linking.openURL(`https://maps.google.com/?q=${land.latitude},${land.longitude}`)}>
                      <Text style={{ color: colors.primary, fontWeight: '600' }}>
                        {land.latitude.toFixed(4)}, {land.longitude.toFixed(4)}
                      </Text>
                    </Pressable>
                  }
                />
              ) : null}
              <KeyValue label={t('land.views', { count: land.viewsCount })} value={`♥ ${land._count?.favorites ?? 0}`} />
            </Card>
          </Section>

          {land.boundary || land.latitude != null ? (
            <Section title={t('map.section')}>
              <ParcelPreview land={land} />
            </Section>
          ) : null}

          <Section title={t('land.description')}>
            <Text style={[font.body, { lineHeight: 22 }]}>{land.description}</Text>
          </Section>

          {land.registeredOnChain ? (
            <Section title={t('land.history')}>
              <Card style={{ backgroundColor: colors.chainLight, borderColor: colors.chainLight }}>
                <Text style={[font.small, { color: colors.chain, marginBottom: spacing.md }]}>{t('land.historyHint')}</Text>
                <Row>
                  <Button title={t('land.history')} icon="git-commit-outline" small variant="secondary" style={{ flex: 1 }} onPress={() => router.push(`/land/${land.id}/history`)} />
                  <Button title={t('land.certificate')} icon="qr-code-outline" small variant="secondary" style={{ flex: 1 }} onPress={() => router.push(`/land/${land.id}/certificate`)} />
                </Row>
              </Card>
            </Section>
          ) : null}

          <Section title={t('land.documents')}>
            <Text style={[font.small, { marginBottom: spacing.sm }]}>{t('land.documentsHint')}</Text>
            {land.documents?.length ? (
              land.documents.map((d) => (
                <Card key={d.id}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={font.h3}>{t(`documentType.${d.type}`)}</Text>
                      <Text style={font.small} numberOfLines={1}>
                        {d.name}
                      </Text>
                    </View>
                    {d.canOpen ? (
                      <Button title={t('land.openDocument')} small variant="ghost" icon="open-outline" onPress={() => openPrivateFile(`/lands/${land.id}/documents/${d.id}/link`).catch((err) => showAlert(t('common.error'), errorMessage(err)))} />
                    ) : (
                      <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
                    )}
                  </Row>
                  <Text style={[font.mono, { color: colors.textMuted, marginTop: spacing.xs }]}>
                    {t('land.fingerprint')}: {shortHash(d.sha256, 12)}
                  </Text>
                </Card>
              ))
            ) : (
              <Text style={font.small}>{t('land.noDocuments')}</Text>
            )}
          </Section>

          {land.notary ? (
            <Section title={t('land.verificationHistory')}>
              {land.verifications?.map((v) => (
                <Card key={v.id}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Badge label={t(`verificationDecision.${v.decision}`)} tone={toneForStatus(v.decision)} />
                    <Text style={font.small}>{formatDate(v.createdAt)}</Text>
                  </Row>
                  <Text style={[font.small, { marginTop: spacing.xs }]}>{t('land.verifiedBy', { name: fullName(v.notary) })}</Text>
                  {v.comment ? <Text style={[font.body, { marginTop: spacing.xs }]}>{v.comment}</Text> : null}
                </Card>
              ))}
            </Section>
          ) : null}

          <Section title={t('land.owner')}>
            <Card onPress={() => router.push(`/user/${land.owner.id}`)}>
              <Row>
                <Avatar url={land.owner.avatarUrl} name={fullName(land.owner)} />
                <View style={{ flex: 1 }}>
                  <Text style={font.h3}>{fullName(land.owner)}</Text>
                  <Text style={font.small}>{t(`roles.${land.owner.role}`)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Row>
            </Card>
          </Section>

          {!isOwner && land.registeredOnChain ? (
            <Button
              title={t('dispute.challenge')}
              variant="ghost"
              icon="shield-half-outline"
              onPress={() => router.push({ pathname: '/dispute/new', params: { landId: land.id } })}
            />
          ) : null}
          {!isOwner && !isAdmin ? (
            <Button title={t('land.report')} variant="ghost" icon="flag-outline" onPress={() => setReportOpen(true)} />
          ) : null}
          {isAdmin && land.status !== 'DRAFT' ? (
            <Section title={t('block.adminSection')}>
              {blocked ? (
                <Button title={t('block.unblock')} icon="checkmark-circle-outline" variant="secondary" onPress={() => setBlockAction('unblock')} />
              ) : (
                <Button title={t('block.action')} icon="ban-outline" variant="danger" onPress={() => setBlockAction('block')} />
              )}
            </Section>
          ) : null}
        </View>
      </Screen>

      <PromptModal
        visible={reportOpen}
        title={t('land.report')}
        message={t('land.reportTitle')}
        inputLabel={t('land.reportDetails')}
        loading={report.isPending}
        onClose={() => setReportOpen(false)}
        onConfirm={(text) => report.mutate(text)}
      >
        <ChipGroup value={reportReason} onChange={setReportReason} options={REPORT_REASONS.map((r) => ({ value: r, label: t(`reportReason.${r}`) }))} />
      </PromptModal>

      <PromptModal
        visible={blockAction !== null}
        title={blockAction === 'unblock' ? t('block.unblock') : t('block.action')}
        message={blockAction === 'unblock' ? t('block.unblockConfirm') : t('block.confirm')}
        inputLabel={blockAction === 'block' ? t('block.reason') : undefined}
        inputRequired={blockAction === 'block'}
        destructive={blockAction === 'block'}
        loading={block.isPending}
        onClose={() => setBlockAction(null)}
        onConfirm={(reason) => blockAction && block.mutate({ kind: blockAction, reason })}
      />

      <PromptModal
        visible={confirm !== null}
        title={confirm === 'delete' ? t('common.delete') : t('land.archive')}
        message={confirm === 'delete' ? t('land.deleteConfirm') : t('land.archiveConfirm')}
        destructive
        loading={action.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && action.mutate(confirm)}
      />
    </>
  );
}

/** The visitor's own request on this land: status and date, opens the visit. */
function MyVisitCard({ visit }: { visit: Visit }) {
  const { t } = useTranslation();
  const confirmed = visit.status === 'CONFIRMED' && visit.scheduledAt;
  return (
    <Card
      onPress={() => router.push(`/visit/${visit.id}`)}
      style={{ backgroundColor: confirmed ? colors.primaryLight : colors.infoLight, borderColor: confirmed ? colors.primaryLight : colors.infoLight }}
    >
      <Row>
        <Ionicons name={confirmed ? 'calendar' : 'walk'} size={20} color={confirmed ? colors.primaryDark : colors.info} />
        <Text style={{ color: confirmed ? colors.primaryDark : colors.info, flex: 1, fontWeight: '600' }}>
          {confirmed ? t('visit.scheduledFor', { date: formatDate(visit.scheduledAt!, true) }) : t('visit.waitingOwner')}
        </Text>
        <Ionicons name="chevron-forward" size={18} color={confirmed ? colors.primaryDark : colors.info} />
      </Row>
    </Card>
  );
}

function StatusBanner({ land }: { land: Land }) {
  const { t } = useTranslation();
  if (!land.isOwner && land.status !== 'SOLD' && land.status !== 'UNDER_OFFER') return null;
  switch (land.status) {
    case 'DRAFT':
      return <Banner text={t('land.draftInfo')} tone="neutral" />;
    case 'PENDING_VERIFICATION':
      return <Banner text={t('land.pendingInfo')} tone="warning" icon="hourglass" />;
    case 'REJECTED':
      return <Banner text={t('land.rejectedInfo', { reason: land.rejectionReason ?? '' })} tone="danger" icon="close-circle" />;
    case 'UNDER_OFFER':
      return <Banner text={t('land.underOfferInfo')} tone="info" icon="swap-horizontal" />;
    case 'SOLD':
      return <Banner text={t('land.soldInfo')} tone="chain" icon="cube" />;
    case 'ARCHIVED':
      return <Banner text={land.rejectionReason ?? t('land.archivedInfo')} tone="neutral" icon="archive" />;
    default:
      return null;
  }
}

/** First unfinished step of the guided listing. */
function nextSetupStep(land: Land) {
  if (!land.images.length) return 'photos';
  if (!land.boundary) return 'boundary';
  if (missingDocuments(land).length) return 'documents';
  return 'review';
}

function OwnerActions({ land, onAction }: { land: Land; onAction: (kind: 'archive' | 'delete') => void }) {
  const { t } = useTranslation();
  const archivable = ['DRAFT', 'REJECTED', 'PUBLISHED', 'PENDING_VERIFICATION'].includes(land.status);
  const deletable = land.status === 'DRAFT' && !land.registeredOnChain;
  const setup = (step: string) => router.push({ pathname: '/land/[id]/setup', params: { id: land.id, step } });
  return (
    <View style={{ gap: spacing.sm }}>
      {land.status === 'DRAFT' || land.status === 'REJECTED' ? (
        <Button title={t('wizard.continue')} icon="arrow-forward" onPress={() => setup(nextSetupStep(land))} />
      ) : land.status === 'SOLD' || land.status === 'ARCHIVED' ? (
        <Button title={t('land.relist')} icon="refresh" onPress={() => setup('details')} />
      ) : land.status === 'PUBLISHED' ? (
        <Button title={t('land.editListing')} icon="create-outline" variant="secondary" onPress={() => router.push(`/land/${land.id}/edit`)} />
      ) : null}
      {archivable || deletable ? (
        <Row>
          {archivable ? <Button title={t('land.archive')} variant="ghost" small style={{ flex: 1 }} onPress={() => onAction('archive')} /> : null}
          {deletable ? <Button title={t('common.delete')} variant="ghost" small style={{ flex: 1 }} onPress={() => onAction('delete')} /> : null}
        </Row>
      ) : null}
    </View>
  );
}
