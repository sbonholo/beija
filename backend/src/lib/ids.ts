import { randomBytes, randomInt } from 'crypto';

export function newId(prefix = ''): string {
  return prefix + randomBytes(9).toString('base64url');
}

export function newOtp(): string {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

export function normalizePhone(raw: string): string | null {
  const cleaned = raw.replace(/[^0-9+]/g, '');
  if (!cleaned) return null;
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.length >= 10) return '+55' + cleaned;
  return null;
}
