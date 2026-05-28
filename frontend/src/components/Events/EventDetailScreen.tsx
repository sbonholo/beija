import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import type { EventAttendee, NearbyEvent, ReactionKind } from '../../lib/supabase';
import { useToast } from '../Toast';

const REACTION_BUTTONS: { kind: ReactionKind; label: string; color: string }[] = [
  { kind: 'kiss',  label: '💋 Beijo',  color: 'var(--kiss)'  },
  { kind: 'heart', label: '❤️ Curtir', color: 'var(--heart)' },
  { kind: 'fire',  label: '🔥 Fogo',   color: 'var(--fire)'  },
];

const REACTION_EMOJI: Record<ReactionKind, string> = {
  kiss:  '💋',
  heart: '❤️',
  fire:  '🔥',
};

function formatEventTime(event: NearbyEvent): string {
  const start = new Date(event.starts_at);
  const now   = new Date();
  const time  = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const isOn =
    start <= now && (event.ends_at == null || new Date(event.ends_at) > now);
  if (isOn) return 'Acontecendo agora 🔴';

  const date = start.toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short' });
  return `${date} às ${time}`;
}

const CATEGORY_LABEL: Record<string, string> = {
  festival: '🎪 Festival', concert: '🎵 Show', bar: '🍺 Bar',
  nightclub: '🪩 Balada',  show: '🎭 Espetáculo', other: '📍 Evento',
};

interface MatchState { matchId: string; attendee: EventAttendee }

export function EventDetailScreen() {
  const { id: eventId } = useParams<{ id: string }>();
  const { t } = useTranslation('events');
  const nav   = useNavigate();
  const toast = useToast();

  const [event,    setEvent]    = useState<NearbyEvent | null>(null);
  const [attendees,setAttendees]= useState<EventAttendee[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [me,       setMe]       = useState<string | null>(null);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [checkingIn,  setCheckingIn]  = useState(false);
  const [selected, setSelected] = useState<EventAttendee | null>(null);
  const [reacting, setReacting] = useState(false);
  const [matched,  setMatched]  = useState<MatchState | null>(null);

  const loadData = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);

    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id ?? null;
    setMe(userId);

    // Load event, attendee count, and check-in status in parallel
    const [evResult, countResult, checkInResult, attResult] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).maybeSingle(),
      supabase.from('check_ins').select('*', { count: 'exact', head: true }).eq('event_id', eventId),
      userId
        ? supabase.from('check_ins').select('id').eq('event_id', eventId).eq('user_id', userId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.rpc('get_event_attendees', { p_event_id: eventId }),
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

    if (attResult.error) {
      toast({ kind: 'info', text: t('error_loading') });
    } else {
      setAttendees((attResult.data ?? []) as unknown as EventAttendee[]);
    }

    setLoading(false);
  }, [eventId, t, toast]);

  useEffect(() => { void loadData(); }, [loadData]);

  async function toggleCheckIn() {
    if (checkingIn || !me || !eventId) return;
    setCheckingIn(true);

    if (isCheckedIn) {
      await supabase.from('check_ins')
        .delete().eq('event_id', eventId).eq('user_id', me);
      setIsCheckedIn(false);
      setEvent((ev) => ev ? { ...ev, attendee_count: ev.attendee_count - 1, is_checked_in: false } : ev);
    } else {
      const { error } = await supabase.from('check_ins')
        .insert({ event_id: eventId, user_id: me });
      if (error) {
        toast({ kind: 'info', text: t('error_checkin') });
      } else {
        setIsCheckedIn(true);
        setEvent((ev) => ev ? { ...ev, attendee_count: ev.attendee_count + 1, is_checked_in: true } : ev);
      }
    }
    setCheckingIn(false);
  }

  async function sendReaction(kind: ReactionKind) {
    if (!selected || reacting || !me || !eventId) return;

    if (!isCheckedIn) {
      toast({ kind: 'info', text: t('need_check_in') });
      return;
    }

    setReacting(true);

    // Optimistic update
    const prev = selected.my_reaction;
    const updatedAttendee = { ...selected, my_reaction: kind };
    setSelected(updatedAttendee);
    setAttendees((list) =>
      list.map((a) => (a.user_id === selected.user_id ? updatedAttendee : a)),
    );

    const { error } = await supabase
      .from('event_reactions')
      .upsert(
        { sender_id: me, receiver_id: selected.user_id, event_id: eventId, kind },
        { onConflict: 'sender_id,receiver_id,event_id' },
      );

    if (error) {
      // Rollback
      const rolledBack = { ...selected, my_reaction: prev };
      setSelected(rolledBack);
      setAttendees((list) =>
        list.map((a) => (a.user_id === selected.user_id ? rolledBack : a)),
      );
      toast({ kind: 'info', text: t('error_reaction') });
    } else if (kind === 'kiss') {
      // Check for mutual match (user1_id < user2_id constraint)
      const [u1, u2] = [me, selected.user_id].sort();
      const { data: matchRow } = await supabase
        .from('matches')
        .select('id')
        .eq('user1_id', u1)
        .eq('user2_id', u2)
        .maybeSingle();
      if (matchRow) {
        setMatched({ matchId: matchRow.id, attendee: updatedAttendee });
        setSelected(null);
      }
    }

    setReacting(false);
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

  return (
    <div className="screen" style={{ paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          onClick={() => nav(-1)}
          aria-label="Voltar"
          style={{ fontSize: 22, padding: '4px 10px', color: 'var(--text)', flexShrink: 0 }}
        >
          ←
        </button>
        <h2 style={{ margin: 0, fontSize: 17, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {event.name}
        </h2>
      </div>

      {/* Event info card */}
      <div className="card" style={{ padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
          {CATEGORY_LABEL[event.category]}
          {event.venue && ` · ${event.venue}`}
          {event.city && `, ${event.city}`}
        </div>
        <div style={{ fontSize: 13, color: event.is_checked_in ? '#4ade80' : 'var(--muted)', marginBottom: 14 }}>
          {formatEventTime(event)}
        </div>

        {/* Check-in button */}
        <button
          className={isCheckedIn ? 'btn' : 'btn ghost'}
          style={{
            width: '100%',
            background: isCheckedIn ? 'var(--pink)' : undefined,
            fontSize: 15,
          }}
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
                  : t(event.attendee_count === 1 ? 'people_here' : 'people_here_plural', {
                      count: event.attendee_count,
                    })
              }`}
        </button>
      </div>

      {/* Attendees section */}
      <h3 style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 10px 2px' }}>
        {t('attendees_title')}
      </h3>

      {attendees.length === 0 ? (
        <div className="empty" style={{ marginTop: 20 }}>
          <div style={{ fontSize: 40 }}>🎵</div>
          <p className="muted" style={{ marginBottom: 4 }}>{t('no_attendees')}</p>
          <p className="muted" style={{ fontSize: 13 }}>{t('no_attendees_hint')}</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
          {attendees.map((att) => (
            <button
              key={att.user_id}
              onClick={() => setSelected(att)}
              style={{
                position: 'relative',
                aspectRatio: '3/4',
                borderRadius: 10,
                overflow: 'hidden',
                background: 'var(--card)',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
              }}
            >
              {att.photo_url ? (
                <img
                  src={att.photo_url}
                  alt={att.name ?? 'Foto'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  loading="lazy"
                />
              ) : (
                <div style={{
                  width: '100%', height: '100%',
                  background: 'linear-gradient(135deg, var(--card), var(--bg-elev))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 32,
                }}>
                  👤
                </div>
              )}

              {/* Name overlay */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.75))',
                padding: '16px 6px 5px',
                fontSize: 11, fontWeight: 600, textAlign: 'left', color: '#fff',
              }}>
                {att.name ?? '?'}{att.age ? `, ${att.age}` : ''}
              </div>

              {/* Reaction badge */}
              {att.my_reaction && (
                <div style={{
                  position: 'absolute', top: 4, right: 5,
                  fontSize: 18, lineHeight: 1,
                  filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.6))',
                }}>
                  {REACTION_EMOJI[att.my_reaction as ReactionKind]}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Attendee reaction modal */}
      {selected && (
        <div
          className="match-modal-bg"
          role="dialog"
          aria-modal="true"
          onClick={() => !reacting && setSelected(null)}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 380, padding: 0, overflow: 'hidden' }}
          >
            {/* Photo */}
            <div style={{ position: 'relative', aspectRatio: '3/4', background: 'var(--card)' }}>
              {selected.photo_url ? (
                <img
                  src={selected.photo_url}
                  alt={selected.name ?? ''}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{
                  width: '100%', height: '100%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 60,
                }}>👤</div>
              )}

              {/* Name overlay on photo */}
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                padding: '32px 16px 14px',
                fontSize: 20, fontWeight: 700,
              }}>
                {selected.name ?? 'Alguém'}{selected.age ? `, ${selected.age}` : ''}
              </div>

              {/* Close */}
              <button
                onClick={() => setSelected(null)}
                aria-label="Fechar"
                style={{
                  position: 'absolute', top: 10, right: 10,
                  background: 'rgba(0,0,0,0.5)', border: 'none',
                  borderRadius: '50%', width: 32, height: 32,
                  fontSize: 16, color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>

            {/* Reaction buttons */}
            <div style={{ padding: '16px 16px 20px' }}>
              {!isCheckedIn && (
                <p className="muted" style={{ textAlign: 'center', fontSize: 13, margin: '0 0 12px' }}>
                  {t('need_check_in')}
                </p>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                {REACTION_BUTTONS.map(({ kind, label, color }) => {
                  const isActive = selected.my_reaction === kind;
                  return (
                    <button
                      key={kind}
                      className="btn ghost"
                      disabled={reacting || !isCheckedIn}
                      onClick={() => void sendReaction(kind)}
                      style={{
                        flex: 1,
                        padding: '10px 4px',
                        fontSize: 13,
                        border: isActive ? `2px solid ${color}` : '2px solid transparent',
                        background: isActive ? `${color}22` : undefined,
                        color: isActive ? color : undefined,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Match celebration overlay */}
      {matched && (
        <div
          className="match-modal-bg"
          role="dialog"
          aria-modal="true"
        >
          <div className="card" style={{ width: '100%', maxWidth: 380, padding: '28px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 60, marginBottom: 8 }}>💋</div>
            <h2 style={{ margin: '0 0 6px', fontSize: 24 }}>{t('it_s_a_match')}</h2>
            <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>
              {t('match_with', { name: matched.attendee.name ?? 'alguém' })}
            </p>
            <button
              className="btn"
              style={{ marginBottom: 10 }}
              onClick={() => nav(`/chat/${matched.matchId}`)}
            >
              {t('go_to_chat')}
            </button>
            <button
              className="btn ghost"
              onClick={() => setMatched(null)}
            >
              Continuar explorando
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
