import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../state/AuthContext';
import type { ChatMessage, MatchSummary } from '../types';
import { getSocket } from '../lib/socket';

export function Chat() {
  const { matchId } = useParams<{ matchId: string }>();
  const nav = useNavigate();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [match, setMatch] = useState<MatchSummary | null>(null);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    (async () => {
      const [{ messages }, { matches }] = await Promise.all([
        api.listMessages(matchId),
        api.listMatches(),
      ]);
      if (cancelled) return;
      setMessages(messages);
      setMatch(matches.find((m: MatchSummary) => m.id === matchId) || null);
    })();

    const sock = getSocket();
    const onMsg = (m: ChatMessage & { matchId?: string }) => {
      if (m.matchId && m.matchId !== matchId) return;
      setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
    };
    sock.on('message:new', onMsg);
    return () => {
      cancelled = true;
      sock.off('message:new', onMsg);
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
      await api.sendMessage(matchId, draft);
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
        {messages.map((m) => (
          <div key={m.id} className={`chat-message ${m.fromUserId === user?.id ? 'mine' : 'theirs'}`}>
            {m.text}
          </div>
        ))}
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
