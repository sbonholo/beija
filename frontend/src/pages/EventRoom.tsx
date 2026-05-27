import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { activeApi as api, errorMessage, isMockMode } from '../lib/api';
import { useAuth } from '../state/AuthContext';
import type { PersonAtEvent, ReactionType, EventItem, User } from '../types';
import { getSocket } from '../lib/socket';
import { PersonCard } from '../components/PersonCard';
import { PersonSheet } from '../components/PersonSheet';
import { MatchModal } from '../components/MatchModal';
import { useToast } from '../components/Toast';
import { hapticSuccess } from '../platform/haptics';
import { getLastReaction, setLastReaction } from '../lib/lastReaction';

const ICON: Record<ReactionType, string> = { kiss: '💋', heart: '❤️', fire: '🔥' };
const LABEL: Record<ReactionType, string> = { kiss: 'beijo', heart: 'curtida', fire: 'fogo' };

export function EventRoom() {
  const { id } = useParams<{ id: string }>();
  const eventId = id!;
  const nav = useNavigate();
  const { user, signOut } = useAuth();
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
  const [lastReaction, setLastReactionState] = useState<ReactionType>(() => getLastReaction());

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
      } catch (err) {
        if (!cancelled) {
          const em = errorMessage(err);
          if (em.kind === 'auth') { signOut(); nav(isMockMode ? '/' : '/login', { replace: true }); return; }
          setLoadError(em.text);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const sock = getSocket();

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

    const onCheckinUpdate = () => { refreshPeople(); };

    if (sock) {
      sock.emit('event:join', eventId);
      sock.on('reaction:incoming', onReaction);
      sock.on('match:new', onMatch);
      sock.on('checkin:update', onCheckinUpdate);
    }

    return () => {
      cancelled = true;
      if (sock) {
        sock.emit('event:leave', eventId);
        sock.off('reaction:incoming', onReaction);
        sock.off('match:new', onMatch);
        sock.off('checkin:update', onCheckinUpdate);
      }
    };
  }, [eventId, nav, refreshPeople, toast]);

  async function checkOut() {
    try { await api.checkOut(eventId); } catch { /* noop */ }
    nav('/events');
  }

  async function blockPerson() {
    if (!selected) return;
    const targetId = selected.id;
    setSelected(null);
    try {
      await api.blockUser(targetId);
      setPeople((prev) => prev.filter((p) => p.id !== targetId));
      toast({ kind: 'info', text: 'Pessoa bloqueada' });
    } catch {
      toast({ kind: 'info', text: 'Não rolou bloquear' });
    }
  }

  async function reportPerson(reason: string) {
    if (!selected) return;
    const targetId = selected.id;
    setSelected(null);
    try {
      await api.reportUser(targetId, reason);
      toast({ kind: 'info', text: 'Denúncia enviada. Obrigado!' });
    } catch {
      toast({ kind: 'info', text: 'Não rolou enviar a denúncia' });
    }
  }

  function goToNext(currentId: string) {
    const idx = people.findIndex((p) => p.id === currentId);
    const next = idx >= 0 ? people[idx + 1] : null;
    if (next) {
      setSelected(next);
    } else {
      setSelected(null);
      toast({ kind: 'info', text: 'Você viu todo mundo aqui! ✨' });
    }
  }

  async function swipeRight() {
    if (!selected) return;
    const targetId = selected.id;
    const type = lastReaction;
    // Optimistic UX: persist the reaction choice and advance immediately
    setLastReaction(type);
    setLastReactionState(type);
    hapticSuccess();
    goToNext(targetId);
    try {
      const res = await api.sendReaction(targetId, eventId, type);
      if (res.match) {
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
    } catch (err: any) {
      const errorMap: Record<string, string> = {
        not_at_event: 'Você ou a outra pessoa saiu do evento',
        blocked: 'Não é possível reagir a esta pessoa',
        user_not_found: 'Usuário não encontrado',
        rate_limited: 'Muitas reações seguidas. Aguarde um momento.',
      };
      const code = err?.code ?? '';
      toast({ kind: 'info', text: errorMap[code] || 'Não rolou enviar.' });
    }
  }

  function swipeLeft() {
    if (!selected) return;
    goToNext(selected.id);
  }

  async function react(type: ReactionType) {
    if (!selected) return;
    const targetId = selected.id;
    if (selected.sentReaction === type) {
      try {
        await api.removeReaction(targetId, eventId);
        await refreshPeople();
      } catch {
        toast({ kind: 'info', text: 'Não rolou remover a reação' });
      }
      return;
    }
    try {
      const res = await api.sendReaction(targetId, eventId, type);
      setLastReaction(type);
      setLastReactionState(type);
      toast({ kind: type, text: `Você mandou um ${LABEL[type]} ${ICON[type]}` });
      // Close the sheet after 1s only on success so the user sees the feedback
      setTimeout(() => setSelected(null), 1000);
      if (res.match) {
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
    } catch (err: any) {
      const errorMap: Record<string, string> = {
        not_at_event: 'Você ou a outra pessoa saiu do evento',
        blocked: 'Não é possível reagir a esta pessoa',
        user_not_found: 'Usuário não encontrado',
        rate_limited: 'Muitas reações seguidas. Aguarde um momento.',
      };
      const code = err?.code ?? '';
      toast({ kind: 'info', text: errorMap[code] || 'Não rolou enviar. Tente de novo.' });
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
          key={selected.id}
          person={selected}
          onClose={() => setSelected(null)}
          onReact={react}
          onBlock={blockPerson}
          onReport={reportPerson}
          onSwipeRight={swipeRight}
          onSwipeLeft={swipeLeft}
          lastReaction={lastReaction}
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
