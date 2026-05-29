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
/** Anything more recent than this is shown as "Ativo agora" with a green dot. */
export const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

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

// ---- Color tokens (Neon Noir palette) ----
export const COLOR_NOPE = 'var(--danger)';
export const COLOR_LIKE = 'var(--pink-glow)';
export const COLOR_SUPER = 'var(--aurora)';

// ---- Bundle id (also referenced in capacitor.config) ----
export const APP_BUNDLE_ID = 'io.beija.app';

// ---- App version (read at build time; falls back to package.json) ----
export const APP_VERSION = '0.1.0';

// ---- Rewind (anti-regret) ----
export const REWIND_DAILY_LIMIT = 3;
export const REWIND_HISTORY_LIMIT = 5;
export const REWIND_STORAGE_KEY = 'beija_rewind_log';
export const REWIND_ENTER_MS = 320;

// Re-export the distance formatter from lib/labels for the SwipeCard chip.
// Kept here just for the constants for buckets if a future module wants them.
export const DISTANCE_FAR_KM = 50;

// ---- PT-BR strings ----
// All user-facing copy lives in src/i18n/locales/<lang>/*.json now.
// Use `useTranslation()` in components and `i18n.t()` in libs.
// See docs/I18N.md.
