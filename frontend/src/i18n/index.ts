import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import ptBRCommon from './locales/pt-BR/common.json';
import ptBRAuth from './locales/pt-BR/auth.json';
import ptBRSwipe from './locales/pt-BR/swipe.json';
import ptBRMatches from './locales/pt-BR/matches.json';
import ptBRChat from './locales/pt-BR/chat.json';
import ptBRSettings from './locales/pt-BR/settings.json';
import ptBRProfile from './locales/pt-BR/profile.json';
import ptBRModeration from './locales/pt-BR/moderation.json';
import ptBRErrors from './locales/pt-BR/errors.json';
import ptBREvents from './locales/pt-BR/events.json';
import ptBRAdmin from './locales/pt-BR/admin.json';

import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';
import enSwipe from './locales/en/swipe.json';
import enMatches from './locales/en/matches.json';
import enChat from './locales/en/chat.json';
import enSettings from './locales/en/settings.json';
import enProfile from './locales/en/profile.json';
import enModeration from './locales/en/moderation.json';
import enErrors from './locales/en/errors.json';
import enEvents from './locales/en/events.json';
import enAdmin from './locales/en/admin.json';

export const SUPPORTED_LOCALES = ['pt-BR', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const NAMESPACES = [
  'common',
  'auth',
  'swipe',
  'matches',
  'chat',
  'settings',
  'profile',
  'moderation',
  'errors',
  'events',
  'admin',
] as const;

const resources = {
  'pt-BR': {
    common: ptBRCommon,
    auth: ptBRAuth,
    swipe: ptBRSwipe,
    matches: ptBRMatches,
    chat: ptBRChat,
    settings: ptBRSettings,
    profile: ptBRProfile,
    moderation: ptBRModeration,
    errors: ptBRErrors,
    events: ptBREvents,
    admin: ptBRAdmin,
  },
  en: {
    common: enCommon,
    auth: enAuth,
    swipe: enSwipe,
    matches: enMatches,
    chat: enChat,
    settings: enSettings,
    profile: enProfile,
    moderation: enModeration,
    errors: enErrors,
    events: enEvents,
    admin: enAdmin,
  },
};

/**
 * Resolves when i18next has finished initialising. main.tsx awaits this
 * before calling ReactDOM.render so that no component ever mounts with
 * t() returning a raw "namespace.key" string. Combined with
 * useSuspense:false, this rules out the BottomNav raw-key leak observed
 * on production iOS where init was completing AFTER the first paint.
 */
export const i18nReady: Promise<unknown> = i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: 'pt-BR',
    fallbackLng: 'pt-BR',
    supportedLngs: SUPPORTED_LOCALES as unknown as string[],
    ns: NAMESPACES as unknown as string[],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      // Only respect an explicit user choice stored in localStorage.
      // Dropping navigator/htmlTag ensures PT-BR is the default for all
      // new users regardless of OS/browser locale.
      order: ['localStorage'],
      caches: ['localStorage'],
      lookupLocalStorage: 'beija_locale',
    },
    returnNull: false,
    nonExplicitSupportedLngs: true, // 'en-US' falls back to 'en'
    react: { useSuspense: false },
  });

export default i18n;

/**
 * Persist the chosen locale to localStorage AND update i18next runtime.
 * Caller should mirror to `profiles.locale` separately if user is signed in.
 */
export function changeLocale(locale: SupportedLocale): void {
  void i18n.changeLanguage(locale);
}
