import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { useTranslation } from 'react-i18next';
import { api, upload } from '@/api/client';
import { openPrivateFile } from '@/api/files';
import type { DocumentType, Land } from '@/api/types';
import { colors, font, spacing } from '@/theme';
import { errorMessage, shortHash } from '@/utils/format';
import { showAlert } from '@/utils/alert';
import { PromptModal } from '../PromptModal';
import { Button, Card, ChipGroup, Row, Section } from '../ui';
import { useLandFiles } from './useLandFiles';

/** Documents the notary needs for a first registration. */
export const REQUIRED_DOCUMENTS: DocumentType[] = ['TITLE_DEED', 'ID_DOCUMENT'];
const OTHER_TYPES: DocumentType[] = ['SURVEY_PLAN', 'TAX_RECEIPT', 'OTHER'];

export function missingDocuments(land: Land): DocumentType[] {
  if (land.registeredOnChain) return [];
  return REQUIRED_DOCUMENTS.filter((type) => !land.documents?.some((d) => d.type === type));
}

/** Required documents as a checklist, plus optional extra documents. */
export function DocumentsManager({ land }: { land: Land }) {
  const { t } = useTranslation();
  const { busy, run } = useLandFiles(land.id);
  const [otherPicker, setOtherPicker] = useState(false);
  const [otherType, setOtherType] = useState<DocumentType>('SURVEY_PLAN');
  const docs = land.documents ?? [];

  const pickAndUpload = (type: DocumentType) =>
    run(async () => {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      await upload(
        `/lands/${land.id}/documents`,
        { document: { uri: asset.uri, name: asset.name, type: asset.mimeType ?? 'application/pdf' } },
        { type, name: asset.name },
      );
    });

  const remove = (documentId: string) => run(() => api.delete(`/lands/${land.id}/documents/${documentId}`));

  const docCard = (d: (typeof docs)[number]) => (
    <Card key={d.id}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Ionicons name="document-text-outline" size={22} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={font.h3}>{t(`documentType.${d.type}`)}</Text>
          <Text style={font.small} numberOfLines={1}>
            {d.name}
          </Text>
          <Text style={[font.mono, { color: colors.textMuted }]}>{shortHash(d.sha256, 12)}</Text>
        </View>
        <Pressable
          onPress={() => openPrivateFile(`/lands/${land.id}/documents/${d.id}/link`).catch((err) => showAlert(t('common.error'), errorMessage(err)))}
          hitSlop={8}
          accessibilityLabel={t('land.openDocument')}
        >
          <Ionicons name="eye-outline" size={20} color={colors.primary} />
        </Pressable>
        <Pressable onPress={() => remove(d.id)} hitSlop={8} accessibilityLabel={t('common.delete')}>
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
        </Pressable>
      </Row>
    </Card>
  );

  return (
    <View>
      <Section title={t('wizard.requiredDocs')}>
        {REQUIRED_DOCUMENTS.map((type) => {
          const uploaded = docs.filter((d) => d.type === type);
          const ok = uploaded.length > 0 || land.registeredOnChain;
          return (
            <View key={type} style={{ marginBottom: spacing.md }}>
              <Row style={{ marginBottom: spacing.xs }}>
                <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={ok ? colors.primary : colors.textMuted} />
                <Text style={[font.h3, { flex: 1 }]}>{t(`documentType.${type}`)}</Text>
              </Row>
              {uploaded.map(docCard)}
              <Button
                title={uploaded.length ? t('wizard.addAnother') : t('wizard.upload', { document: t(`documentType.${type}`) })}
                icon="cloud-upload-outline"
                variant={uploaded.length ? 'ghost' : 'secondary'}
                small
                loading={busy}
                onPress={() => pickAndUpload(type)}
              />
            </View>
          );
        })}
      </Section>

      <Section title={t('wizard.optionalDocs')}>
        {docs.filter((d) => !REQUIRED_DOCUMENTS.includes(d.type)).map(docCard)}
        <Button title={t('land.addDocument')} icon="document-attach-outline" variant="ghost" small onPress={() => setOtherPicker(true)} />
      </Section>

      <PromptModal
        visible={otherPicker}
        title={t('land.addDocument')}
        message={t('land.chooseDocType')}
        confirmLabel={t('wizard.chooseFile')}
        onClose={() => setOtherPicker(false)}
        onConfirm={() => {
          setOtherPicker(false);
          void pickAndUpload(otherType);
        }}
      >
        <ChipGroup value={otherType} onChange={setOtherType} options={OTHER_TYPES.map((d) => ({ value: d, label: t(`documentType.${d}`) }))} />
      </PromptModal>
    </View>
  );
}
