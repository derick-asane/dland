import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, upload } from '@/api/client';
import { openPrivateFile } from '@/api/files';
import type { Dispute } from '@/api/types';
import { useAuth } from '@/store/auth';
import { PromptModal } from '@/components/PromptModal';
import { Avatar, Badge, Banner, Button, Card, ChipGroup, ErrorState, KeyValue, Loading, Row, Screen, Section, toneForStatus } from '@/components/ui';
import { colors, font, spacing } from '@/theme';
import { errorMessage, formatDate, fullName, shortHash } from '@/utils/format';
import { showAlert } from '@/utils/alert';

type Action = 'respond' | 'withdraw' | 'take' | 'freeze' | 'resolve' | 'lift';
type Outcome = 'UPHELD' | 'DISMISSED';
const ACTIVE = ['OPEN', 'UNDER_REVIEW'];

/** One ownership dispute: claim, evidence, owner's response, notary decision. */
export default function DisputeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const me = useAuth((s) => s.user);
  const queryClient = useQueryClient();
  const [action, setAction] = useState<Action | null>(null);
  const [outcome, setOutcome] = useState<Outcome>('DISMISSED');
  const [uploading, setUploading] = useState(false);

  const query = useQuery({
    queryKey: ['dispute', id],
    queryFn: async () => (await api.get<{ dispute: Dispute }>(`/disputes/${id}`)).data.dispute,
  });

  const refresh = () => {
    for (const queryKey of [['dispute', id], ['disputes'], ['land'], ['lands']]) void queryClient.invalidateQueries({ queryKey });
  };

  const run = useMutation({
    mutationFn: async ({ a, text }: { a: Action; text: string }) => {
      const d = query.data!;
      switch (a) {
        case 'respond':
          return api.post(`/disputes/${id}/response`, { text });
        case 'withdraw':
          return api.post(`/disputes/${id}/withdraw`);
        case 'take':
          return api.post(`/disputes/${id}/take`);
        case 'freeze':
          return api.post(`/disputes/${id}/freeze`);
        case 'resolve':
          return api.post(`/disputes/${id}/resolve`, { outcome, note: text });
        case 'lift':
          return api.post(`/disputes/lands/${d.landId}/unfreeze`, { note: text });
      }
    },
    onSuccess: () => {
      setAction(null);
      refresh();
      showAlert(t('common.success'), t('dispute.done'));
    },
    onError: (err) => showAlert(t('common.error'), errorMessage(err)),
  });

  const addEvidence = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    setUploading(true);
    try {
      await upload(`/disputes/${id}/evidence`, {
        evidence: result.assets.slice(0, 5).map((a) => ({ uri: a.uri, name: a.name, type: a.mimeType ?? 'application/pdf' })),
      });
      refresh();
    } catch (err) {
      showAlert(t('common.error'), errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const d = query.data;
  const active = ACTIVE.includes(d.status);
  const isClaimant = me?.id === d.claimantId;
  const isOwner = me?.id === d.land.ownerId;
  const isNotary = me?.role === 'NOTARY' && !isClaimant && !isOwner;
  const handling = isNotary && d.status === 'UNDER_REVIEW' && d.notaryId === me?.id;

  const prompt: Record<Action, { title: string; message?: string; inputLabel?: string; inputRequired?: boolean; destructive?: boolean }> = {
    respond: { title: t('dispute.respond'), inputLabel: t('dispute.responseLabel'), inputRequired: true },
    withdraw: { title: t('dispute.withdraw'), message: t('dispute.withdrawConfirm'), destructive: true },
    take: { title: t('dispute.take') },
    freeze: { title: t('dispute.freeze'), message: t('dispute.freezeConfirm'), destructive: true },
    resolve: { title: t('dispute.resolve'), message: t('dispute.resolveHint'), inputLabel: t('dispute.resolveNote'), inputRequired: true },
    lift: { title: t('dispute.lift'), message: t('dispute.liftConfirm'), inputLabel: t('dispute.liftNote'), inputRequired: true },
  };

  return (
    <Screen refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <Stack.Screen options={{ title: d.reference }} />

      <Card onPress={() => router.push(`/land/${d.landId}`)}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text style={font.h3}>{d.land.title}</Text>
            <Text style={font.small}>
              {d.land.reference} · {d.land.city}, {d.land.country}
            </Text>
          </View>
          <Badge label={t(`dispute.statuses.${d.status}`)} tone={toneForStatus(d.status)} />
        </Row>
      </Card>

      {d.land.frozen ? <Banner tone="danger" icon="lock-closed" text={t('dispute.frozenBanner')} /> : null}
      {d.frozenAt ? <Text style={[font.small, { marginBottom: spacing.md }]}>{t('dispute.frozenSince', { date: formatDate(d.frozenAt) })}</Text> : null}

      <Section title={t('dispute.title')}>
        <Card>
          <KeyValue label={t('dispute.reasonLabel')} value={t(`dispute.reasons.${d.reason}`)} />
          <KeyValue label={t('dispute.claimant')} value={fullName(d.claimant)} />
          <KeyValue label={t('dispute.owner')} value={fullName(d.land.owner)} />
          <KeyValue label={t('dispute.notary')} value={d.notary ? fullName(d.notary) : '—'} />
          <Text style={[font.body, { marginTop: spacing.md, lineHeight: 21 }]}>{d.description}</Text>
          <Text style={[font.small, { marginTop: spacing.xs }]}>{t('dispute.filedOn', { date: formatDate(d.createdAt) })}</Text>
        </Card>
      </Section>

      <Section title={t('dispute.ownerResponse')}>
        <Card>
          <Text style={[font.body, { color: d.ownerResponse ? colors.text : colors.textMuted }]}>{d.ownerResponse ?? '—'}</Text>
        </Card>
      </Section>

      <Section title={t('dispute.evidence')}>
        {d.evidence.length === 0 ? <Text style={font.small}>{t('dispute.noEvidence')}</Text> : null}
        {d.evidence.map((e) => (
          <Pressable
            key={e.id}
            onPress={() => openPrivateFile(`/disputes/${d.id}/evidence/${e.id}/link`).catch((err) => showAlert(t('common.error'), errorMessage(err)))}
          >
            <Card>
              <Row>
                <Avatar url={e.uploadedBy.avatarUrl} name={fullName(e.uploadedBy)} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={font.body} numberOfLines={1}>
                    {e.name}
                  </Text>
                  <Text style={font.small}>
                    {fullName(e.uploadedBy)} · {formatDate(e.createdAt)}
                  </Text>
                  <Text style={[font.mono, { color: colors.textMuted }]}>SHA-256 {shortHash(e.sha256, 12)}</Text>
                </View>
                <Ionicons name="open-outline" size={20} color={colors.primary} />
              </Row>
            </Card>
          </Pressable>
        ))}
        {active && (isClaimant || isOwner) ? (
          <Button title={t('dispute.addEvidence')} icon="cloud-upload-outline" variant="secondary" small loading={uploading} onPress={addEvidence} />
        ) : null}
      </Section>

      {d.resolutionNote ? (
        <Section title={t('dispute.resolution')}>
          <Card>
            <Text style={font.body}>{d.resolutionNote}</Text>
            {d.resolvedAt ? <Text style={[font.small, { marginTop: spacing.xs }]}>{formatDate(d.resolvedAt, true)}</Text> : null}
          </Card>
        </Section>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        {active && isOwner ? <Button title={t('dispute.respond')} icon="chatbox-ellipses-outline" onPress={() => setAction('respond')} /> : null}
        {active && isClaimant ? <Button title={t('dispute.withdraw')} variant="danger" onPress={() => setAction('withdraw')} /> : null}
        {isNotary && d.status === 'OPEN' ? <Button title={t('dispute.take')} icon="briefcase-outline" onPress={() => setAction('take')} /> : null}
        {handling && !d.frozenAt ? <Button title={t('dispute.freeze')} icon="lock-closed-outline" variant="danger" onPress={() => setAction('freeze')} /> : null}
        {handling ? <Button title={t('dispute.resolve')} icon="checkmark-done-outline" onPress={() => setAction('resolve')} /> : null}
        {isNotary && d.status === 'UPHELD' && d.frozenAt && d.land.frozen ? (
          <Button title={t('dispute.lift')} icon="lock-open-outline" variant="secondary" onPress={() => setAction('lift')} />
        ) : null}
      </View>

      <PromptModal
        visible={action !== null}
        loading={run.isPending}
        onClose={() => setAction(null)}
        onConfirm={(text) => action && run.mutate({ a: action, text })}
        {...(action ? prompt[action] : { title: '' })}
      >
        {action === 'resolve' ? (
          <ChipGroup
            value={outcome}
            onChange={setOutcome}
            options={[
              { value: 'DISMISSED', label: t('dispute.dismissedOption') },
              { value: 'UPHELD', label: t('dispute.upheldOption') },
            ]}
          />
        ) : null}
      </PromptModal>
    </Screen>
  );
}
