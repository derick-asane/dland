import { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import { Banner, Button, Screen, TextField } from '@/components/ui';
import { font, spacing } from '@/theme';
import { errorMessage } from '@/utils/format';

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const [step, setStep] = useState<'email' | 'reset' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setLoading(true);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['bottom']}>
      <Text style={[font.h1, { marginBottom: spacing.sm }]}>{t('auth.resetTitle')}</Text>
      <Text style={[font.small, { marginBottom: spacing.xl }]}>{t('auth.resetInfo')}</Text>
      {error ? <Banner text={error} tone="danger" icon="alert-circle" /> : null}

      {step === 'email' && (
        <>
          <TextField label={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Button
            title={t('auth.sendCode')}
            loading={loading}
            disabled={!email}
            onPress={() =>
              run(async () => {
                await api.post('/auth/forgot-password', { email: email.trim() });
                setStep('reset');
              })
            }
          />
        </>
      )}

      {step === 'reset' && (
        <>
          <Banner text={t('auth.codeSent')} tone="info" />
          <TextField label={t('auth.code')} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
          <TextField
            label={t('auth.newPassword')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            error={password && password.length < 8 ? t('validation.passwordLength') : undefined}
          />
          <Button
            title={t('common.confirm')}
            loading={loading}
            disabled={code.length !== 6 || password.length < 8}
            onPress={() =>
              run(async () => {
                await api.post('/auth/reset-password', { email: email.trim(), code, password });
                setStep('done');
              })
            }
          />
        </>
      )}

      {step === 'done' && (
        <>
          <Banner text={t('auth.resetDone')} tone="success" icon="checkmark-circle" />
          <Button title={t('auth.login')} onPress={() => router.replace('/login')} />
        </>
      )}
    </Screen>
  );
}
