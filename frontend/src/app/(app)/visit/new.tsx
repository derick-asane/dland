import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Visit } from '@/api/types';
import { useLand } from '@/hooks/useLand';
import { DateTimeChooser } from '@/components/DateTimeChooser';
import { Banner, Button, Card, Chip, ErrorState, Loading, Screen, Section, TextField } from '@/components/ui';
import { font, spacing } from '@/theme';
import { errorMessage } from '@/utils/format';
import { showAlert } from '@/utils/alert';

/** Ask the owner for a visit, with a preferred date if the visitor has one. */
export default function NewVisitScreen() {
  const { landId } = useLocalSearchParams<{ landId: string }>();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const land = useLand(landId);
  const [preferredAt, setPreferredAt] = useState<Date | null>(null);
  const [flexible, setFlexible] = useState(false);
  const [message, setMessage] = useState('');

  const submit = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ visit: Visit }>('/visits', {
          landId,
          preferredAt: flexible || !preferredAt ? undefined : preferredAt.toISOString(),
          message: message.trim() || undefined,
        })
      ).data.visit,
    onSuccess: (visit) => {
      void queryClient.invalidateQueries({ queryKey: ['land', landId] });
      void queryClient.invalidateQueries({ queryKey: ['visits'] });
      showAlert(t('common.success'), t('visit.requested'));
      router.replace(`/visit/${visit.id}`);
    },
    onError: (err) => showAlert(t('common.error'), errorMessage(err)),
  });

  if (land.isLoading) return <Loading />;
  if (land.isError || !land.data) return <ErrorState message={errorMessage(land.error)} />;

  return (
    <Screen edges={['bottom']}>
      <Card>
        <Text style={font.h3}>{land.data.title}</Text>
        <Text style={font.small}>
          {land.data.address}, {land.data.city}
        </Text>
      </Card>
      <Banner tone="info" icon="walk-outline" text={t('visit.requestHint')} />
      <Section title={t('visit.preferredDate')}>
        <View style={{ flexDirection: 'row', marginBottom: spacing.md }}>
          <Chip label={t('visit.flexible')} icon="shuffle-outline" selected={flexible} onPress={() => setFlexible(!flexible)} />
        </View>
        {flexible ? null : <DateTimeChooser value={preferredAt} onChange={setPreferredAt} />}
      </Section>
      <TextField
        label={t('visit.message')}
        hint={t('visit.messageHint')}
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={1000}
      />
      <View>
        <Button
          title={t('visit.send')}
          icon="send-outline"
          onPress={() => submit.mutate()}
          loading={submit.isPending}
          disabled={!flexible && !preferredAt}
        />
      </View>
    </Screen>
  );
}
