import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import type { EventAttendee, NearbyEvent, ReactionKind } from '../../lib/supabase';
import { useToast } from '../Toast';
import { SafetyMenu } from '../Moderation/SafetyMenu';
import { formatTime, formatWeekdayDate } from '../../lib/dates';

const PAGE = 60;

const REACTION_BUTTONS: { kind: ReactionKind; label: string; meaningKey: string; color: string }[] = [
  { kind: 'heart', label: '❤️ Curtir', meaningKey: 'heart_meaning', color: 'var(--heart)' },
  { kind: 'kiss',  label: '💋 Beijo',  meaningKey: 'kiss_meaning',  color: 'var(--kiss)'  },
  { kind: 'fire',  label: '🔥 Fogo',   meaningKey: 'fire_meaning',  color: 'var(--fire)'  },
];

// Deck reaction buttons — shown one-at-a-time in the Deck tab
const DECK_ACTIONS: { kind: ReactionKind | null; icon: string; label: string; color: string }[] = [
  { kind: null,   icon: '✕',  label: 'Pular',  color: 'var(--danger)' },
  { kind: 'kiss', icon: '💋', label: 'Beijo',  color: 'var(--kiss)'   },
  { kind: 'heart',icon: '❤️', label: 'Curtir', color: 'var(--heart)'  },
  { kind: 'fire', icon: '🔥', label: 'Fogo',   color: 'var(--fire)'   },
];

const REACTION_EMOJI: Record<ReactionKind, string> = { kiss: '💋', heart: '❤️', fire: '🔥' };

const CATEGORY_GRADIENT: Record<string, string> = {
  festival:  'linear-gradient(135deg, var(--pink) 0%, var(--hot) 100%)',
  concert:   'linear-gradient(135deg, var(--pink-glow) 0%, var(--aurora) 100%)',
  bar:       'linear-gradient(135deg, var(--hot) 0%, var(--gold) 100%)',
  nightclub: 'linear-gradient(135deg, var(--aurora) 0%, var(--pink) 100%)',
  show:      'linear-gradient(135deg, var(--hot) 20%, var(--heart) 100%)',
  other:     'linear-gradient(135deg, var(--card-raised) 0%, var(--bg-elev) 100%)',
};

function formatEventTime(event: NearbyEvent): string {
  const start = new Date(event.starts_at);
  const now   = new Date();
  const time  = formatTime(event.starts_at);
  const isOn  = start <= now && (event.ends_at == null || new Date(event.ends_at) > now);
  if (isOn) return 'Acontecendo agora 🔴';
  const date = formatWeekdayDate(event.starts_at);
  return `${date} às ${time}`;
}

const CATEGORY_LABEL: Record<string, string> = {
  festival: '🎪 Festival', concert: '🎵 Show', bar: '🍺 Bar',
  nightclub: '🪩 Balada',  show: '🎭 Espetáculo', other: '📍 Evento',
};

interface MatchState {
  matchId: string;
  attendee: EventAttendee;
  mine: ReactionKind;
  theirs: ReactionKind | null;
}

function matchIntentKey(mine: ReactionKind, theirs: ReactionKind | null): string {
  if (mine === 'fire' || theirs === 'fire') return 'match_intent_fire';
  if (mine === 'kiss' && theirs === 'kiss') return 'match_intent_kiss_kiss';
  if (mine === 'heart' && theirs === 'heart') return 'match_intent_heart';
  return 'match_intent_mixed';
}

// ─── Deck profile ────────────────────────────────────────────
interface DeckProfile {
  id: string;
  name: string | null;
  age: number | null;
  photo_url: string | null;
}

function ageFromBirthdate(bd: string | null): number | null {
  if (!bd) return null;
  return Math.floor((Date.now() - new Date(bd).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

interface DeckMatchState {
  matchId: string;
  profile: DeckProfile;
  mine: ReactionKind;
}

// ─── Component ───────────────────────────────────────────────
export function EventDetailScreen() {
  const { id: eventId } = useParams<{ id: string }>();
  const { t } = useTranslation('events');
  const nav   = useNavigate();
  const toast = useToast();

  const [event,         setEvent]         = useState<NearbyEvent | null>(null);
  const [attendees,     setAttendees]      = useState<EventAttendee[]>([]);
  const [attendeeError, setAttendeeError]  = useState(false);
  const [loading,       setLoading]        = useState(true);
  const [me,            setMe]             = useState<string | null>(null);
  const [isCheckedIn,   setIsCheckedIn]    = useState(false);
  const [checkingIn,    setCheckingIn]     = useState(false);
  const [selected,      setSelected]       = useState<EventAttendee | null>(null);
  const [safetyOpen,    setSafetyOpen]     = useState(false);
  const [reacting,      setReacting]       = useState(false);
  const [matched,       setMatched]        = useState<MatchState | null>(null);
  const [genderFilter,  setGenderFilter]   = useState(true);
  const [hasMore,       setHasMore]        = useState(false);
  const [loadingMore,   setLoadingMore]    = useState(false);

  // Deck tab state
  const [tab,           setTab]            = useState<'grid' | 'deck'>('grid');
  const [deck,          setDeck]           = useState<DeckProfile[]>([]);
  const [deckIdx,       setDeckIdx]        = useState(0);
  const [deckLoading,   setDeckLoading]    = useState(false);
  const [deckActing,    setDeckActing]     = useState(false);
  const [deckMatch,     setDeckMatch]      = useState<DeckMatchState | null>(null);

  const attendeesRef = useRef<EventAttendee[]>([]);
  useEffect(() => { attendeesRef.current = attendees; }, [attendees]);

  const loadAttendees = useCallback(
    async (filter: boolean, mode: 'reset' | 'append' | 'refresh') => {
      if (!eventId) return;
      const offset = mode === 'append' ? attendeesRef.current.length : 0;
      const limit  = mode === 'refresh' ? Math.max(PAGE, attendeesRef.current.length) : PAGE;

      const { data, error } = await supabase.rpc('get_event_attendees', {
        p_event_id:      eventId,
        p_gender_filter: filter,
        p_limit:         limit,
        p_offset:        offset,
      });

      if (error) {
        if (mode === 'reset') setAttendeeError(true);
        return;
      }
      const list = (data ?? []) as unknown as EventAttendee[];
      setAttendeeError(false);
      if (mode === 'append') {
        setAttendees((prev) => [...prev, ...list]);
        setHasMore(list.length === PAGE);
      } else {
        setAttendees(list);
        setHasMore(list.length >= PAGE);
      }
    },
    [eventId],
  );

  const loadDeck = useCallback(async (userId: string) => {
    if (!eventId) return;
    setDeckLoading(true);
    const { data, error } = await supabase.rpc('find_potential_matches_in_event', {
      p_user_id:  userId,
      p_event_id: eventId,
    });
    if (!error && data) {
      const raw = data as Array<{ id: string; name: string | null; birthdate: string | null; show_age: boolean }>;
      const ids = raw.map((p) => p.id);
      const { data: photos } = await supabase.from('photos').select('user_id, url').in('user_id', ids);
      const photoMap = new Map((photos ?? []).map((ph) => [ph.user_id as string, ph.url as string]));
      setDeck(raw.map((p) => ({
        id:        p.id,
        name:      p.name,
        age:       p.show_age ? ageFromBirthdate(p.birthdate) : null,
        photo_url: photoMap.get(p.id) ?? null,
      })));
      setDeckIdx(0);
    }
    setDeckLoading(false);
  }, [eventId]);

  const loadData = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);

    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id ?? null;
    setMe(userId);

    const [evResult, countResult, checkInResult] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).maybeSingle(),
      supabase.from('check_ins').select('*', { count: 'exact', head: true })
        .eq('event_id', eventId).is('left_at', null),
      userId
        ? supabase.from('check_ins').select('id')
            .eq('event_id', eventId).eq('user_id', userId)
            .is('left_at', null).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (evResult.data) {
      const ev: NearbyEvent = {
        ...(evResult.data as unknown as NearbyEvent),
        distance_km:    null,
        attendee_count: countResult.count ?? 0,
        is_checked_in:  !!checkInResult.data,
      };
      setEvent(ev);
      setIsCheckedIn(!!checkInResult.data);
    }

    await loadAttendees(genderFilter, 'reset');
    setLoading(false);
  }, [eventId, genderFilter, loadAttendees]);

  useEffect(() => { void loadData(); }, [loadData]);

  // Realtime: any check-in INSERT or UPDATE refreshes attendees + count
  useEffect(() => {
    if (!eventId) return;
    const onChange = () => {
      void loadAttendees(genderFilter, 'refresh');
      // Re-query count from DB on next load cycle
    };
    const channel = supabase
      .channel(`event-checkins-${eventId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'check_ins', filter: `event_id=eq.${eventId}` }, onChange)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'check_ins', filter: `event_id=eq.${eventId}` }, onChange)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [eventId, genderFilter, loadAttendees]);

  // Load deck when user switches to Deck tab (and is checked in)
  useEffect(() => {
    if (tab === 'deck' && isCheckedIn && me && deck.length === 0 && !deckLoading) {
      void loadDeck(me);
    }
  }, [tab, isCheckedIn, me, deck.length, deckLoading, loadDeck]);

  async function toggleFilter() {
    const next = !genderFilter;
    setGenderFilter(next);
    await loadAttendees(next, 'reset');
  }

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    await loadAttendees(genderFilter, 'append');
    setLoadingMore(false);
  }

  async function toggleCheckIn() {
    if (checkingIn || !me || !eventId) return;
    setCheckingIn(true);

    if (isCheckedIn) {
      const { error } = await supabase.rpc('leave_event_room', { p_event_id: eventId });
      if (error) {
        toast({ kind: 'info', text: t('error_checkin') });
        setCheckingIn(false);
        return;
      }
      setIsCheckedIn(false);
      setEvent((ev) => ev ? { ...ev, attendee_count: Math.max(0, ev.attendee_count - 1), is_checked_in: false } : ev);
    } else {
      const { error } = await supabase.rpc('join_event_room', { p_event_id: eventId });
      if (error) {
        toast({ kind: 'info', text: t('error_checkin') });
        setCheckingIn(false);
        return;
      }
      setIsCheckedIn(true);
      setEvent((ev) => ev ? { ...ev, attendee_count: ev.attendee_count + 1, is_checked_in: true } : ev);
    }
    setCheckingIn(false);
  }

  async function sendReaction(kind: ReactionKind) {
    if (!selected || reacting || !me || !eventId) return;
    if (!isCheckedIn) { toast({ kind: 'info', text: t('need_check_in') }); return; }

    setReacting(true);
    const prev = selected.my_reaction;
    const updated = { ...selected, my_reaction: kind };
    setSelected(updated);
    setAttendees((list) => list.map((a) => (a.user_id === selected.user_id ? updated : a)));

    const { error } = await supabase.from('event_reactions').upsert(
      { sender_id: me, receiver_id: selected.user_id, event_id: eventId, kind },
      { onConflict: 'sender_id,receiver_id,event_id' },
    );

    if (error) {
      const rolled = { ...selected, my_reaction: prev };
      setSelected(rolled);
      setAttendees((list) => list.map((a) => (a.user_id === selected.user_id ? rolled : a)));
      toast({ kind: 'info', text: t('error_reaction') });
    } else {
      const [u1, u2] = [me, selected.user_id].sort();
      const { data: matchRow } = await supabase.from('matches')
        .select('id, user1_id, user1_reaction, user2_reaction').eq('user1_id', u1).eq('user2_id', u2).maybeSingle();
      if (matchRow) {
        const theirs = matchRow.user1_id === me ? matchRow.user2_reaction : matchRow.user1_reaction;
        setMatched({ matchId: matchRow.id, attendee: updated, mine: kind, theirs: (theirs as ReactionKind | null) ?? null });
        setSelected(null);
      }
    }
    setReacting(false);
  }

  async function deckAct(kind: ReactionKind | null) {
    if (deckActing || !me || !eventId) return;
    const profile = deck[deckIdx];
    if (!profile) return;
    setDeckActing(true);

    // Always insert a swipe to dedup (person won't re-appear in future deck loads)
    void supabase.from('swipes').insert({ swiper_id: me, swipee_id: profile.id, direction: kind ? 'right' : 'left' }).then(() => undefined);

    if (kind) {
      const { error } = await supabase.from('event_reactions').upsert(
        { sender_id: me, receiver_id: profile.id, event_id: eventId, kind },
        { onConflict: 'sender_id,receiver_id,event_id' },
      );
      if (!error) {
        const [u1, u2] = [me, profile.id].sort();
        const { data: matchRow } = await supabase.from('matches')
          .select('id, created_at').eq('user1_id', u1).eq('user2_id', u2).maybeSingle();
        if (matchRow && Date.now() - new Date(matchRow.created_at).getTime() < 5000) {
          setDeckMatch({ matchId: matchRow.id, profile, mine: kind });
        }
      }
    }

    setDeckIdx((i) => i + 1);
    setDeckActing(false);
  }

  if (loading) {
    return (
      <div className="screen">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button onClick={() => nav(-1)} style={{ fontSize: 22, padding: '4px 10px', color: 'var(--text)' }}>←</button>
          <div className="skeleton" style={{ height: 24, width: 160, borderRadius: 8 }} />
        </div>
        <div className="skeleton" style={{ height: 100, borderRadius: 18, marginBottom: 16 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ aspectRatio: '3/4', borderRadius: 10 }} />
          ))}
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="screen">
        <button onClick={() => nav(-1)} style={{ fontSize: 22, padding: '4px 10px', color: 'var(--text)' }}>←</button>
        <div className="empty" style={{ marginTop: 60 }}>
          <p className="muted">{t('error_loading')}</p>
        </div>
      </div>
    );
  }

  const gradient  = CATEGORY_GRADIENT[event.category] ?? CATEGORY_GRADIENT.other;
  const deckCard  = deck[deckIdx] ?? null;
  const deckEmpty = !deckLoading && deckIdx >= deck.length;

  return (
    <div className="screen" style={{ paddingBottom: 40 }}>
      {/* ── Header ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => nav(-1)} aria-label="Voltar"
          style={{ fontSize: 22, padding: '4px 10px', color: 'var(--text)', flexShrink: 0 }}>←</button>
        <h2 style={{ margin: 0, fontSize: 17, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {event.name}
        </h2>
      </div>

      {/* ── Hero image / gradient band ───────────────────────── */}
      {event.image_url ? (
        <div style={{ position: 'relative', height: 190, borderRadius: 'var(--radius-lg)', overflow: 'hidden',
          marginBottom: 16, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow-lg)' }}>
          <img src={event.image_url} alt={event.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
        </div>
      ) : (
        <div style={{ height: 6, borderRadius: 6, background: gradient, marginBottom: 16 }} />
      )}

      {/* ── Event info card ──────────────────────────────────── */}
      <div className="card" style={{ padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
          {CATEGORY_LABEL[event.category]}
          {event.venue && ` · ${event.venue}`}
          {event.city && `, ${event.city}`}
        </div>
        <div style={{ fontSize: 13, color: event.is_checked_in ? 'var(--online)' : 'var(--muted)', marginBottom: 14 }}>
          {formatEventTime(event)}
        </div>

        <button
          className={isCheckedIn ? 'btn' : 'btn ghost'}
          style={{ width: '100%', background: isCheckedIn ? 'var(--pink)' : undefined, fontSize: 15 }}
          disabled={checkingIn}
          onClick={() => void toggleCheckIn()}
        >
          {checkingIn
            ? t('checking_in')
            : isCheckedIn
            ? `${t('checked_in')} (${event.attendee_count})`
            : `${t('check_in')} · ${
                event.attendee_count === 0
                  ? t('no_one_yet')
                  : t(event.attendee_count === 1 ? 'people_here' : 'people_here_plural', { count: event.attendee_count })
              }`}
        </button>
      </div>

      {/* ── Tab bar ─────────────────────────────────────────── */}
      <div className="tab-bar" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'grid'}
          className={`tab-btn${tab === 'grid' ? ' active' : ''}`}
          onClick={() => setTab('grid')}
        >
          Quem tá aqui
        </button>
        <button
          role="tab"
          aria-selected={tab === 'deck'}
          className={`tab-btn${tab === 'deck' ? ' active' : ''}`}
          onClick={() => setTab('deck')}
        >
          Swipe
        </button>
      </div>

      {/* ── GRID TAB ────────────────────────────────────────── */}
      {tab === 'grid' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px 10px' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)', margin: 0 }}>
              {t('attendees_title')}
            </h3>
            <button type="button" className="chip" onClick={() => void toggleFilter()}
              style={{ fontSize: 12, padding: '4px 12px' }} aria-pressed={genderFilter}>
              {genderFilter ? t('filter_compatible') : t('filter_all')}
            </button>
          </div>

          {attendeeError ? (
            <div className="empty" style={{ marginTop: 20 }}>
              <div style={{ fontSize: 40 }}>⚠️</div>
              <p className="muted" style={{ marginBottom: 8 }}>{t('error_loading')}</p>
              <button className="btn ghost" style={{ width: 'auto', padding: '8px 20px' }} onClick={() => void loadData()}>
                Tentar de novo
              </button>
            </div>
          ) : attendees.length === 0 ? (
            <div className="empty" style={{ marginTop: 20 }}>
              <div style={{ fontSize: 40 }}>🎵</div>
              <p className="muted" style={{ marginBottom: 4 }}>
                {genderFilter ? t('no_attendees_compatible') : t('no_attendees')}
              </p>
              <p className="muted" style={{ fontSize: 13 }}>
                {genderFilter ? t('no_attendees_compatible_hint') : t('no_attendees_hint')}
              </p>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                {attendees.map((att) => (
                  <button key={att.user_id} onClick={() => setSelected(att)}
                    style={{ position: 'relative', aspectRatio: '3/4', borderRadius: 10, overflow: 'hidden',
                      background: 'var(--card)', border: 'none', padding: 0, cursor: 'pointer' }}>
                    {att.photo_url ? (
                      <img src={att.photo_url} alt={att.name ?? 'Foto'}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 32,
                        background: 'linear-gradient(135deg, var(--card), var(--bg-elev))' }}>👤</div>
                    )}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                      background: 'linear-gradient(transparent, rgba(0,0,0,0.75))',
                      padding: '16px 6px 5px', fontSize: 11, fontWeight: 600, textAlign: 'left', color: '#fff' }}>
                      {att.name ?? '?'}{att.age ? `, ${att.age}` : ''}
                    </div>
                    {att.my_reaction && (
                      <div style={{ position: 'absolute', top: 4, right: 5, fontSize: 18, lineHeight: 1,
                        filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))' }}>
                        {REACTION_EMOJI[att.my_reaction as ReactionKind]}
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {hasMore && (
                <button className="btn ghost"
                  style={{ width: 'auto', padding: '10px 24px', margin: '16px auto 0', display: 'block' }}
                  disabled={loadingMore} onClick={() => void loadMore()}>
                  {loadingMore ? t('checking_in') : t('load_more')}
                </button>
              )}
            </>
          )}
        </>
      )}

      {/* ── DECK TAB ────────────────────────────────────────── */}
      {tab === 'deck' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Must be checked in */}
          {!isCheckedIn ? (
            <div className="empty" style={{ marginTop: 40 }}>
              <span className="glow-emoji" style={{ fontSize: 48 }}>💋</span>
              <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 'var(--text-lg)', marginTop: 12 }}>
                Faça check-in primeiro
              </p>
              <p className="muted" style={{ fontSize: 'var(--text-sm)', marginTop: 4 }}>
                Entre no evento pra ver quem está aqui.
              </p>
              <button className="btn" style={{ marginTop: 16, maxWidth: 240 }}
                disabled={checkingIn} onClick={() => void toggleCheckIn()}>
                {checkingIn ? t('checking_in') : t('check_in')}
              </button>
            </div>
          ) : deckLoading ? (
            <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 380 }}>
              <div className="skeleton" style={{ width: '100%', aspectRatio: '3/4', borderRadius: 18 }} aria-hidden />
            </div>
          ) : deckEmpty ? (
            <div className="empty" style={{ marginTop: 40 }}>
              <span className="glow-emoji" style={{ fontSize: 56 }}>🌙</span>
              <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: 'var(--text-lg)', marginTop: 12 }}>
                Você viu todo mundo!
              </p>
              <p className="muted" style={{ fontSize: 'var(--text-sm)', marginTop: 4 }}>
                Confira o grid pra mais pessoas no evento.
              </p>
              <button className="btn ghost" style={{ marginTop: 16, maxWidth: 240 }}
                onClick={() => setTab('grid')}>
                Quem tá aqui
              </button>
            </div>
          ) : deckCard ? (
            <div style={{ width: '100%', maxWidth: 380 }}>
              {/* Card */}
              <div style={{ position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden',
                aspectRatio: '3/4', background: 'var(--card)', boxShadow: 'var(--shadow-lg)',
                border: '1px solid var(--hairline)', marginBottom: 16 }}>
                {deckCard.photo_url ? (
                  <img src={deckCard.photo_url} alt={deckCard.name ?? ''}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 72,
                    background: 'linear-gradient(135deg, var(--card), var(--bg-elev))' }}>👤</div>
                )}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'linear-gradient(transparent, rgba(0,0,0,0.82))',
                  padding: '48px 20px 20px' }}>
                  <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 26 }}>
                    {deckCard.name ?? 'Alguém'}{deckCard.age ? `, ${deckCard.age}` : ''}
                  </div>
                </div>

                {/* progress crumbs */}
                {deck.length > 0 && (
                  <div style={{ position: 'absolute', top: 12, left: 12, right: 12,
                    display: 'flex', gap: 4 }}>
                    {deck.map((_, i) => (
                      <div key={i} style={{ flex: 1, height: 3, borderRadius: 2,
                        background: i < deckIdx ? 'rgba(255,255,255,0.8)'
                          : i === deckIdx ? 'linear-gradient(90deg, var(--pink), var(--hot))'
                          : 'rgba(255,255,255,0.25)',
                        boxShadow: i === deckIdx ? '0 0 8px var(--pink-glow)' : 'none',
                        transition: 'background var(--dur-base) var(--ease-out)' }} />
                    ))}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                {DECK_ACTIONS.map(({ kind, icon, label, color }) => (
                  <button
                    key={label}
                    type="button"
                    disabled={deckActing}
                    onClick={() => void deckAct(kind)}
                    aria-label={label}
                    style={{
                      flex: kind === null ? '0 0 52px' : 1,
                      height: 52,
                      borderRadius: kind === null ? '50%' : 'var(--radius-pill)',
                      background: 'var(--card)',
                      border: `1.5px solid ${color}`,
                      color,
                      fontSize: kind === null ? 18 : 20,
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: 'var(--shadow)',
                      transition: 'transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                    }}
                  >
                    <span>{icon}</span>
                    {kind !== null && <span style={{ fontSize: 13 }}>{label}</span>}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {/* Deck match celebration */}
          {deckMatch && (
            <div className="match-modal-bg" role="dialog" aria-modal="true">
              <div className="card" style={{ width: '100%', maxWidth: 380, padding: '28px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 60, marginBottom: 8 }}>
                  {REACTION_EMOJI[deckMatch.mine]}
                </div>
                <h2 style={{ margin: '0 0 6px', fontSize: 24 }}>É match! 🎉</h2>
                <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>
                  Você e {deckMatch.profile.name ?? 'alguém'} se curtiram!
                </p>
                <button className="btn" style={{ marginBottom: 10 }}
                  onClick={() => nav(`/chat/${deckMatch.matchId}`)}>
                  Mandar mensagem
                </button>
                <button className="btn ghost" onClick={() => setDeckMatch(null)}>
                  Continuar explorando
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Attendee reaction modal ──────────────────────────── */}
      {selected && (
        <div className="match-modal-bg" role="dialog" aria-modal="true"
          onClick={() => !reacting && setSelected(null)}>
          <div className="card" onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 380, padding: 0, overflow: 'hidden' }}>
            <div style={{ position: 'relative', aspectRatio: '3/4', background: 'var(--card)' }}>
              {selected.photo_url ? (
                <img src={selected.photo_url} alt={selected.name ?? ''}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 60 }}>👤</div>
              )}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                padding: '32px 16px 14px', fontSize: 20, fontWeight: 700 }}>
                {selected.name ?? 'Alguém'}{selected.age ? `, ${selected.age}` : ''}
              </div>
              <button onClick={() => setSafetyOpen(true)} aria-label="Denunciar ou bloquear"
                style={{ position: 'absolute', top: 10, right: 50, background: 'rgba(0,0,0,0.5)',
                  border: 'none', borderRadius: '50%', width: 32, height: 32,
                  fontSize: 18, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>⋮</button>
              <button onClick={() => setSelected(null)} aria-label="Fechar"
                style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.5)',
                  border: 'none', borderRadius: '50%', width: 32, height: 32,
                  fontSize: 16, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <div style={{ padding: '16px 16px 20px' }}>
              {!isCheckedIn && (
                <p className="muted" style={{ textAlign: 'center', fontSize: 13, margin: '0 0 12px' }}>
                  {t('need_check_in')}
                </p>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                {REACTION_BUTTONS.map(({ kind, label, meaningKey, color }) => {
                  const isActive = selected.my_reaction === kind;
                  return (
                    <button key={kind} className="btn ghost"
                      disabled={reacting || !isCheckedIn}
                      onClick={() => void sendReaction(kind)}
                      title={t(meaningKey)}
                      style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, padding: '10px 4px',
                        fontSize: 13, border: isActive ? `2px solid ${color}` : '2px solid transparent',
                        background: isActive ? `${color}22` : undefined, color: isActive ? color : undefined,
                        transition: 'all 0.15s ease' }}>
                      <span>{label}</span>
                      <span style={{ fontSize: 10, opacity: 0.75, lineHeight: 1.2 }}>{t(meaningKey)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Safety menu */}
      {selected && safetyOpen && (
        <SafetyMenu
          targetUserId={selected.user_id}
          targetName={selected.name ?? undefined}
          onClose={() => setSafetyOpen(false)}
          onDone={() => {
            const removedId = selected.user_id;
            setSafetyOpen(false);
            setSelected(null);
            setAttendees((list) => list.filter((a) => a.user_id !== removedId));
          }}
        />
      )}

      {/* Grid match celebration */}
      {matched && (
        <div className="match-modal-bg" role="dialog" aria-modal="true">
          <div className="card" style={{ width: '100%', maxWidth: 380, padding: '28px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 60, marginBottom: 8 }}>
              {REACTION_EMOJI[matched.mine]}{matched.theirs ? REACTION_EMOJI[matched.theirs] : ''}
            </div>
            <h2 style={{ margin: '0 0 6px', fontSize: 24 }}>{t('it_s_a_match')}</h2>
            <p className="muted" style={{ marginTop: 0, marginBottom: 4 }}>
              {t('match_with', { name: matched.attendee.name ?? 'alguém' })}
            </p>
            <p style={{ marginTop: 0, marginBottom: 20, fontSize: 14, fontWeight: 600 }}>
              {t(matchIntentKey(matched.mine, matched.theirs), {
                mine: REACTION_EMOJI[matched.mine],
                theirs: matched.theirs ? REACTION_EMOJI[matched.theirs] : '',
              })}
            </p>
            <button className="btn" style={{ marginBottom: 10 }} onClick={() => nav(`/chat/${matched.matchId}`)}>
              {t('go_to_chat')}
            </button>
            <button className="btn ghost" onClick={() => setMatched(null)}>
              Continuar explorando
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
