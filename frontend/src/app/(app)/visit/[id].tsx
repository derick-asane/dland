import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, fileUrl } from '@/api/client';
import type { Conversation, Visit } from '@/api/types';
import { useAuth } from '@/store/auth';
import { DateTimeChooser } from '@/components/DateTimeChooser';
import { PromptModal } from '@/components/PromptModal';
import { Badge, Banner, Button, Card, ErrorState, KeyValue, Loading, Row, Screen, Section, TextField, toneForStatus } from '@/components/ui';
import { colors, font, radius, spacing } from '@/theme';
import { errorMessage, formatDate, fullName } from '@/utils/format';
import { showAlert } from '@/utils/alert';

const ACTIVE = ['REQUESTED', 'CONFIRMED'];

/** A visit seen by the visitor (cancel, message the owner) or the owner (confirm with a date, reschedule, decline). */
export default function VisitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const me = useAuth((s) => s.user);
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState<Date | null>(null);
  const [note, setNote] = useState('');
  const [closing, setClosing] = useState(false);

  const query = useQuery({
    queryKey: ['visit', id],
    queryFn: async () => (await api.get<{ visit: Visit }>(`/visits/${id}`)).data.visit,
  });

  const done = (visit: Visit) => {
    queryClient.setQueryData(['visit', id], visit);
    void queryClient.invalidateQueries({ queryKey: ['visits'] });
    void queryClient.invalidateQueries({ queryKey: ['land', visit.landId] });
  };

  const confirm = useMutation({
    mutationFn: async () =>
      (await api.post<{ visit: Visit }>(`/visits/${id}/confirm`, { scheduledAt: when?.toISOString(), note: note.trim() || undefined })).data.visit,
    onSuccess: (visit) => {
      setScheduling(false);
      done(visit);
      showAlert(t('common.success'), t('visit.confirmedMessage'));
    },
    onError: (err) => showAlert(t('common.error'), errorMessage(err)),
  });

  const close = useMutation({
    mutationFn: async ({ action, reason }: { action: 'decline' | 'cancel'; reason: string }) =>
      (await api.post<{ visit: Visit }>(`/visits/${id}/${action}`, { reason: reason.trim() || undefined })).data.visit,
    onSuccess: (visit) => {
      setClosing(false);
      done(visit);
    },
    onError: (err) => showAlert(t('common.error'), errorMessage(err)),
  });

  const contact = useMutation({
    mutationFn: async (landId: string) => (await api.post<{ conversation: Conversation }>('/conversations', { landId })).data.conversation,
    onSuccess: (c) => router.push(`/chat/${c.id}`),
    onError: (err) => showAlert(t('common.error'), errorMessage(err)),
  });

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  const v = query.data;
  const land = v.land;
  const isOwner = me?.id === land?.ownerId;
  const isVisitor = me?.id === v.visitorId;
  const active = ACTIVE.includes(v.status);
  const upcoming = v.status === 'CONFIRMED' && v.scheduledAt && new Date(v.scheduledAt).getTime() > query.dataUpdatedAt;

  const startScheduling = () => {
    // Start from the current date, else the visitor's wish, when still in the future.
    const initial = [v.scheduledAt, v.preferredAt].find((d) => d && new Date(d).getTime() > Date.now());
    setWhen(initial ? new Date(initial) : null);
    setNote(v.ownerNote ?? '');
    setScheduling(true);
  };

  return (
    <Screen edges={['bottom']} refreshing={query.isRefetching} onRefresh={() => query.refetch()}>
      <Stack.Screen options={{ title: t('visit.title') }} />
      {land ? (
        <Card onPress={() => router.push(`/land/${land.id}`)}>
          <Row>
            <Image source={{ uri: fileUrl(land.images[0]?.url) }} style={{ width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.border }} />
            <View style={{ flex: 1 }}>
              <Text style={font.h3} numberOfLines={1}>
                {land.title}
              </Text>
              <Text style={font.small} numberOfLines={1}>
                {land.address}, {land.city}
              </Text>
            </View>
            <Badge label={t(`visit.statuses.${v.status}`)} tone={toneForStatus(v.status)} />
          </Row>
        </Card>
      ) : null}

      {v.status === 'CONFIRMED' && v.scheduledAt ? (
        <Banner tone={upcoming ? 'success' : 'neutral'} icon="calendar" text={t('visit.scheduledFor', { date: formatDate(v.scheduledAt, true) })} />
      ) : v.status === 'REQUESTED' ? (
        <Banner tone="warning" icon="hourglass-outline" text={isOwner ? t('visit.answerHint') : t('visit.waitingOwner')} />
      ) : null}

      <Card>
        {land ? <KeyValue label={t('visit.owner')} value={fullName(land.owner)} /> : null}
        {v.visitor ? <KeyValue label={t('visit.visitor')} value={fullName(v.visitor)} /> : null}
        <KeyValue label={t('visit.preferred')} value={v.preferredAt ? formatDate(v.preferredAt, true) : t('visit.flexible')} />
        <KeyValue label={t('visit.requestedOn')} value={formatDate(v.createdAt)} />
      </Card>

      {v.message ? (
        <Section title={t('visit.message')}>
          <Card>
            <Text style={font.body}>{v.message}</Text>
          </Card>
        </Section>
      ) : null}

      {v.ownerNote ? (
        <Section title={t('visit.ownerNote')}>
          <Card>
            <Text style={font.body}>{v.ownerNote}</Text>
          </Card>
        </Section>
      ) : null}

      {!active ? (
        <Banner
          tone="neutral"
          icon="information-circle-outline"
          text={
            v.closeReason === 'LISTING_UNAVAILABLE'
              ? t('visit.listingUnavailable')
              : v.closeReason
                ? `${t(`visit.statuses.${v.status}`)}: ${v.closeReason}`
                : t(`visit.statuses.${v.status}`)
          }
        />
      ) : null}

      {isOwner && active && scheduling ? (
        <Section title={v.status === 'CONFIRMED' ? t('visit.reschedule') : t('visit.confirm')}>
          <DateTimeChooser value={when} onChange={setWhen} />
          <TextField label={t('visit.ownerNote')} hint={t('visit.ownerNoteHint')} value={note} onChangeText={setNote} multiline maxLength={1000} />
          <Row>
            <Button title={t('common.cancel')} variant="ghost" style={{ flex: 1 }} onPress={() => setScheduling(false)} />
            <Button
              title={t('visit.confirm')}
              icon="checkmark"
              style={{ flex: 1 }}
              disabled={!when}
              loading={confirm.isPending}
              onPress={() => confirm.mutate()}
            />
          </Row>
        </Section>
      ) : null}

      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        {isOwner && active && !scheduling ? (
          <>
            <Button
              title={v.status === 'CONFIRMED' ? t('visit.reschedule') : t('visit.confirm')}
              icon="calendar-outline"
              onPress={startScheduling}
            />
            <Button title={t('visit.decline')} variant="danger" onPress={() => setClosing(true)} />
          </>
        ) : null}
        {isVisitor && active ? (
          <>
            <Button
              title={t('visit.messageOwner')}
              icon="chatbubble-outline"
              variant="secondary"
              loading={contact.isPending}
              onPress={() => contact.mutate(v.landId)}
            />
            <Button title={t('visit.cancel')} variant="danger" onPress={() => setClosing(true)} />
          </>
        ) : null}
      </View>

      <PromptModal
        visible={closing}
        title={isOwner ? t('visit.decline') : t('visit.cancel')}
        message={isOwner ? t('visit.declineConfirm') : t('visit.cancelConfirm')}
        inputLabel={t('visit.reason')}
        destructive
        loading={close.isPending}
        onClose={() => setClosing(false)}
        onConfirm={(reason) => close.mutate({ action: isOwner ? 'decline' : 'cancel', reason })}
      />
    </Screen>
  );
}
