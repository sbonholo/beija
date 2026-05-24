import { createContext, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

interface UnreadCtx {
  unreadMatches: number;
  /** Refresh from the server. Called on app focus / nav into matches list. */
  refresh: () => Promise<void>;
}

const Ctx = createContext<UnreadCtx>({ unreadMatches: 0, refresh: async () => {} });

export function UnreadProvider({ children }: { children: ReactNode }) {
  const { userId, session } = useAuth();
  const [unread, setUnread] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  async function fetchCount(uid: string) {
    // matches where I participate
    const { data: matches } = await supabase
      .from('matches')
      .select('id, user1_id, user2_id')
      .or(`user1_id.eq.${uid},user2_id.eq.${uid}`);
    if (!matches || matches.length === 0) {
      setUnread(0);
      return;
    }
    const ids = matches.map((m) => m.id);
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .in('match_id', ids)
      .neq('sender_id', uid)
      .is('read_at', null)
      .is('deleted_at', null);
    setUnread(count ?? 0);
  }

  useEffect(() => {
    if (!userId || !session) {
      setUnread(0);
      return;
    }
    void fetchCount(userId);

    // Subscribe to message INSERT/UPDATE for any of my matches.
    const channel = supabase
      .channel(`unread-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => void fetchCount(userId),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        () => void fetchCount(userId),
      )
      .subscribe();
    channelRef.current = channel;

    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [userId, session]);

  const value = useMemo<UnreadCtx>(
    () => ({
      unreadMatches: unread,
      refresh: async () => {
        if (userId) await fetchCount(userId);
      },
    }),
    [unread, userId],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUnread() {
  return useContext(Ctx);
}
