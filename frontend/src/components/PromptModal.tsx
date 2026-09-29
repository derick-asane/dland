import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { colors, font, radius, spacing } from '@/theme';
import { Button, TextField } from './ui';

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  inputLabel?: string;
  /** When true the text input must be filled before confirming. */
  inputRequired?: boolean;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  children?: ReactNode;
  onConfirm: (text: string) => void;
  onClose: () => void;
}

/**
 * Cross-platform confirm dialog with an optional text input (Alert.prompt is iOS-only).
 * The content is only mounted while visible, so the input starts empty every time.
 */
export function PromptModal({ visible, onClose, ...props }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {visible ? <PromptContent onClose={onClose} {...props} /> : null}
    </Modal>
  );
}

function PromptContent({
  title,
  message,
  inputLabel,
  inputRequired,
  confirmLabel,
  destructive,
  loading,
  children,
  onConfirm,
  onClose,
}: Omit<Props, 'visible'>) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const canConfirm = !inputRequired || text.trim().length >= 3;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={styles.sheet}>
        <Text style={font.h2}>{title}</Text>
        {message ? <Text style={[font.body, { color: colors.textMuted, marginTop: spacing.sm }]}>{message}</Text> : null}
        <View style={{ marginTop: spacing.lg }}>
          {children}
          {inputLabel ? <TextField label={inputLabel} value={text} onChangeText={setText} multiline /> : null}
        </View>
        <View style={styles.actions}>
          <Button title={t('common.cancel')} variant="ghost" onPress={onClose} style={{ flex: 1 }} />
          <Button
            title={confirmLabel ?? t('common.confirm')}
            variant={destructive ? 'danger' : 'primary'}
            onPress={() => onConfirm(text.trim())}
            disabled={!canConfirm}
            loading={loading}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
});
