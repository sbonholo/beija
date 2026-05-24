import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { closeSocket } from '../lib/socket';
import type { User } from '../types';

const PROFILE_KEY = 'beija_profile';

function readProfile(): User | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

function writeProfile(u: User | null) {
  try {
    if (u) localStorage.setItem(PROFILE_KEY, JSON.stringify(u));
    else localStorage.removeItem(PROFILE_KEY);
  } catch {
    /* quota or private mode */
  }
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  signOut: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(() => readProfile());

  const setUser = useCallback((u: User | null) => {
    setUserState(u);
    writeProfile(u);
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    closeSocket();
  }, [setUser]);

  return (
    <Ctx.Provider value={{ user, loading: false, setUser, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
