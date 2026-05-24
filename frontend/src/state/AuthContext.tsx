import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { signOut as authSignOut } from '../lib/auth';

interface ProfileLite {
  id: string;
  name: string | null;
  gender: string | null;
  deleted_at: string | null;
  has_photo: boolean;
}

interface AuthCtx {
  session: Session | null;
  userId: string | null;
  loading: boolean;
  profile: ProfileLite | null;
  hasProfile: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

async function fetchProfileLite(userId: string): Promise<ProfileLite | null> {
  const [{ data: profileRow }, { data: photoRow }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, name, gender, deleted_at')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('photos')
      .select('user_id')
      .eq('user_id', userId)
      .eq('slot', 0)
      .maybeSingle(),
  ]);
  if (!profileRow) return null;
  return {
    id: profileRow.id,
    name: profileRow.name ?? null,
    gender: profileRow.gender ?? null,
    deleted_at: profileRow.deleted_at ?? null,
    has_photo: !!photoRow,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    if (data.session) {
      const p = await fetchProfileLite(data.session.user.id);
      setProfile(p);
    } else {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      if (data.session) {
        const p = await fetchProfileLite(data.session.user.id);
        if (mounted) setProfile(p);
      }
      if (mounted) setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;
      setSession(newSession);
      if (newSession) {
        const p = await fetchProfileLite(newSession.user.id);
        if (mounted) setProfile(p);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await authSignOut();
    setSession(null);
    setProfile(null);
  }, []);

  const hasProfile =
    !!profile && !!profile.name && !!profile.gender && !profile.deleted_at && profile.has_photo;

  return (
    <Ctx.Provider
      value={{
        session,
        userId: session?.user.id ?? null,
        loading,
        profile,
        hasProfile,
        refresh,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
