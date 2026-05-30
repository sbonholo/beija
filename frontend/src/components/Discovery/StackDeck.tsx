import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase, type Profile } from '../../lib/supabase';
import { SwipeCard, type SwipeCardProfile, type SwipeDirection } from './SwipeCard';
import { MatchModal } from './MatchModal';
import { DiscoveryFilters } from './DiscoveryFilters';
import { SafetyMenu } from '../Moderation/SafetyMenu';
import { useGeolocation } from '../../hooks/useGeolocation';
import { useToast } from '../Toast';
import { track } from '../../lib/analytics';
import {
  REWIND_DAILY_LIMIT,
  REWIND_HISTORY_LIMIT,
  REWIND_STORAGE_KEY,
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
    return parsed.date === todayKey() ? (parsed.count ?? 0) : 0;
  } catch {
    return 0;
  }
}

function writeRewindCount(count: number): void {
  try {
    localStorage.setItem(REWIND_STORAGE_KEY, JSON.stringify({ date: todayKey(), count }));
  } catch {
    /* private mode */
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

interface RewindEntry {
  profile: ProfileWithMedia;
  direction: SwipeDirection;
  matchIdToUndo: string | null;
}

// Active room the user is currently checked into
interface ActiveRoom {
  id: string;
  name: string;
}

export function StackDeck() {
  const nav = useNavigate();
  const toast = useToast();
  const { t } = useTranslation('swipe');
  const [userId, setUserId] = useState<string | null>(null);
  // undefined = resolving, null = no active room, object = in a room
  const [activeRoom, setActiveRoom] = useState<ActiveRoom | null | undefined>(undefined);
  const [deck, setDeck] = useState<ProfileWithMedia[]>([]);
  const [history, setHistory] = useState<RewindEntry[]>([]);
  const [rewindCount, setRewindCount] = useState<number>(() => readRewindCount());
  const [rewinding, setRewinding] = useState(false);
  const [rewindEnter, setRewindEnter] = useState<SwipeDirection | null>(null);
  const [rewoundId, setRewoundId] = useState<string | null>(null);
  const [likesYouCount, setLikesYouCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<NewMatch | null>(null);
  const [safetyTarget, setSafetyTarget] = useState<{ id: string; name: string | null } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [firstCardTracked, setFirstCardTracked] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  useGeolocation({ autoUpdate: true });

  const top = useMemo(() => deck.slice(0, STACK_VISIBLE), [deck]);

  const enrichProfiles = useCallback(
    async (profiles: SwipeCardProfile[]): Promise<ProfileWithMedia[]> => {
      if (profiles.length === 0) return [];
      const ids = profiles.map((p) => p.id);
      const { data: photos } = await supabase
        .from('photos')
        .select('user_id, url')
        .in('user_id', ids);
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
    },
    [],
  );

  // Load deck scoped to active room when in one, otherwise empty (fail-closed)
  const loadMore = useCallback(async () => {
    if (!userId || !activeRoom) return;
    try {
      const { data, error: rpcError } = await supabase.rpc('find_potential_matches_in_event', {
        p_user_id:  userId,
        p_event_id: activeRoom.id,
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
  }, [userId, activeRoom, enrichProfiles]);

  const refreshLikesYou = useCallback(async () => {
    try {
      const { data, error: e } = await supabase.rpc('who_liked_me');
      if (e) return;
      setLikesYouCount((data as unknown[] | null)?.length ?? 0);
    } catch {
      /* ignore — non-critical */
    }
  }, []);

  // Bootstrap: get userId + active room together, then set loading=false
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) { setError('not_authenticated'); return; }
        if (cancelled) return;
        setUserId(uid);
        void bumpLastActive(uid);

        // Find active check-in (left_at IS NULL)
        const { data: ci } = await supabase
          .from('check_ins')
          .select('event_id')
          .eq('user_id', uid)
          .is('left_at', null)
          .maybeSingle();

        if (cancelled) return;

        if (ci?.event_id) {
          const { data: ev } = await supabase
            .from('events')
            .select('name')
            .eq('id', ci.event_id)
            .maybeSingle();
          if (!cancelled) setActiveRoom({ id: ci.event_id, name: (ev?.name as string | undefined) ?? 'Evento' });
        } else {
          if (!cancelled) setActiveRoom(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load deck when userId + activeRoom are both ready
  useEffect(() => {
    if (userId && activeRoom && deck.length === 0) {
      void loadMore();
    }
  }, [userId, activeRoom, deck.length, loadMore]);

  useEffect(() => {
    if (!firstCardTracked && deck.length > 0) {
      setFirstCardTracked(true);
      track('first_card_viewed');
    }
  }, [deck.length, firstCardTracked]);

  useEffect(() => {
    if (userId && activeRoom) void refreshLikesYou();
  }, [userId, activeRoom, refreshLikesYou]);

  async function handleLeaveRoom() {
    if (!activeRoom || !userId) return;
    await supabase.rpc('leave_event_room', { p_event_id: activeRoom.id });
    setActiveRoom(null);
    setDeck([]);
  }

  async function handleSwipe(target: ProfileWithMedia, direction: SwipeDirection) {
    if (!userId) return;
    track(`swipe_${direction}`, { card_index: history.length });
    const name = target.name ?? '';
    setLiveAnnouncement(
      direction === 'left'
        ? t('announce.passed', { name })
        : direction === 'super'
          ? t('announce.super_sent', { name })
          : t('announce.liked', { name }),
    );
    setDeck((cur) => cur.filter((p) => p.id !== target.id));
    void bumpLastActive(userId);
    let matchedId: string | null = null;

    if (deck.length <= STACK_VISIBLE + 1) {
      void loadMore();
    }

    try {
      // Always record swipe for dedup in future deck loads
      const { error: insertError } = await supabase.from('swipes').insert({
        swiper_id: userId,
        swipee_id: target.id,
        direction,
      });
      if (insertError) throw insertError;

      // In-room positive reaction → send event_reaction to trigger the match
      if (activeRoom && (direction === 'right' || direction === 'super')) {
        const kind = direction === 'super' ? 'heart' : 'kiss';
        await supabase.from('event_reactions').upsert(
          { sender_id: userId, receiver_id: target.id, event_id: activeRoom.id, kind },
          { onConflict: 'sender_id,receiver_id,event_id' },
        );
      }

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
            track('match_created', { direction });
            setLiveAnnouncement(t('announce.match', { name: target.name ?? '' }));
            setMatch({ matchId: matchRow.id as string, other: target });
            try {
              await supabase.functions.invoke('notify_match', { body: { match_id: matchRow.id } });
            } catch {
              /* push delivery is best-effort */
            }
          }
        }
      }
    } catch (e) {
      console.warn('[StackDeck] swipe persistence failed:', e);
    }

    setHistory((h) =>
      [{ profile: target, direction, matchIdToUndo: matchedId }, ...h].slice(0, REWIND_HISTORY_LIMIT),
    );
    void refreshLikesYou();
  }

  async function handleRewind() {
    if (!userId || rewinding) return;
    const last = history[0];
    if (!last) { toast({ kind: 'info', text: t('rewind_empty') }); return; }
    if (rewindCount >= REWIND_DAILY_LIMIT) { toast({ kind: 'info', text: t('rewind_limit_reached') }); return; }
    setRewinding(true);
    track('rewind_used', { remaining: REWIND_DAILY_LIMIT - rewindCount - 1 });
    const inverse: SwipeDirection =
      last.direction === 'left' ? 'right' : last.direction === 'right' ? 'left' : 'super';
    try {
      const { error: rpcErr } = await supabase.rpc('rewind_last_swipe');
      if (rpcErr) throw rpcErr;
      setHistory((h) => h.slice(1));
      setRewoundId(last.profile.id);
      setRewindEnter(inverse);
      setDeck((cur) => [last.profile, ...cur.filter((p) => p.id !== last.profile.id)]);
      if (last.matchIdToUndo) setMatch(null);
      const nextCount = rewindCount + 1;
      setRewindCount(nextCount);
      writeRewindCount(nextCount);
      void refreshLikesYou();
    } catch (e) {
      console.warn('[StackDeck] rewind failed:', e);
      toast({ kind: 'info', text: e instanceof Error ? e.message : t('rewind_failed') });
    } finally {
      setRewinding(false);
    }
  }

  function trigger(direction: SwipeDirection) {
    const target = deck[0];
    if (!target) return;
    void handleSwipe(target, direction);
  }

  const openDetail = useCallback((profileId: string) => { nav(`/profile/${profileId}`); }, [nav]);
  const openSafety = useCallback((profileId: string, profileName: string | null) => {
    setSafetyTarget({ id: profileId, name: profileName });
  }, []);

  // ── Render states ────────────────────────────────────────────

  if (loading || activeRoom === undefined) {
    return (
      <div className="screen">
        <div className="header" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Discover</h2>
          <div className="skeleton" style={{ width: 78, height: 32 }} aria-hidden />
        </div>
        <div className="skeleton card"
          style={{ width: '100%', maxWidth: 440, aspectRatio: '3 / 4', margin: '0 auto' }}
          aria-label="Carregando perfis" />
      </div>
    );
  }

  if (error && deck.length === 0) {
    return (
      <div className="screen" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginTop: '20vh' }}>⚠️</div>
        <h2 style={{ marginTop: 10 }}>{t('load_error.title')}</h2>
        <p className="muted">{error}</p>
        <button className="btn" style={{ marginTop: 16, maxWidth: 260 }} onClick={() => void loadMore()}>
          {t('common:actions.retry', { defaultValue: 'Tentar de novo' })}
        </button>
      </div>
    );
  }

  // ── Step 5+6: FAIL-CLOSED — no active room ───────────────────
  if (activeRoom === null) {
    return (
      <div className="screen" style={{ textAlign: 'center' }}>
        <div style={{ marginTop: '18vh' }}>
          <span className="glow-emoji" style={{ fontSize: 64 }}>🌙</span>
        </div>
        <h2 style={{ marginTop: 8, fontFamily: "'Space Grotesk', sans-serif" }}>
          Nada acontecendo perto.
        </h2>
        <p className="muted" style={{ marginTop: 4, marginBottom: 24 }}>
          Você cria o primeiro?
        </p>
        <button
          className="btn"
          style={{ maxWidth: 260 }}
          onClick={() => nav('/events')}
        >
          Criar agora
        </button>
        <button
          className="btn ghost"
          style={{ maxWidth: 260, marginTop: 10 }}
          onClick={() => nav('/events')}
        >
          Ver eventos
        </button>
      </div>
    );
  }

  // ── In room, deck empty (everyone in room seen) ───────────────
  if (deck.length === 0) {
    return (
      <div className="screen" style={{ textAlign: 'center' }}>
        {/* Room badge */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10vh', marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', background: 'var(--card-raised)',
            padding: '4px 14px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--hairline)' }}>
            📍 {activeRoom.name}
          </span>
        </div>
        <div>
          <span className="glow-emoji" style={{ fontSize: 64 }}>🌙</span>
        </div>
        <h2 style={{ marginTop: 8 }}>{t('empty.title')}</h2>
        <p className="muted">{t('empty.subtitle')}</p>
        {likesYouCount > 0 && (
          <button className="btn" style={{ marginTop: 18, maxWidth: 260 }}
            onClick={() => { track('likes_you_viewed', { source: 'empty_deck_cta' }); nav('/likes-you'); }}>
            {t('empty.likes_you_cta', { count: likesYouCount })}
          </button>
        )}
        <button className="btn ghost" style={{ marginTop: 10, maxWidth: 260 }}
          onClick={() => void handleLeaveRoom()}>
          Sair do evento
        </button>
      </div>
    );
  }

  const rewindAvailable = history.length > 0 && rewindCount < REWIND_DAILY_LIMIT && !rewinding;

  return (
    <div className="screen" style={{ paddingBottom: 140 }}>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>
      <div className="header" style={{ marginBottom: 12, gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h2 style={{ margin: 0 }}>{t('header')}</h2>
          {/* Room context badge */}
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            📍 {activeRoom.name}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {likesYouCount > 0 && (
            <button type="button" className="chip"
              onClick={() => { track('likes_you_viewed', { source: 'discover_chip' }); nav('/likes-you'); }}
              aria-label={t('likes_you_chip_aria', { count: likesYouCount })}
              style={{ background: 'linear-gradient(120deg, var(--pink), var(--hot))',
                borderColor: 'transparent', color: '#fff', fontWeight: 700 }}>
              💋 {likesYouCount}
            </button>
          )}
          <button type="button" className="chip"
            onClick={() => void handleLeaveRoom()}
            aria-label="Sair do evento"
            style={{ fontSize: 13 }}>
            ← Sair
          </button>
          <button type="button" className="chip"
            onClick={() => setFiltersOpen(true)}
            aria-label={t('actions.filters')}>
            ⚙︎ {t('actions.filters')}
          </button>
        </div>
      </div>

      <div style={{ position: 'relative', width: '100%', maxWidth: 440, aspectRatio: '3 / 4', margin: '0 auto' }}>
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
              onOpenSafety={openSafety}
              enterFrom={i === 0 && p.id === rewoundId ? rewindEnter : null}
            />
          ))}
      </div>

      {/* Rewind button */}
      <button type="button" onClick={() => void handleRewind()} aria-label={t('actions.rewind')}
        disabled={!rewindAvailable}
        style={{ position: 'fixed', left: 'calc(env(safe-area-inset-left) + 18px)',
          bottom: 'calc(env(safe-area-inset-bottom) + 24px)', width: 52, height: 52,
          borderRadius: '50%', background: 'var(--card)', border: '1px solid rgba(255,255,255,0.08)',
          color: rewindAvailable ? '#facc15' : '#5a4a72', fontSize: 22,
          boxShadow: '0 8px 24px rgba(0,0,0,0.45)', cursor: rewindAvailable ? 'pointer' : 'not-allowed',
          opacity: rewindAvailable ? 1 : 0.45, zIndex: 31,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        ↶
      </button>

      <div style={{ position: 'fixed', left: 0, right: 0,
        bottom: 'calc(env(safe-area-inset-bottom) + 24px)',
        display: 'flex', justifyContent: 'center', gap: 22, zIndex: 30, pointerEvents: 'none' }}>
        <button type="button" className="swipe-action nope" onClick={() => trigger('left')}
          aria-label={t('actions.pass')} style={{ pointerEvents: 'auto' }}>✕</button>
        <button type="button" className="swipe-action super" onClick={() => trigger('super')}
          aria-label={t('actions.super')} style={{ pointerEvents: 'auto' }}>⭐</button>
        <button type="button" className="swipe-action like" onClick={() => trigger('right')}
          aria-label={t('actions.like')} style={{ pointerEvents: 'auto' }}>♥</button>
      </div>

      {match && userId && (
        <MatchModal matchId={match.matchId} other={match.other} onClose={() => setMatch(null)} />
      )}

      {filtersOpen && (
        <DiscoveryFilters
          onClose={() => setFiltersOpen(false)}
          onApplied={() => { setDeck([]); void loadMore(); }}
        />
      )}

      {safetyTarget && (
        <SafetyMenu
          targetUserId={safetyTarget.id}
          targetName={safetyTarget.name ?? undefined}
          onClose={() => setSafetyTarget(null)}
          onDone={() => {
            const removedId = safetyTarget.id;
            setSafetyTarget(null);
            setDeck((cur) => cur.filter((p) => p.id !== removedId));
          }}
        />
      )}
    </div>
  );
}
