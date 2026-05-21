import type { User } from '../types';
import { useNavigate } from 'react-router-dom';

export function MatchModal({
  me,
  other,
  matchId,
  onClose,
}: {
  me: User;
  other: User;
  matchId: string;
  onClose: () => void;
}) {
  const nav = useNavigate();
  return (
    <div className="match-modal-bg" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="match-modal" onClick={(e) => e.stopPropagation()}>
        <h1 className="title">É MATCH! 💋</h1>
        <p className="muted">Você e {other.nickname || 'alguém'} se beijaram virtualmente.</p>
        <div className="photos">
          <div className="ph" style={me.photoUrl ? { backgroundImage: `url("${me.photoUrl}")` } : undefined} />
          <div className="ph" style={other.photoUrl ? { backgroundImage: `url("${other.photoUrl}")` } : undefined} />
        </div>
        <button
          className="btn"
          onClick={() => {
            onClose();
            nav(`/chat/${matchId}`);
          }}
        >
          Mandar mensagem 💬
        </button>
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={onClose}>
          Continuar curtindo a noite
        </button>
      </div>
    </div>
  );
}
