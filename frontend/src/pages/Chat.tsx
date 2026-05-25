import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { activeApi as api } from '../lib/api';
import { useAuth } from '../state/AuthContext';
import type { ChatMessage, MatchSummary } from '../types';
import { getSocket } from '../lib/socket';

function messageTime(ts: number): number {
  return Number.isFinite(ts) && ts > 0 ? ts : Date.now();
}

function formatHM(ts: number): string {
  return new Date(messageTime(ts)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function startOfDay(ts: number): number {
  const d = new Date(messageTime(ts));
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function daySeparatorLabel(ts: number): string {
  const day = startOfDay(ts);
  const today = startOfDay(Date.now());
  const dayMs = 24 * 60 * 60 * 1000;
  if (day === today) return 'Hoje';
  if (day === today - dayMs) return 'Ontem';
  return new Date(day).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function Chat() {
  const { matchId } = useParams<{ matchId: string }>();
  const nav = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  // Seed match header from navigation state — avoids a round-trip when coming from Matches page
  const [match, setMatch] = useState<MatchSummary | null>(
    (location.state as { match?: MatchSummary } | null)?.match ?? null
  );
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    (async () => {
      const [{ messages: msgs }, { match: m }] = await Promise.all([
        api.listMessages(matchId),
        api.getMatch(matchId),
      ]);
      if (cancelled) return;
      setMessages(msgs);
      if (m) setMatch(m);
    })();

    const sock = getSocket();
    const onMsg = (m: ChatMessage & { matchId?: string }) => {
      if (m.matchId && m.matchId !== matchId) return;
      setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
    };
    sock?.on('message:new', onMsg);
    return () => {
      cancelled = true;
      sock?.off('message:new', onMsg);
    };
  }, [matchId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!matchId || !text.trim() || sending) return;
    setSending(true);
    const draft = text.trim();
    setText('');
    try {
      const { message } = await api.sendMessage(matchId, draft);
      setMessages((cur) => (cur.some((x) => x.id === message.id) ? cur : [...cur, message]));
    } catch {
      setText(draft);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="screen" style={{ paddingBottom: 0, height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="header">
        <button className="chip" onClick={() => nav(-1)}>←</button>
        <div className="row center" style={{ gap: 10 }}>
          <div
            className="avatar matched"
            style={{ width: 36, height: 36, backgroundImage: match?.otherUser?.photoUrl ? `url("${match.otherUser.photoUrl}")` : undefined }}
          />
          <div>
            <div style={{ fontWeight: 700 }}>{match?.otherUser?.nickname || 'Match'}</div>
            <div className="muted" style={{ fontSize: 11 }}>{match?.eventName || 'rolê'}</div>
          </div>
        </div>
        <div style={{ width: 40 }} />
      </div>

      <div ref={listRef} className="chat-list">
        {messages.length === 0 && (
          <p className="muted" style={{ textAlign: 'center', marginTop: 'auto', marginBottom: 'auto' }}>
            É match! Manda a primeira 💋
          </p>
        )}
        {messages.map((m, i) => {
          const ts = messageTime(m.createdAt);
          const prevTs = i > 0 ? messageTime(messages[i - 1].createdAt) : 0;
          const showDay = i === 0 || startOfDay(prevTs) !== startOfDay(ts);
          const mine = m.fromUserId === user?.id;
          return (
            <div key={m.id} style={{ display: 'contents' }}>
              {showDay && (
                <div className="chat-day-sep">{daySeparatorLabel(ts)}</div>
              )}
              <div className={`chat-message ${mine ? 'mine' : 'theirs'}`}>
                {m.text}
              </div>
              <div className={`chat-time ${mine ? 'mine' : 'theirs'}`}>{formatHM(ts)}</div>
            </div>
          );
        })}
      </div>

      <form onSubmit={send} className="chat-input">
        <input
          placeholder="Mensagem"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
        />
        <button className="btn" disabled={!text.trim() || sending}>Enviar</button>
      </form>
    </div>
  );
}
