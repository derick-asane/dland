import { useState } from 'react';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Language } from '@/api/types';
import { useAuth } from '@/store/auth';
import { Banner, Button, Screen, TextField } from '@/components/ui';
import { font, spacing } from '@/theme';
import { errorMessage } from '@/utils/format';

export default function RegisterScreen() {
  const { t, i18n } = useTranslation();
  const register = useAuth((s) => s.register);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const emailValid = /^\S+@\S+\.\S+$/.test(form.email.trim());
  const errors = {
    email: form.email && !emailValid ? t('validation.email') : undefined,
    password: form.password && form.password.length < 8 ? t('validation.passwordLength') : undefined,
    confirm: form.confirm && form.confirm !== form.password ? t('auth.passwordsMismatch') : undefined,
  };
  const valid =
    form.firstName.trim() && form.lastName.trim() && emailValid && form.password.length >= 8 && form.password === form.confirm;

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await register({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
        language: i18n.language as Language,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['bottom']}>
      <Text style={[font.h1, { marginBottom: spacing.xl }]}>{t('auth.register')}</Text>
      {error ? <Banner text={error} tone="danger" icon="alert-circle" /> : null}
      <TextField label={t('auth.firstName')} value={form.firstName} onChangeText={set('firstName')} autoComplete="given-name" />
      <TextField label={t('auth.lastName')} value={form.lastName} onChangeText={set('lastName')} autoComplete="family-name" />
      <TextField
        label={t('auth.email')}
        value={form.email}
        onChangeText={set('email')}
        autoCapitalize="none"
        keyboardType="email-address"
        error={errors.email}
      />
      <TextField
        label={`${t('auth.phone')} (${t('common.optional')})`}
        value={form.phone}
        onChangeText={set('phone')}
        keyboardType="phone-pad"
      />
      <TextField label={t('auth.password')} value={form.password} onChangeText={set('password')} secureTextEntry error={errors.password} />
      <TextField
        label={t('auth.confirmPassword')}
        value={form.confirm}
        onChangeText={set('confirm')}
        secureTextEntry
        error={errors.confirm}
      />
      <Button title={t('auth.register')} onPress={submit} loading={loading} disabled={!valid} />
    </Screen>
  );
}
