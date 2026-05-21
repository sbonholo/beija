/**
 * Capacitor-ready haptics wrapper. On native we'd swap to `@capacitor/haptics`.
 */
export function hapticTap() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { navigator.vibrate(20); } catch { /* noop */ }
  }
}

export function hapticSuccess() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { navigator.vibrate([30, 40, 80]); } catch { /* noop */ }
  }
}
