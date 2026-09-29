import { Pressable, type ColorValue } from 'react-native';
import { router, usePathname, type Href } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { colors } from '@/theme';

/** Sections that have their own tab: a screen under /notary/… falls back to the Notary tab, and so on. */
const PARENTS: Record<string, Href> = {
  notary: '/notary',
  admin: '/admin',
  transfer: '/transfers',
  chat: '/messages',
  profile: '/profile',
};

/**
 * Back arrow that is always shown. With no previous screen (page refreshed or opened from a link),
 * it goes to the parent section instead of leaving the user stuck.
 */
export function HeaderBack({ tintColor }: { tintColor?: ColorValue }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(PARENTS[pathname.split('/')[1]] ?? '/');
  };
  return (
    <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('wizard.back')} style={{ paddingRight: 12 }}>
      <Ionicons name="arrow-back" size={24} color={tintColor ?? colors.primary} />
    </Pressable>
  );
}
