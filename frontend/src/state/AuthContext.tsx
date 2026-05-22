import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { mockedApi as api, setToken, getToken } from '../lib/api';
import { refreshSocketAuth, closeSocket } from '../lib/socket';
import type { User } from '../types';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  signIn: (token: string, user: User) => void;
  signOut: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { user } = await api.getMe();
      setUser(user);
    } catch {
      setToken(null);
      setUser(null);
      closeSocket();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signIn = (token: string, u: User) => {
    setToken(token);
    setUser(u);
    refreshSocketAuth();
  };

  const signOut = () => {
    setToken(null);
    setUser(null);
    closeSocket();
  };

  return (
    <Ctx.Provider value={{ user, loading, setUser, signIn, signOut, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
