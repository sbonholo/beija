import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { activeApi as api } from '../lib/api';
import { useUnread } from '../state/UnreadContext';
import type { MatchSummary } from '../types';
import { getSocket } from '../lib/socket';

export function Matches() {
  const nav = useNavigate();
  const { clearMatches } = useUnread();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    clearMatches();
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

    const sock = getSocket();
    const refresh = () => { if (!cancelled) load(); };
    if (sock) sock.on('match:new', refresh);
    return () => {
      cancelled = true;
      if (sock) sock.off('match:new', refresh);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="screen">
      <div className="header">
        <h2 style={{ fontFamily: 'Poppins, system-ui, sans-serif', margin: 0 }}>Matches ✨</h2>
      </div>

      {loading && (
        <div className="empty">
          <div className="big" style={{ animation: 'pulse 1.2s ease-in-out infinite' }}>✨</div>
          <p>Carregando...</p>
        </div>
      )}

      {!loading && matches.length === 0 && (
        <div className="empty" style={{ paddingTop: 60 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>✨</div>
          <h3 style={{ fontFamily: 'Poppins, system-ui, sans-serif', margin: '0 0 8px', fontSize: 22 }}>
            Nenhum match ainda
          </h3>
          <p className="muted" style={{ margin: '0 0 24px', lineHeight: 1.5 }}>
            Entre em um rolê e mande um beijo pra alguém 😘
          </p>
          <button className="btn" style={{ maxWidth: 240 }} onClick={() => nav('/events')}>
            Ver eventos 🎶
          </button>
        </div>
      )}

      {matches.length > 0 && (
        <div className="matches-grid">
          {matches.map((m) => (
            <button
              key={m.id}
              className="match-tile"
              onClick={() => nav(`/chat/${m.id}`, { state: { match: m } })}
            >
              <div
                className="match-tile-photo"
                style={m.otherUser?.photoUrl ? { backgroundImage: `url("${m.otherUser.photoUrl}")` } : undefined}
              >
                {!m.lastMessage && <span className="match-tile-new">novo</span>}
              </div>
              <span className="match-tile-name">{m.otherUser?.nickname || 'Alguém'}</span>
              <span className="match-tile-event muted">{m.eventName || ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
