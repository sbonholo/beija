/**
 * Single source of truth for UX timing, color tokens (not in CSS vars),
 * and default product values. Keep this thin — anything with strong styling
 * intent belongs in index.css as a CSS variable.
 */

// ---- UX timings ----
export const LONG_PRESS_MS = 500;
export const SWIPE_THRESHOLD_PCT = 0.25;
export const SWIPE_UP_THRESHOLD_PX = 80;
export const TAP_TOLERANCE_PX = 6;
export const SWIPE_EXIT_MS = 220;
export const SPLASH_MS = 1500;
export const TYPING_TIMEOUT_MS = 3000;
export const TYPING_BROADCAST_THROTTLE_MS = 800;
export const GEOLOCATION_REFRESH_MS = 30 * 60 * 1000;
export const MATCH_DETECTION_WINDOW_MS = 5000;

// ---- Storage / quotas ----
export const MAX_PHOTO_SLOTS = 6;
export const MAX_PHOTOS_PER_CARD = 5;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTO_DIMENSION = 1080;
export const MIN_PHOTO_DIMENSION = 400;

// ---- Defaults ----
export const DEFAULT_MIN_AGE = 18;
export const DEFAULT_MAX_AGE = 50;
export const DEFAULT_MAX_DISTANCE_KM = 50;
export const ABSOLUTE_MAX_AGE = 99;
export const ABSOLUTE_MAX_DISTANCE_KM = 100;

// ---- Limits ----
export const MAX_MESSAGE_CHARS = 2000;
export const MAX_BIO_CHARS = 300;
export const MAX_ONBOARDING_BIO_CHARS = 150;
export const MAX_NICKNAME_CHARS = 30;
export const POTENTIAL_MATCHES_BATCH = 10;
export const STACK_VISIBLE = 3;
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

// ---- Color tokens not exposed as CSS vars (used inline in JSX) ----
export const COLOR_NOPE = '#ff5b5b';
export const COLOR_LIKE = '#4ade80';
export const COLOR_SUPER = '#3aa8ff';

// ---- Bundle id (also referenced in capacitor.config) ----
export const APP_BUNDLE_ID = 'io.beija.app';

// ---- App version (read at build time; falls back to package.json) ----
export const APP_VERSION = '0.1.0';

// ---- Rewind (anti-regret) ----
export const REWIND_DAILY_LIMIT = 3;
export const REWIND_HISTORY_LIMIT = 5;
export const REWIND_STORAGE_KEY = 'beija_rewind_log';
export const REWIND_ENTER_MS = 320;

// ---- Distance buckets ----
export const DISTANCE_NEAR_M = 1000;
export const DISTANCE_FAR_KM = 50;
export const DISTANCE_NEAR_LABEL = 'aqui perto';
export const DISTANCE_FAR_LABEL = 'longe';
export function formatDistanceLabel(meters: number | null | undefined): string | null {
  if (meters == null || !Number.isFinite(meters)) return null;
  if (meters < DISTANCE_NEAR_M) return DISTANCE_NEAR_LABEL;
  const km = Math.round(meters / 1000);
  if (km > DISTANCE_FAR_KM) return DISTANCE_FAR_LABEL;
  return `${km} km`;
}

// ---- PT-BR strings (centralized for future i18n) ----
export const STR_REWIND_LABEL = 'Voltar último swipe';
export const STR_REWIND_LIMIT_REACHED = 'Limite diário de 3 voltas atingido.';
export const STR_REWIND_EMPTY = 'Sem swipe pra voltar.';
export const STR_OPEN_PROFILE = 'Ver perfil completo';
export const STR_SETTINGS_TITLE = 'Configurações';
export const STR_SETTINGS_NOTIFICATIONS = 'Notificações';
export const STR_SETTINGS_PRIVACY = 'Privacidade';
export const STR_SETTINGS_ACCOUNT = 'Conta';
export const STR_SETTINGS_ABOUT = 'Sobre';
export const STR_MUTE_NOTIFICATIONS = 'Silenciar notificações push';
export const STR_HIDE_DISTANCE = 'Esconder minha distância';
export const STR_SHOW_AGE = 'Mostrar minha idade';
export const STR_DELETE_ACCOUNT = 'Deletar conta';
export const STR_PRIVACY_POLICY = 'Política de privacidade';
export const STR_TERMS = 'Termos de uso';
export const STR_PROFILE_DETAIL_CLOSE = 'Fechar';
export const STR_PROFILE_DETAIL_MORE = 'Mais ações';
export const STR_PROFILE_DETAIL_REPORT = 'Reportar perfil';
export const STR_PROFILE_DETAIL_BLOCK = 'Bloquear perfil';
export const STR_PASS = 'Recusar';
export const STR_LIKE = 'Curtir';
