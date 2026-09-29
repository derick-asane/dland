import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './locales/en';
import fr from './locales/fr';
import es from './locales/es';
import type { Language } from '@/api/types';

export const LANGUAGES: Language[] = ['en', 'fr', 'es'];
const STORAGE_KEY = 'dland.language';

const isSupported = (lng: string | null | undefined): lng is Language => LANGUAGES.includes(lng as Language);

function deviceLanguage(): Language {
  const code = getLocales()[0]?.languageCode;
  return isSupported(code) ? code : 'en';
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr }, es: { translation: es } },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Restores the language the user picked last time (before sign-in). */
export async function restoreLanguage() {
  const saved = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
  if (isSupported(saved) && saved !== i18n.language) await i18n.changeLanguage(saved);
}

export async function changeLanguage(lng: Language) {
  if (!isSupported(lng)) return;
  await AsyncStorage.setItem(STORAGE_KEY, lng).catch(() => undefined);
  if (lng !== i18n.language) await i18n.changeLanguage(lng);
}

/** Maps a BCP-47 tag for number/date formatting. */
export const localeTag = () => ({ en: 'en-US', fr: 'fr-FR', es: 'es-ES' })[i18n.language as Language] ?? 'en-US';

export default i18n;
