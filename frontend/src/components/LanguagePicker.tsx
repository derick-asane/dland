import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/client';
import type { Language, User } from '@/api/types';
import { changeLanguage, LANGUAGES } from '@/i18n';
import { useAuth } from '@/store/auth';
import { spacing } from '@/theme';
import { Chip } from './ui';

/** Switches the UI language and, when signed in, saves it on the profile. */
export function LanguagePicker() {
  const { t, i18n } = useTranslation();
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);

  const select = async (lng: Language) => {
    await changeLanguage(lng);
    if (user) {
      const { data } = await api.patch<{ user: User }>('/users/me', { language: lng }).catch(() => ({ data: null }));
      if (data) setUser(data.user);
    }
  };

  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
      {LANGUAGES.map((lng) => (
        <Chip key={lng} label={t(`languages.${lng}`)} selected={i18n.language === lng} onPress={() => select(lng)} />
      ))}
    </View>
  );
}
