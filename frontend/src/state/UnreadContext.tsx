import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

const KEYS = { likes: 'beija_unread_likes', matches: 'beija_unread_matches', chats: 'beija_unread_chats' } as const;

function readCount(key: string): number {
  try { return parseInt(localStorage.getItem(key) || '0', 10) || 0; } catch { return 0; }
}
function writeCount(key: string, n: number) {
  try { localStorage.setItem(key, String(n)); } catch { /* quota */ }
}

interface UnreadCtx {
  unreadLikes: number;
  unreadMatches: number;
  unreadChats: number;
  /** @deprecated use unreadMatches */
  unreadMatches_legacy: number;
  bumpLikes: () => void;
  bumpMatches: () => void;
  bumpChats: () => void;
  clearLikes: () => void;
  clearMatches: () => void;
  clearChats: () => void;
  /** @deprecated clears matches+chats for backward compat */
  bump: () => void;
  clear: () => void;
}

const Ctx = createContext<UnreadCtx | null>(null);

export function UnreadProvider({ children }: { children: ReactNode }) {
  const [unreadLikes,   setUnreadLikes]   = useState(() => readCount(KEYS.likes));
  const [unreadMatches, setUnreadMatches] = useState(() => readCount(KEYS.matches));
  const [unreadChats,   setUnreadChats]   = useState(() => readCount(KEYS.chats));

  const bumpLikes   = useCallback(() => setUnreadLikes  ((n) => { const v = n + 1; writeCount(KEYS.likes,   v); return v; }), []);
  const bumpMatches = useCallback(() => setUnreadMatches((n) => { const v = n + 1; writeCount(KEYS.matches, v); return v; }), []);
  const bumpChats   = useCallback(() => setUnreadChats  ((n) => { const v = n + 1; writeCount(KEYS.chats,   v); return v; }), []);

  const clearLikes   = useCallback(() => { writeCount(KEYS.likes,   0); setUnreadLikes(0);   }, []);
  const clearMatches = useCallback(() => { writeCount(KEYS.matches, 0); setUnreadMatches(0); }, []);
  const clearChats   = useCallback(() => { writeCount(KEYS.chats,   0); setUnreadChats(0);   }, []);

  // Legacy shims so existing callers in App.tsx don't break before we update them
  const bump  = useCallback(() => { bumpMatches(); bumpChats(); }, [bumpMatches, bumpChats]);
  const clear = useCallback(() => { clearMatches(); clearChats(); }, [clearMatches, clearChats]);

  const value = useMemo(() => ({
    unreadLikes, unreadMatches, unreadChats,
    unreadMatches_legacy: unreadMatches,
    bumpLikes, bumpMatches, bumpChats,
    clearLikes, clearMatches, clearChats,
    bump, clear,
  }), [unreadLikes, unreadMatches, unreadChats, bumpLikes, bumpMatches, bumpChats, clearLikes, clearMatches, clearChats, bump, clear]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUnread() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUnread must be used inside UnreadProvider');
  return v;
}
