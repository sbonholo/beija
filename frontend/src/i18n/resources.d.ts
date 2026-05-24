// Type augmentation so useTranslation() has full type-safety on namespace +
// key paths. The source-of-truth files are pt-BR/*.json.

import 'react-i18next';

import common from './locales/pt-BR/common.json';
import auth from './locales/pt-BR/auth.json';
import swipe from './locales/pt-BR/swipe.json';
import matches from './locales/pt-BR/matches.json';
import chat from './locales/pt-BR/chat.json';
import settings from './locales/pt-BR/settings.json';
import profile from './locales/pt-BR/profile.json';
import moderation from './locales/pt-BR/moderation.json';
import errors from './locales/pt-BR/errors.json';

declare module 'react-i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof common;
      auth: typeof auth;
      swipe: typeof swipe;
      matches: typeof matches;
      chat: typeof chat;
      settings: typeof settings;
      profile: typeof profile;
      moderation: typeof moderation;
      errors: typeof errors;
    };
  }
}
