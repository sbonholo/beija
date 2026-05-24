import type { ReactionType, User } from '../types';
import { useNavigate } from 'react-router-dom';

const REACTION_ICON: Record<ReactionType, string> = { kiss: '💋', heart: '❤️', fire: '🔥' };

export function MatchModal({
  me,
  other,
  matchId,
  myReaction,
  theirReaction,
  onClose,
}: {
  me: User;
  other: User;
  matchId: string;
  myReaction?: ReactionType | null;
  theirReaction?: ReactionType | null;
  onClose: () => void;
}) {
  const nav = useNavigate();
  return (
    <div className="match-modal-bg" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="match-modal" onClick={(e) => e.stopPropagation()}>
        <h1 className="title">É MATCH! 💋</h1>
        <p className="muted">É beijo na boca!</p>
        <div className="photos">
          <div className="ph-wrap">
            <div className="ph" style={me.photoUrl ? { backgroundImage: `url("${me.photoUrl}")` } : undefined} />
            {myReaction && <span className="ph-reaction" aria-label={`Você mandou ${myReaction}`}>{REACTION_ICON[myReaction]}</span>}
          </div>
          <div className="ph-wrap">
            <div className="ph" style={other.photoUrl ? { backgroundImage: `url("${other.photoUrl}")` } : undefined} />
            {theirReaction && <span className="ph-reaction" aria-label={`${other.nickname || 'Outra pessoa'} mandou ${theirReaction}`}>{REACTION_ICON[theirReaction]}</span>}
          </div>
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
