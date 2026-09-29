import 'i18next';
import type en from './locales/en';

// Type-checks every t('key') call against the English resource.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}
