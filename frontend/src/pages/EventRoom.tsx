import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../state/AuthContext';
import type { PersonAtEvent, ReactionType, EventItem, User } from '../types';
import { getSocket } from '../lib/socket';
import { PersonCard } from '../components/PersonCard';
import { ReactionBar } from '../components/ReactionBar';
import { MatchModal } from '../components/MatchModal';
import { useToast } from '../components/Toast';
import { hapticSuccess } from '../platform/haptics';

const ICON: Record<ReactionType, string> = { kiss: '💋', heart: '❤️', fire: '🔥' };
const LABEL: Record<ReactionType, string> = { kiss: 'beijo', heart: 'curtida', fire: 'fogo' };

export function EventRoom() {
  const { id } = useParams<{ id: string }>();
  const eventId = id!;
  const nav = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const [event, setEvent] = useState<EventItem | null>(null);
  const [people, setPeople] = useState<PersonAtEvent[]>([]);
  const [selected, setSelected] = useState<PersonAtEvent | null>(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [matchModal, setMatchModal] = useState<{ matchId: string; other: User } | null>(null);

  const refreshPeople = useCallback(async () => {
    const { people } = await api.listPeople(eventId);
    setPeople(people);
    setSelected((prev) => (prev ? people.find((p: PersonAtEvent) => p.id === prev.id) || null : null));
  }, [eventId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ event }] = await Promise.all([api.getEvent(eventId)]);
        if (cancelled) return;
        setEvent(event);
        await api.checkIn(eventId);
        if (cancelled) return;
        setCheckedIn(true);
        await refreshPeople();
      } catch {
        nav('/events', { replace: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const sock = getSocket();
    sock.emit('event:join', eventId);

    const onReaction = (payload: { fromUser: User; type: ReactionType }) => {
      toast({ kind: payload.type, text: `${payload.fromUser.nickname || 'Alguém'} mandou um ${LABEL[payload.type]} ${ICON[payload.type]}` });
      refreshPeople();
    };
    const onMatch = (payload: { matchId: string; otherUser: User }) => {
      hapticSuccess();
      setMatchModal({ matchId: payload.matchId, other: payload.otherUser });
      refreshPeople();
    };

    sock.on('reaction:incoming', onReaction);
    sock.on('match:new', onMatch);

    return () => {
      cancelled = true;
      sock.emit('event:leave', eventId);
      sock.off('reaction:incoming', onReaction);
      sock.off('match:new', onMatch);
    };
  }, [eventId, nav, refreshPeople, toast]);

  async function checkOut() {
    try { await api.checkOut(eventId); } catch { /* noop */ }
    nav('/events');
  }

  async function react(type: ReactionType) {
    if (!selected) return;
    const targetId = selected.id;
    try {
      const res = await api.sendReaction(targetId, eventId, type);
      toast({ kind: type, text: `Você mandou um ${LABEL[type]} ${ICON[type]}` });
      if (res.match) {
        // match modal will arrive via socket too, but trigger immediately for sender
        const other = people.find((p) => p.id === targetId);
        if (other) setMatchModal({ matchId: res.match.id, other });
      }
      await refreshPeople();
    } catch {
      toast({ kind: 'info', text: 'Não rolou enviar agora' });
    }
  }

  if (loading) {
    return <div className="screen"><p className="muted">Entrando no rolê...</p></div>;
  }

  return (
    <div className="screen">
      <div className="header">
        <button onClick={checkOut} className="chip">← Sair</button>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700 }}>{event?.name}</div>
          <div className="muted" style={{ fontSize: 12 }}>{event?.venue}</div>
        </div>
      </div>

      {checkedIn && (
        <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 12 }}>
          {people.length} {people.length === 1 ? 'pessoa' : 'pessoas'} aqui agora · toque pra reagir
        </p>
      )}

      {people.length === 0 ? (
        <div className="empty">
          <div className="big">👀</div>
          <p>Ninguém compatível por enquanto. Chama a galera!</p>
        </div>
      ) : (
        <div className="people-grid">
          {people.map((p) => (
            <PersonCard
              key={p.id}
              person={p}
              selected={selected?.id === p.id}
              onSelect={() => setSelected(selected?.id === p.id ? null : p)}
            />
          ))}
        </div>
      )}

      {selected && (
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(env(safe-area-inset-bottom) + 8px)',
            left: 0, right: 0,
            zIndex: 20,
            display: 'flex', justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div className="card" style={{ pointerEvents: 'auto', minWidth: 280, textAlign: 'center' }}>
            <div className="row center" style={{ justifyContent: 'center', gap: 10 }}>
              <div
                className={`avatar ${selected.matched ? 'matched' : ''}`}
                style={{ width: 40, height: 40, backgroundImage: selected.photoUrl ? `url("${selected.photoUrl}")` : undefined }}
              />
              <strong>{selected.nickname || 'Alguém'}</strong>
            </div>
            <ReactionBar current={selected.sentReaction} onSend={react} />
          </div>
        </div>
      )}

      {matchModal && user && (
        <MatchModal
          me={user}
          other={matchModal.other}
          matchId={matchModal.matchId}
          onClose={() => setMatchModal(null)}
        />
      )}
    </div>
  );
}
