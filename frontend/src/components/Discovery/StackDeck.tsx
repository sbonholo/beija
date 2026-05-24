import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, type DiscoverableProfile } from '../../lib/supabase';
import { SwipeCard, type SwipeDirection } from './SwipeCard';
import { MatchModal } from './MatchModal';
import { DiscoveryFilters } from './DiscoveryFilters';
import { useGeolocation } from '../../hooks/useGeolocation';
import { useToast } from '../Toast';
import {
  REWIND_DAILY_LIMIT,
  REWIND_HISTORY_LIMIT,
  REWIND_STORAGE_KEY,
  STR_REWIND_EMPTY,
  STR_REWIND_LABEL,
  STR_REWIND_LIMIT_REACHED,
} from '../../lib/constants';

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

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function readRewindCount(): number {
  try {
    const raw = localStorage.getItem(REWIND_STORAGE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { date?: string; count?: number };
    if (parsed.date === todayKey()) return parsed.count ?? 0;
    return 0;
  } catch {
    return 0;
  }
}

function writeRewindCount(count: number): void {
  try {
    localStorage.setItem(
      REWIND_STORAGE_KEY,
      JSON.stringify({ date: todayKey(), count }),
    );
  } catch {
    /* private mode */
  }
}

interface ProfileWithMedia extends DiscoverableProfile {
  photos: string[];
  interests: string[];
}

interface NewMatch {
  matchId: string;
  other: ProfileWithMedia;
}

interface RewindEntry {
  profile: ProfileWithMedia;
  direction: SwipeDirection;
  swipedAt: number;
}

export function StackDeck() {
  const nav = useNavigate();
  const toast = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [deck, setDeck] = useState<ProfileWithMedia[]>([]);
  const [history, setHistory] = useState<RewindEntry[]>([]);
  const [rewindCount, setRewindCount] = useState<number>(() => readRewindCount());
  const [rewindEnter, setRewindEnter] = useState<SwipeDirection | null>(null);
  const [rewoundId, setRewoundId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<NewMatch | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useGeolocation({ autoUpdate: true });

  const top = useMemo(() => deck.slice(0, STACK_VISIBLE), [deck]);

  const enrichProfiles = useCallback(
    async (profiles: DiscoverableProfile[]): Promise<ProfileWithMedia[]> => {
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
        interests: Array.isArray(p.interests) ? p.interests : [],
      }));
    },
    [],
  );

  const loadMore = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error: rpcError } = await supabase.rpc('find_potential_matches', {
        p_user_id: userId,
      });
      if (rpcError) throw rpcError;
      const fresh = (data ?? []) as DiscoverableProfile[];
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

  async function handleSwipe(target: ProfileWithMedia, direction: SwipeDirection) {
    if (!userId) return;
    setDeck((cur) => cur.filter((p) => p.id !== target.id));
    setHistory((h) =>
      [{ profile: target, direction, swipedAt: Date.now() }, ...h].slice(
        0,
        REWIND_HISTORY_LIMIT,
      ),
    );
    void bumpLastActive(userId);

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
            setMatch({ matchId: matchRow.id, other: target });
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
  }

  async function handleRewind() {
    if (!userId) return;
    const last = history[0];
    if (!last) {
      toast({ kind: 'info', text: STR_REWIND_EMPTY });
      return;
    }
    if (rewindCount >= REWIND_DAILY_LIMIT) {
      toast({ kind: 'info', text: STR_REWIND_LIMIT_REACHED });
      return;
    }

    // Re-insert at the top of the deck with an entrance animation from the
    // OPPOSITE side of the original swipe (deliberate undo, not a mirror).
    const inverse: SwipeDirection =
      last.direction === 'left' ? 'right' : last.direction === 'right' ? 'left' : 'super';
    setHistory((h) => h.slice(1));
    setRewindEnter(inverse);
    setRewoundId(last.profile.id);
    setDeck((cur) => [last.profile, ...cur.filter((p) => p.id !== last.profile.id)]);

    const nextCount = rewindCount + 1;
    setRewindCount(nextCount);
    writeRewindCount(nextCount);

    try {
      await supabase
        .from('swipes')
        .delete()
        .eq('swiper_id', userId)
        .eq('swipee_id', last.profile.id);
    } catch (e) {
      console.warn('[StackDeck] rewind delete failed:', e);
    }
  }

  function trigger(direction: SwipeDirection) {
    const target = deck[0];
    if (!target) return;
    void handleSwipe(target, direction);
  }

  const openDetail = useCallback(
    (profileId: string) => {
      nav(`/profile/${profileId}`);
    },
    [nav],
  );

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
      </div>
    );
  }

  const rewindAvailable = history.length > 0 && rewindCount < REWIND_DAILY_LIMIT;

  return (
    <div className="screen" style={{ paddingBottom: 140 }}>
      <div className="header" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Discover</h2>
        <button
          type="button"
          className="chip"
          onClick={() => setFiltersOpen(true)}
          aria-label="Filtros"
        >
          ⚙︎ Filtros
        </button>
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
        {/* Render top-down so top card is last in DOM (above siblings) */}
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
              onOpenDetail={openDetail}
              enterFrom={i === 0 && p.id === rewoundId ? rewindEnter : null}
            />
          ))}
      </div>

      {/* Rewind button — bottom-LEFT (Tinder's is right; we differentiate) */}
      <button
        type="button"
        onClick={handleRewind}
        aria-label={STR_REWIND_LABEL}
        disabled={!rewindAvailable}
        style={{
          position: 'fixed',
          left: 'calc(env(safe-area-inset-left) + 18px)',
          bottom: 'calc(env(safe-area-inset-bottom) + 24px)',
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'var(--card)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          color: rewindAvailable ? '#facc15' : '#5a4a72',
          fontSize: 22,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
          cursor: rewindAvailable ? 'pointer' : 'not-allowed',
          opacity: rewindAvailable ? 1 : 0.45,
          zIndex: 31,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ↶
      </button>

      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 'calc(env(safe-area-inset-bottom) + 24px)',
          display: 'flex',
          justifyContent: 'center',
          gap: 22,
          zIndex: 30,
          pointerEvents: 'none',
        }}
      >
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
          style={{ ...circleBtn, color: '#3aa8ff', pointerEvents: 'auto', width: 54, height: 54, fontSize: 24 }}
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
