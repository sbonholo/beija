// pt-BR date/time formatting. Brazil uses dd/mm/yyyy and 24-hour time.
// All helpers take an ISO string and pin the 'pt-BR' locale so output is
// independent of the user's browser/OS locale. Stored values stay ISO.

/** "24/12" — short day/month. */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

/** "14:30" — 24-hour time. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** "24/12, 14:30" — short date + 24-hour time. */
export function formatDateTime(iso: string): string {
  return `${formatShortDate(iso)}, ${formatTime(iso)}`;
}

/** "qua., 24/12" — short weekday + short day/month. */
export function formatWeekdayDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
}

/** "24/12/2024" — full numeric date. */
export function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
