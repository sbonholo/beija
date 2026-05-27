import type { ReactionType } from '../types';

const KEY = 'beija_last_reaction';
const DEFAULT: ReactionType = 'kiss';
const VALID: ReactionType[] = ['kiss', 'heart', 'fire'];

export function getLastReaction(): ReactionType {
  try {
    const v = localStorage.getItem(KEY);
    if (v && VALID.includes(v as ReactionType)) return v as ReactionType;
  } catch {
    /* private mode */
  }
  return DEFAULT;
}

export function setLastReaction(type: ReactionType): void {
  try {
    localStorage.setItem(KEY, type);
  } catch {
    /* noop */
  }
}
