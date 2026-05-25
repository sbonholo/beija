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
    const sock = getSocket();
    if (sock) {
      sock.on('match:new', onMatchOrMsg);
      sock.on('message:new', onMatchOrMsg);
    }

    return () => {
      cancelled = true;
      if (sock) {
        sock.off('match:new', onMatchOrMsg);
        sock.off('message:new', onMatchOrMsg);
      }
    };
  }, []);

  return (
    <div className="screen">
      <div className="header">
        <h2 style={{ fontFamily: 'Poppins, system-ui, sans-serif' }}>Seus matches 💋</h2>
      </div>

      {loading && (
        <div className="empty">
          <div className="big" style={{ animation: 'pulse 1.2s ease-in-out infinite' }}>💋</div>
          <p>Carregando...</p>
        </div>
      )}

      {!loading && matches.length === 0 && (
        <div className="empty" style={{ paddingTop: 60 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>💋</div>
          <h3 style={{ fontFamily: 'Poppins, system-ui, sans-serif', margin: '0 0 8px', fontSize: 22 }}>
            Nenhum match ainda
          </h3>
          <p className="muted" style={{ margin: '0 0 24px', lineHeight: 1.5 }}>
            Entre em um rolê, reaja às pessoas e espere o beijo chegar 😘
          </p>
          <button className="btn" style={{ maxWidth: 240 }} onClick={() => nav('/events')}>
            Ver eventos 🎶
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {matches.map((m, i) => (
          <button
            key={m.id}
            className="match-row"
            style={{ animationDelay: `${i * 50}ms` }}
            onClick={() => nav(`/chat/${m.id}`, { state: { match: m } })}
          >
            <div className="match-avatar-wrap">
              <div
                className="avatar matched"
                style={m.otherUser?.photoUrl ? { backgroundImage: `url("${m.otherUser.photoUrl}")` } : undefined}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                <strong style={{ fontSize: 16, fontFamily: 'Poppins, system-ui, sans-serif' }}>
                  {m.otherUser?.nickname || 'Alguém'}
                </strong>
                <span className="muted" style={{ fontSize: 11, flexShrink: 0 }}>
                  {timeAgo(m.lastMessage?.createdAt ?? m.createdAt)}
                </span>
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {m.lastMessage?.text || `Match em ${m.eventName || 'um rolê'} ✨`}
              </div>
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 18, paddingLeft: 4 }}>›</div>
          </button>
        ))}
      </div>

      <BottomNav />
    </div>
  );
}
