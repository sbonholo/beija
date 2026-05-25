import { memo } from 'react';
import type { PersonAtEvent, ReactionType } from '../types';

const ICON: Record<ReactionType, string> = { kiss: '💋', heart: '❤️', fire: '🔥' };

export const PersonCard = memo(function PersonCard({
  person,
  selected,
  onSelect,
}: {
  person: PersonAtEvent;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`person ${person.matched ? 'matched' : ''}`}
      style={{ outline: selected && !person.matched ? '2px solid var(--pink)' : undefined, padding: 0 }}
      aria-label={`Selecionar ${person.nickname || 'pessoa'}`}
    >
      <div
        className={`photo ${person.photoUrl ? 'has-img' : ''}`}
        style={person.photoUrl ? { backgroundImage: `url("${person.photoUrl}")` } : undefined}
      />
      <div className="badges">
        {person.matched && <span className="badge matched" title="Match!" aria-label="match">✨</span>}
        {!person.matched && person.receivedReaction && (
          <span className="badge incoming" title="Reagiu em você">{ICON[person.receivedReaction]}</span>
        )}
        {person.sentReaction && !person.matched && (
          <span className="badge" title="Você reagiu">{ICON[person.sentReaction]}</span>
        )}
      </div>
      <div className="overlay">
        <div className="nick">{person.nickname || 'Anônimo'}</div>
      </div>
    </button>
  );
});
