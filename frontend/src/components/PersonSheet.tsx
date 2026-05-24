import { useEffect } from 'react';
import type { PersonAtEvent, ReactionType } from '../types';
import { ReactionBar } from './ReactionBar';
import { genderLabel, seekingLabel, ageFromBirthdate } from '../lib/labels';

interface Props {
  person: PersonAtEvent;
  onClose: () => void;
  onReact: (type: ReactionType) => void;
}

export function PersonSheet({ person, onClose, onReact }: Props) {
  const age = ageFromBirthdate(person.birthdate);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="person-sheet-bg" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="person-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="person-sheet-handle" aria-hidden />

        <div
          className={`person-sheet-photo ${person.matched ? 'matched' : ''}`}
          style={person.photoUrl ? { backgroundImage: `url("${person.photoUrl}")` } : undefined}
        />

        <div className="person-sheet-header">
          <h2 style={{ margin: 0, fontSize: 22 }}>
            {person.nickname || 'Alguém'}
            {age != null && <span className="muted" style={{ fontWeight: 400, marginLeft: 8 }}>{age}</span>}
          </h2>
          {person.matched && (
            <span className="pill" style={{ background: 'rgba(255, 213, 74, 0.18)', color: 'var(--gold)' }}>
              ✨ Match
            </span>
          )}
        </div>

        {person.bio && (
          <p style={{ margin: '6px 0 0', lineHeight: 1.4 }}>{person.bio}</p>
        )}

        <div className="person-sheet-meta">
          {person.gender && (
            <span className="chip" style={{ pointerEvents: 'none', minHeight: 32, padding: '6px 12px' }}>
              {genderLabel[person.gender]}
            </span>
          )}
          {person.seeking && person.seeking.length > 0 && (
            <span className="muted" style={{ fontSize: 13 }}>
              Procura: {person.seeking.map((g) => seekingLabel[g]).join(', ')}
            </span>
          )}
        </div>

        <ReactionBar current={person.sentReaction} onSend={onReact} />
      </div>
    </div>
  );
}
