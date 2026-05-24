import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

const KEY = 'beija_unread';

function readCount(): number {
  try { return parseInt(localStorage.getItem(KEY) || '0', 10) || 0; } catch { return 0; }
}

function writeCount(n: number) {
  try { localStorage.setItem(KEY, String(n)); } catch { /* quota */ }
}

interface UnreadCtx {
  unreadMatches: number;
  bump: () => void;
  clear: () => void;
}

const Ctx = createContext<UnreadCtx | null>(null);

export function UnreadProvider({ children }: { children: ReactNode }) {
  const [unreadMatches, setUnreadMatches] = useState<number>(readCount);

  const bump = useCallback(() => setUnreadMatches((n) => {
    const next = n + 1;
    writeCount(next);
    return next;
  }), []);

  const clear = useCallback(() => {
    writeCount(0);
    setUnreadMatches(0);
  }, []);

  const value = useMemo(() => ({ unreadMatches, bump, clear }), [unreadMatches, bump, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUnread() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUnread must be used inside UnreadProvider');
  return v;
}
