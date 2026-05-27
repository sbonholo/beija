import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { activeApi as api } from '../lib/api';
import { useUnread } from '../state/UnreadContext';
import { getSocket } from '../lib/socket';

type ReactionType = 'kiss' | 'heart' | 'fire';

const EMOJI: Record<ReactionType, string> = { kiss: '💋', heart: '❤️', fire: '🔥' };

interface ReceivedReaction {
  id: string;
  type: ReactionType;
  eventId: string;
  eventName: string;
  eventEndsAt: number;
  createdAt: number;
  isMatched: boolean;
  matchId: string | null;
  user: {
    id: string;
    nickname: string | null;
    gender: string | null;
    bio: string | null;
    photoUrl: string | null;
  };
}

function timeAgo(t: number) {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'agora';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function Likes() {
  const nav = useNavigate();
  const { clearLikes } = useUnread();
  const [reactions, setReactions] = useState<ReceivedReaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { reactions } = await api.getReceivedReactions();
      setReactions(reactions);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    clearLikes();
    load();

    const sock = getSocket();
    const onReaction = () => load();
    if (sock) sock.on('reaction:incoming', onReaction);
    return () => { if (sock) sock.off('reaction:incoming', onReaction); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const matched = reactions.filter((r) => r.isMatched);
  const pending = reactions.filter((r) => !r.isMatched);

  return (
    <div className="screen">
      <div className="header">
        <h2 style={{ fontFamily: 'Poppins, system-ui, sans-serif', margin: 0 }}>Curtidas 💌</h2>
      </div>

      {loading && (
        <div className="empty">
          <div className="big" style={{ animation: 'pulse 1.2s ease-in-out infinite' }}>💌</div>
          <p>Carregando...</p>
        </div>
      )}

      {!loading && reactions.length === 0 && (
        <div className="empty" style={{ paddingTop: 60 }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>💌</div>
          <h3 style={{ fontFamily: 'Poppins, system-ui, sans-serif', margin: '0 0 8px', fontSize: 22 }}>
            Nenhuma curtida ainda
          </h3>
          <p className="muted" style={{ margin: '0 0 24px', lineHeight: 1.5 }}>
            Entre num rolê e chame atenção — alguém vai te mandar um beijo 😘
          </p>
          <button className="btn" style={{ maxWidth: 240 }} onClick={() => nav('/events')}>
            Ver eventos 🎶
          </button>
        </div>
      )}

      {!loading && matched.length > 0 && (
        <>
          <p className="likes-section-label">✨ Já deu match</p>
          <div className="likes-grid">
            {matched.map((r) => (
              <LikeCard key={r.id} reaction={r} onPress={() => r.matchId && nav(`/chat/${r.matchId}`)} />
            ))}
          </div>
        </>
      )}

      {!loading && pending.length > 0 && (
        <>
          <p className="likes-section-label" style={{ marginTop: matched.length > 0 ? 24 : 0 }}>
            💌 Aguardando sua reação
          </p>
          <div className="likes-grid">
            {pending.map((r) => (
              <LikeCard key={r.id} reaction={r} onPress={() => nav(`/events/${r.eventId}`)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LikeCard({ reaction: r, onPress }: { reaction: ReceivedReaction; onPress: () => void }) {
  return (
    <button className="like-card" onClick={onPress}>
      <div
        className="like-card-photo"
        style={r.user.photoUrl ? { backgroundImage: `url("${r.user.photoUrl}")` } : undefined}
      >
        <span className="like-card-emoji">{EMOJI[r.type]}</span>
        {r.isMatched && <span className="like-card-match-badge">✨</span>}
      </div>
      <div className="like-card-info">
        <strong className="like-card-name">{r.user.nickname || 'Alguém'}</strong>
        <span className="like-card-time muted">{timeAgo(r.createdAt)}</span>
      </div>
      <span className="muted like-card-event">{r.eventName}</span>
    </button>
  );
}
