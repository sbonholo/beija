import type { ReactionType } from '../types';
import { hapticTap } from '../platform/haptics';

const reactions: { type: ReactionType; icon: string; label: string }[] = [
  { type: 'kiss', icon: '💋', label: 'Beijo' },
  { type: 'heart', icon: '❤️', label: 'Curtir' },
  { type: 'fire', icon: '🔥', label: 'Fogo' },
];

export function ReactionBar({
  current,
  disabled,
  onSend,
}: {
  current: ReactionType | null;
  disabled?: boolean;
  onSend: (type: ReactionType) => void;
}) {
  return (
    <div className="reactions" role="group" aria-label="Reagir">
      {reactions.map((r) => (
        <button
          key={r.type}
          type="button"
          disabled={disabled}
          aria-label={r.label}
          className={`reaction-btn ${r.type} ${current === r.type ? 'active' : ''}`}
          onClick={() => {
            hapticTap();
            onSend(r.type);
          }}
        >
          <span aria-hidden>{r.icon}</span>
        </button>
      ))}
    </div>
  );
}
