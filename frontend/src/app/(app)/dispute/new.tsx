import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { upload, type UploadFile } from '@/api/client';
import type { Dispute, DisputeReason } from '@/api/types';
import { useLand } from '@/hooks/useLand';
import { Banner, Button, Card, ChipGroup, ErrorState, Loading, Row, Screen, Section, TextField } from '@/components/ui';
import { colors, font, spacing } from '@/theme';
import { errorMessage } from '@/utils/format';
import { showAlert } from '@/utils/alert';

const REASONS: DisputeReason[] = ['OWNERSHIP_CLAIM', 'DOUBLE_SALE', 'FORGED_DOCUMENTS', 'BOUNDARY_CONFLICT', 'INHERITANCE', 'OTHER'];
const MAX_FILES = 5;

/** Any client can challenge the ownership of a registered land. */
export default function NewDisputeScreen() {
  const { landId } = useLocalSearchParams<{ landId: string }>();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const land = useLand(landId);
  const [reason, setReason] = useState<DisputeReason>('OWNERSHIP_CLAIM');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<UploadFile[]>([]);

  const pick = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    const picked = result.assets.map((a) => ({ uri: a.uri, name: a.name, type: a.mimeType ?? 'application/pdf' }));
    setFiles((current) => [...current, ...picked].slice(0, MAX_FILES));
  };

  const submit = useMutation({
    mutationFn: async () =>
      (await upload<{ dispute: Dispute }>('/disputes', { evidence: files }, { landId, reason, description: description.trim() })).dispute,
    onSuccess: (dispute) => {
      void queryClient.invalidateQueries({ queryKey: ['land', landId] });
      void queryClient.invalidateQueries({ queryKey: ['disputes'] });
      showAlert(t('common.success'), t('dispute.submitted'));
      router.replace(`/dispute/${dispute.id}`);
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
          {land.data.reference} · {land.data.city}, {land.data.country}
        </Text>
      </Card>
      <Banner tone="info" icon="shield-half-outline" text={t('dispute.challengeHint')} />
      <ChipGroup label={t('dispute.reasonLabel')} value={reason} onChange={setReason} options={REASONS.map((r) => ({ value: r, label: t(`dispute.reasons.${r}`) }))} />
      <TextField
        label={t('dispute.description')}
        hint={t('dispute.descriptionHint')}
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={5000}
      />
      <Section title={t('dispute.evidence')}>
        <Text style={[font.small, { marginBottom: spacing.sm }]}>{t('dispute.evidenceHint')}</Text>
        {files.map((f, i) => (
          <Row key={`${f.uri}-${i}`} style={{ marginBottom: spacing.xs }}>
            <Ionicons name="document-attach-outline" size={18} color={colors.primary} />
            <Text style={[font.body, { flex: 1 }]} numberOfLines={1}>
              {f.name}
            </Text>
            <Pressable onPress={() => setFiles(files.filter((_, j) => j !== i))} hitSlop={8} accessibilityLabel={t('common.delete')}>
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
            </Pressable>
          </Row>
        ))}
        {files.length < MAX_FILES ? (
          <Button title={t('dispute.addEvidence')} icon="cloud-upload-outline" variant="secondary" small onPress={pick} />
        ) : null}
      </Section>
      <View>
        <Button
          title={t('dispute.submit')}
          icon="send-outline"
          onPress={() => submit.mutate()}
          loading={submit.isPending}
          disabled={description.trim().length < 20}
        />
      </View>
    </Screen>
  );
}
