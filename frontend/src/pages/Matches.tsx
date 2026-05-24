import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { activeApi as api } from '../lib/api';
import type { MatchSummary } from '../types';
import { BottomNav } from '../components/BottomNav';
import { getSocket } from '../lib/socket';

function timeAgo(t: number) {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'agora';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function Matches() {
  const nav = useNavigate();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { matches } = await api.listMatches();
        if (!cancelled) setMatches(matches);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const onMatchOrMsg = () => load();
    let sock: ReturnType<typeof getSocket> | null = null;
    try {
      sock = getSocket();
      sock.on('match:new', onMatchOrMsg);
      sock.on('message:new', onMatchOrMsg);
    } catch (err) {
      console.warn('socket connection failed:', err);
    }
    return () => {
      cancelled = true;
      if (sock) {
        try {
          sock.off('match:new', onMatchOrMsg);
          sock.off('message:new', onMatchOrMsg);
        } catch {
          /* socket already torn down */
        }
      }
    };
  }, []);

  return (
    <div className="screen">
      <div className="header"><h2>Seus matches 💋</h2></div>

      {loading && <p className="muted">Carregando...</p>}
      {!loading && matches.length === 0 && (
        <div className="empty">
          <div className="big">💋</div>
          <p>Nenhum match ainda. Vai pra um rolê!</p>
          <button className="btn" style={{ marginTop: 16, maxWidth: 240 }} onClick={() => nav('/events')}>
            Ver eventos
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {matches.map((m) => (
          <button
            key={m.id}
            className="card row center"
            style={{ textAlign: 'left', gap: 12, width: '100%' }}
            onClick={() => nav(`/chat/${m.id}`)}
          >
            <div
              className="avatar matched"
              style={m.otherUser?.photoUrl ? { backgroundImage: `url("${m.otherUser.photoUrl}")` } : undefined}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong>{m.otherUser?.nickname || 'Alguém'}</strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  {timeAgo(m.lastMessage?.createdAt ?? m.createdAt)}
                </span>
              </div>
              <div className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {m.lastMessage?.text || `Match em ${m.eventName || 'um rolê'} ✨`}
              </div>
            </div>
          </button>
        ))}
      </div>

      <BottomNav />
    </div>
  );
}
