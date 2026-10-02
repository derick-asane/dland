import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/store/auth';
import { Banner, Button, Screen, TextField } from '@/components/ui';
import { LanguagePicker } from '@/components/LanguagePicker';
import { colors, font, spacing } from '@/theme';
import { errorMessage } from '@/utils/format';

export default function LoginScreen() {
  const { t } = useTranslation();
  const login = useAuth((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen edges={['top', 'bottom']} contentStyle={{ paddingTop: spacing.xxl }}>
      <View style={styles.brand}>
        <View style={styles.logo}>
          <Ionicons name="map" size={34} color="#fff" />
        </View>
        <Text style={[font.h1, { fontSize: 32 }]}>{t('common.appName')}</Text>
        <Text style={[font.small, styles.tagline]}>{t('auth.tagline')}</Text>
      </View>

      {error ? <Banner text={error} tone="danger" icon="alert-circle" /> : null}

      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <TextField
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        onSubmitEditing={submit}
      />
      <Button title={t('auth.login')} onPress={submit} loading={loading} disabled={!email || !password} />

      <View style={styles.links}>
        <Link href="/forgot-password" style={styles.link}>
          {t('auth.forgotPassword')}
        </Link>
        <Link href="/register" style={styles.link}>
          {t('auth.noAccount')}
        </Link>
      </View>

      <View style={{ marginTop: spacing.xxl, alignItems: 'center', gap: spacing.md }}>
        <LanguagePicker />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', marginBottom: spacing.xxl },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  tagline: { textAlign: 'center', marginTop: spacing.sm, maxWidth: 300 },
  links: { alignItems: 'center', gap: spacing.md, marginTop: spacing.xl },
  link: { color: colors.primary, fontWeight: '600', fontSize: 15 },
});
