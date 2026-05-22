import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

interface UnreadCtx {
  unreadMatches: number;
  bump: () => void;
  clear: () => void;
}

const Ctx = createContext<UnreadCtx | null>(null);

export function UnreadProvider({ children }: { children: ReactNode }) {
  const [unreadMatches, setUnreadMatches] = useState(0);
  const bump = useCallback(() => setUnreadMatches((n) => n + 1), []);
  const clear = useCallback(() => setUnreadMatches(0), []);
  const value = useMemo(() => ({ unreadMatches, bump, clear }), [unreadMatches, bump, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUnread() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUnread must be used inside UnreadProvider');
  return v;
}
