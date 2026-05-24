import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { signOut as authSignOut } from '../lib/auth';
import { identifyAnalytics, resetAnalytics, setAnalyticsConsent } from '../lib/analytics';
import { identifySentryUser } from '../lib/sentry';

interface ProfileLite {
  id: string;
  name: string | null;
  gender: string | null;
  deleted_at: string | null;
  has_photo: boolean;
  allow_analytics: boolean;
  /** non-null when an active deletion_request exists. */
  deletion_scheduled_for: string | null;
}

interface AuthCtx {
  session: Session | null;
  userId: string | null;
  loading: boolean;
  profile: ProfileLite | null;
  hasProfile: boolean;
  /**
   * True when the user is signed in but their profile is soft-deleted AND the
   * 30-day deletion window hasn't passed yet. UI should show the reactivation
   * screen instead of /onboarding or /discover.
   */
  needsReactivation: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

async function fetchProfileLite(userId: string): Promise<ProfileLite | null> {
  const [{ data: profileRow }, { data: photoRow }, { data: deletionRow }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, name, gender, deleted_at, allow_analytics')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('photos')
      .select('user_id')
      .eq('user_id', userId)
      .eq('slot', 0)
      .maybeSingle(),
    supabase
      .from('deletion_requests')
      .select('scheduled_for, cancelled_at')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);
  if (!profileRow) return null;
  const activeDeletion =
    deletionRow && !deletionRow.cancelled_at ? deletionRow.scheduled_for : null;
  return {
    id: profileRow.id,
    name: profileRow.name ?? null,
    gender: profileRow.gender ?? null,
    deleted_at: profileRow.deleted_at ?? null,
    has_photo: !!photoRow,
    allow_analytics: profileRow.allow_analytics !== false,
    deletion_scheduled_for: activeDeletion,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const [loading, setLoading] = useState(true);

  // Track the most recent session token so stale fetch responses are dropped.
  const currentSessionRef = useRef<string | null>(null);

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
      const token = data.session?.access_token ?? null;
      currentSessionRef.current = token;
      setSession(data.session);
      if (data.session) {
        identifySentryUser(data.session.user.id);
        identifyAnalytics(data.session.user.id);
        const p = await fetchProfileLite(data.session.user.id);
        if (mounted && currentSessionRef.current === token) {
          setProfile(p);
          if (p) setAnalyticsConsent(p.allow_analytics);
        }
      }
      if (mounted) setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;
      const token = newSession?.access_token ?? null;
      currentSessionRef.current = token;
      setSession(newSession);
      if (newSession) {
        identifySentryUser(newSession.user.id);
        identifyAnalytics(newSession.user.id);
        const p = await fetchProfileLite(newSession.user.id);
        if (mounted && currentSessionRef.current === token) {
          setProfile(p);
          if (p) setAnalyticsConsent(p.allow_analytics);
        }
      } else {
        identifySentryUser(null);
        resetAnalytics();
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
    identifySentryUser(null);
    resetAnalytics();
    setSession(null);
    setProfile(null);
  }, []);

  const { hasProfile, needsReactivation } = useMemo(() => {
    if (!profile) return { hasProfile: false, needsReactivation: false };
    const isSoftDeleted = !!profile.deleted_at;
    const hasOpenDeletion =
      !!profile.deletion_scheduled_for &&
      new Date(profile.deletion_scheduled_for).getTime() > Date.now();
    return {
      hasProfile:
        !!profile.name && !!profile.gender && !isSoftDeleted && profile.has_photo,
      needsReactivation: isSoftDeleted && hasOpenDeletion,
    };
  }, [profile]);

  return (
    <Ctx.Provider
      value={{
        session,
        userId: session?.user.id ?? null,
        loading,
        profile,
        hasProfile,
        needsReactivation,
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
