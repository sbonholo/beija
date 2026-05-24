import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, type Profile } from '../../lib/supabase';
import { SwipeCard, type SwipeCardProfile, type SwipeDirection } from './SwipeCard';
import { MatchModal } from './MatchModal';
import { DiscoveryFilters } from './DiscoveryFilters';
import { useGeolocation } from '../../hooks/useGeolocation';

const BATCH_SIZE = 10;
const STACK_VISIBLE = 3;
const LAST_ACTIVE_BUMP_KEY = 'beija_last_active_bump';
const LAST_ACTIVE_BUMP_INTERVAL_MS = 60 * 60 * 1000; // 1h

async function bumpLastActive(userId: string) {
  try {
    const last = Number(localStorage.getItem(LAST_ACTIVE_BUMP_KEY) ?? '0');
    if (Date.now() - last < LAST_ACTIVE_BUMP_INTERVAL_MS) return;
    localStorage.setItem(LAST_ACTIVE_BUMP_KEY, String(Date.now()));
    await supabase
      .from('profiles')
      .update({ last_active_at: new Date().toISOString(), is_inactive: false })
      .eq('id', userId);
  } catch {
    /* best-effort */
  }
}

interface ProfileWithMedia extends SwipeCardProfile {
  photos: string[];
  interests: string[];
}

interface NewMatch {
  matchId: string;
  other: ProfileWithMedia;
}

interface RewindState {
  profile: ProfileWithMedia;
  /** The match (id) that was created by this swipe, if any. Cleared on rewind. */
  matchIdToUndo: string | null;
}

export function StackDeck() {
  const nav = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [deck, setDeck] = useState<ProfileWithMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<NewMatch | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** Last swiped profile — enables Rewind. Cleared after rewind or page exit. */
  const [lastSwiped, setLastSwiped] = useState<RewindState | null>(null);
  const [rewinding, setRewinding] = useState(false);
  const [likesYouCount, setLikesYouCount] = useState(0);
  useGeolocation({ autoUpdate: true });

  const top = useMemo(() => deck.slice(0, STACK_VISIBLE), [deck]);

  const enrichProfiles = useCallback(async (profiles: SwipeCardProfile[]): Promise<ProfileWithMedia[]> => {
    if (profiles.length === 0) return [];
    const ids = profiles.map((p) => p.id);
    const { data: photos } = await supabase
      .from('photos')
      .select('user_id, slot, url')
      .in('user_id', ids)
      .order('slot', { ascending: true });
    const photosByUser = new Map<string, string[]>();
    for (const row of photos ?? []) {
      const arr = photosByUser.get(row.user_id) ?? [];
      arr.push(row.url);
      photosByUser.set(row.user_id, arr);
    }
    return profiles.map((p) => ({
      ...p,
      photos: photosByUser.get(p.id) ?? [],
      interests: Array.isArray((p as Profile & { interests?: string[] }).interests)
        ? ((p as Profile & { interests?: string[] }).interests as string[])
        : [],
    }));
  }, []);

  const loadMore = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error: rpcError } = await supabase.rpc('find_potential_matches', {
        p_user_id: userId,
      });
      if (rpcError) throw rpcError;
      const fresh = (data ?? []) as SwipeCardProfile[];
      const enriched = await enrichProfiles(fresh);
      setDeck((cur) => {
        const seen = new Set(cur.map((p) => p.id));
        const toAdd = enriched.filter((p) => !seen.has(p.id));
        return [...cur, ...toAdd].slice(0, BATCH_SIZE * 2);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load_failed');
    }
  }, [userId, enrichProfiles]);

  const refreshLikesYou = useCallback(async () => {
    try {
      const { data, error: e } = await supabase.rpc('who_liked_me');
      if (e) return;
      setLikesYouCount((data as unknown[] | null)?.length ?? 0);
    } catch {
      /* ignore — non-critical */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) {
          setError('not_authenticated');
          return;
        }
        if (cancelled) return;
        setUserId(uid);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (userId && deck.length === 0) {
      void loadMore();
    }
  }, [userId, deck.length, loadMore]);

  useEffect(() => {
    if (userId) void refreshLikesYou();
  }, [userId, refreshLikesYou]);

  async function handleSwipe(target: ProfileWithMedia, direction: SwipeDirection) {
    if (!userId) return;
    setDeck((cur) => cur.filter((p) => p.id !== target.id));
    void bumpLastActive(userId);
    let matchedId: string | null = null;

    if (deck.length <= STACK_VISIBLE + 1) {
      void loadMore();
    }

    try {
      const { error: insertError } = await supabase.from('swipes').insert({
        swiper_id: userId,
        swipee_id: target.id,
        direction,
      });
      if (insertError) throw insertError;

      if (direction === 'right' || direction === 'super') {
        const lo = userId < target.id ? userId : target.id;
        const hi = userId < target.id ? target.id : userId;
        const { data: matchRow } = await supabase
          .from('matches')
          .select('id, created_at')
          .eq('user1_id', lo)
          .eq('user2_id', hi)
          .maybeSingle();
        if (matchRow) {
          const created = new Date(matchRow.created_at).getTime();
          if (Date.now() - created < 5000) {
            matchedId = matchRow.id as string;
            setMatch({ matchId: matchRow.id as string, other: target });
            try {
              await supabase.functions.invoke('notify_match', {
                body: { match_id: matchRow.id },
              });
            } catch {
              /* push delivery is best-effort */
            }
          }
        }
      }
    } catch (e) {
      console.warn('[StackDeck] swipe persistence failed:', e);
    }

    setLastSwiped({ profile: target, matchIdToUndo: matchedId });
    // Re-fetch likes-you count: if I just swiped right on someone who liked me,
    // they should disappear from that list.
    void refreshLikesYou();
  }

  async function rewind() {
    if (!lastSwiped || rewinding) return;
    setRewinding(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc('rewind_last_swipe');
      if (rpcErr) throw rpcErr;
      // Re-insert the profile at the top of the deck so the user sees them again
      setDeck((cur) => [lastSwiped.profile, ...cur.filter((p) => p.id !== lastSwiped.profile.id)]);
      // Close any open match modal that this swipe might have produced
      if (lastSwiped.matchIdToUndo) setMatch(null);
      setLastSwiped(null);
      // Refresh ancillary state
      void refreshLikesYou();
      // Acknowledge result for future telemetry
      void data;
    } catch (e) {
      console.warn('[StackDeck] rewind failed:', e);
    } finally {
      setRewinding(false);
    }
  }

  function trigger(direction: SwipeDirection) {
    const target = deck[0];
    if (!target) return;
    void handleSwipe(target, direction);
  }

  if (loading) {
    return (
      <div className="screen">
        <div className="header" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Discover</h2>
          <div className="skeleton" style={{ width: 78, height: 32 }} aria-hidden />
        </div>
        <div
          className="skeleton card"
          style={{
            width: '100%',
            maxWidth: 440,
            aspectRatio: '3 / 4',
            margin: '0 auto',
          }}
          aria-label="Carregando perfis"
        />
      </div>
    );
  }

  if (error && deck.length === 0) {
    return (
      <div className="screen" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginTop: '20vh' }}>⚠️</div>
        <h2 style={{ marginTop: 10 }}>Não conseguimos carregar perfis</h2>
        <p className="muted">{error}</p>
        <button className="btn" style={{ marginTop: 16, maxWidth: 260 }} onClick={() => void loadMore()}>
          Tentar de novo
        </button>
      </div>
    );
  }

  if (deck.length === 0) {
    return (
      <div className="screen" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginTop: '18vh' }}>🌙</div>
        <h2 style={{ marginTop: 8 }}>Sem perfis novos por aqui</h2>
        <p className="muted">Volta mais tarde — ou aumenta a distância no seu perfil pra ver mais gente.</p>
        {likesYouCount > 0 && (
          <button
            className="btn"
            style={{ marginTop: 18, maxWidth: 260 }}
            onClick={() => nav('/likes-you')}
          >
            Ver {likesYouCount} {likesYouCount === 1 ? 'curtida' : 'curtidas'} 💋
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="screen" style={{ paddingBottom: 140 }}>
      <div className="header" style={{ marginBottom: 12, gap: 8 }}>
        <h2 style={{ margin: 0 }}>Discover</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {likesYouCount > 0 && (
            <button
              type="button"
              className="chip"
              onClick={() => nav('/likes-you')}
              aria-label={`${likesYouCount} curtidas`}
              style={{
                background: 'linear-gradient(120deg, var(--pink), var(--hot))',
                borderColor: 'transparent',
                color: '#fff',
                fontWeight: 700,
              }}
            >
              💋 {likesYouCount}
            </button>
          )}
          <button
            type="button"
            className="chip"
            onClick={() => setFiltersOpen(true)}
            aria-label="Filtros"
          >
            ⚙︎ Filtros
          </button>
        </div>
      </div>
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 440,
          aspectRatio: '3 / 4',
          margin: '0 auto',
        }}
      >
        {top
          .map((p, i) => ({ p, i }))
          .reverse()
          .map(({ p, i }) => (
            <SwipeCard
              key={p.id}
              profile={p}
              photos={p.photos}
              interests={p.interests}
              stackIndex={i}
              onSwipe={(direction) => handleSwipe(p, direction)}
            />
          ))}
      </div>

      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 'calc(env(safe-area-inset-bottom) + 24px)',
          display: 'flex',
          justifyContent: 'center',
          gap: 16,
          zIndex: 30,
          pointerEvents: 'none',
        }}
      >
        <button
          type="button"
          onClick={rewind}
          disabled={!lastSwiped || rewinding}
          aria-label="Desfazer último swipe"
          title={lastSwiped ? 'Desfazer' : 'Nada pra desfazer'}
          style={{
            ...circleBtn,
            color: lastSwiped ? '#ffd54a' : 'var(--muted)',
            opacity: lastSwiped ? 1 : 0.45,
            cursor: lastSwiped ? 'pointer' : 'not-allowed',
            width: 50,
            height: 50,
            fontSize: 22,
            pointerEvents: 'auto',
          }}
        >
          ↶
        </button>
        <button
          type="button"
          onClick={() => trigger('left')}
          aria-label="Passar"
          style={{ ...circleBtn, color: '#ff5b5b', pointerEvents: 'auto' }}
        >
          ✕
        </button>
        <button
          type="button"
          onClick={() => trigger('super')}
          aria-label="Super like"
          style={{
            ...circleBtn,
            color: '#3aa8ff',
            pointerEvents: 'auto',
            width: 54,
            height: 54,
            fontSize: 24,
          }}
        >
          ⭐
        </button>
        <button
          type="button"
          onClick={() => trigger('right')}
          aria-label="Curtir"
          style={{ ...circleBtn, color: '#4ade80', pointerEvents: 'auto' }}
        >
          ♥
        </button>
      </div>

      {match && userId && (
        <MatchModal
          matchId={match.matchId}
          other={match.other}
          onClose={() => setMatch(null)}
        />
      )}

      {filtersOpen && (
        <DiscoveryFilters
          onClose={() => setFiltersOpen(false)}
          onApplied={() => {
            setDeck([]);
            void loadMore();
          }}
        />
      )}
    </div>
  );
}

const circleBtn: React.CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: '50%',
  background: 'var(--card)',
  border: '1px solid rgba(255,255,255,0.08)',
  fontSize: 28,
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};
