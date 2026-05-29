import i18n from '../i18n';
import type { Gender } from '../types';

export const genderLabel: Record<Gender, string> = {
  woman: 'Mulher',
  man: 'Homem',
  'non-binary': 'Não-binário',
  'prefer_not_to_say': 'Prefiro não dizer',
};

export const seekingLabel: Record<Gender, string> = {
  woman: 'Mulheres',
  man: 'Homens',
  'non-binary': 'Não-binárias',
  'prefer_not_to_say': 'Todos',
};

export function ageFromBirthdate(birthdate: string | null | undefined): number | null {
  if (!birthdate) return null;
  const d = new Date(birthdate);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
}

/** "Ativo agora" (<5min), "Ativo há Xmin" (<1h), "Hoje" (<24h), "Há Xd" (≥24h). */
export function formatLastActive(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const diff = Date.now() - t;
  if (diff < 0) return 'Ativo agora';
  if (diff < 5 * 60 * 1000) return 'Ativo agora';
  if (diff < 60 * 60 * 1000) return `Ativo há ${Math.max(1, Math.floor(diff / 60000))}min`;
  if (diff < 24 * 60 * 60 * 1000) return 'Hoje';
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  if (days < 7) return `Há ${days}d`;
  if (days < 30) return `Há ${Math.floor(days / 7)}sem`;
  return 'Há tempos';
}

export function isOnline(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < 5 * 60 * 1000;
}

export function formatDistanceKm(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km)) return null;
  if (km < 1) return i18n.t('swipe:distance.near');
  if (km < 100) return i18n.t('swipe:distance.km', { km });
  return i18n.t('swipe:distance.far');
}
