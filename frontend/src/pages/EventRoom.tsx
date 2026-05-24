import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { activeApi as api } from '../lib/api';
import { useAuth } from '../state/AuthContext';
import type { PersonAtEvent, ReactionType, EventItem, User } from '../types';
import { getSocket } from '../lib/socket';
import { PersonCard } from '../components/PersonCard';
import { PersonSheet } from '../components/PersonSheet';
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
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [matchModal, setMatchModal] = useState<{
    matchId: string;
    other: User;
    myReaction: ReactionType | null;
    theirReaction: ReactionType | null;
  } | null>(null);

  const refreshPeople = useCallback(async () => {
    const { people } = await api.listPeople(eventId);
    setPeople(people);
    setSelected((prev) => (prev ? people.find((p: PersonAtEvent) => p.id === prev.id) || null : null));
  }, [eventId]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const { event } = await api.getEvent(eventId);
      setEvent(event);
      await refreshPeople();
    } catch {
      /* keep current data on transient refresh failure */
    } finally {
      setRefreshing(false);
    }
  }, [eventId, refreshPeople]);

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
        if (!cancelled) setLoadError('Não foi possível carregar este rolê.');
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
    const onMatch = (payload: {
      matchId: string;
      otherUser: User;
      myReaction?: ReactionType;
      theirReaction?: ReactionType;
    }) => {
      hapticSuccess();
      setMatchModal({
        matchId: payload.matchId,
        other: payload.otherUser,
        myReaction: payload.myReaction ?? null,
        theirReaction: payload.theirReaction ?? null,
      });
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
        if (other) {
          hapticSuccess();
          setMatchModal({
            matchId: res.match.id,
            other,
            myReaction: (res.match as { myReaction?: ReactionType }).myReaction ?? type,
            theirReaction: (res.match as { theirReaction?: ReactionType }).theirReaction ?? other.receivedReaction ?? null,
          });
        }
      }
      await refreshPeople();
    } catch {
      toast({ kind: 'info', text: 'Não rolou enviar agora' });
    }
  }

  if (loading) {
    return <div className="screen"><p className="muted">Entrando no rolê...</p></div>;
  }

  if (loadError) {
    return (
      <div className="screen" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ margin: 'auto 0' }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>😕</div>
          <h2 style={{ margin: '0 0 8px' }}>Ops, algo deu errado</h2>
          <p className="muted" style={{ marginTop: 0 }}>{loadError}</p>
          <button
            className="btn"
            style={{ marginTop: 18, maxWidth: 240 }}
            onClick={() => nav('/events')}
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="header">
        <button onClick={checkOut} className="chip">← Sair</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700 }}>{event?.name}</div>
            <div className="muted" style={{ fontSize: 12 }}>{event?.venue}</div>
          </div>
          <button
            type="button"
            className="chip"
            aria-label="Atualizar"
            disabled={refreshing}
            onClick={refreshAll}
            style={{ minWidth: 40, justifyContent: 'center' }}
          >
            {refreshing ? '…' : '↻'}
          </button>
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
        <PersonSheet
          person={selected}
          onClose={() => setSelected(null)}
          onReact={react}
        />
      )}

      {matchModal && user && (
        <MatchModal
          me={user}
          other={matchModal.other}
          matchId={matchModal.matchId}
          myReaction={matchModal.myReaction}
          theirReaction={matchModal.theirReaction}
          onClose={() => setMatchModal(null)}
        />
      )}
    </div>
  );
}
