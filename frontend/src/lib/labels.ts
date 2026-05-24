import type { Gender } from '../types';

export const genderLabel: Record<Gender, string> = {
  woman: 'Mulher',
  man: 'Homem',
  'non-binary': 'Não-binário/a',
  other: 'Outro',
};

export const seekingLabel: Record<Gender, string> = {
  woman: 'Mulheres',
  man: 'Homens',
  'non-binary': 'Não-binárias',
  other: 'Outros',
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
