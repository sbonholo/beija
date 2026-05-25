import { useEffect, useState } from 'react';
import type { PersonAtEvent, ReactionType } from '../types';
import { ReactionBar } from './ReactionBar';
import { genderLabel, seekingLabel, ageFromBirthdate } from '../lib/labels';

const REPORT_REASONS = [
  { value: 'spam', label: 'Spam ou golpe' },
  { value: 'inappropriate', label: 'Conteúdo inapropriado' },
  { value: 'harassment', label: 'Assédio' },
  { value: 'other', label: 'Outro' },
];

interface Props {
  person: PersonAtEvent;
  onClose: () => void;
  onReact: (type: ReactionType) => void;
  onBlock: () => void;
  onReport: (reason: string) => void;
}

export function PersonSheet({ person, onClose, onReact, onBlock, onReport }: Props) {
  const age = ageFromBirthdate(person.birthdate);
  const [showSafety, setShowSafety] = useState(false);
  const [showReasons, setShowReasons] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleBlock() {
    setShowSafety(false);
    onBlock();
  }

  function handleReport(reason: string) {
    setShowReasons(false);
    setShowSafety(false);
    onReport(reason);
  }

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

        {/* Safety section */}
        <div className="person-sheet-safety">
          <button
            type="button"
            className="safety-toggle"
            onClick={() => { setShowSafety((v) => !v); setShowReasons(false); }}
          >
            ⚠️ Bloquear ou denunciar
          </button>

          {showSafety && !showReasons && (
            <div className="safety-actions">
              <button type="button" className="safety-btn block-btn" onClick={handleBlock}>
                🚫 Bloquear {person.nickname || 'esta pessoa'}
              </button>
              <button type="button" className="safety-btn report-btn" onClick={() => setShowReasons(true)}>
                🏳️ Denunciar
              </button>
            </div>
          )}

          {showSafety && showReasons && (
            <div className="safety-actions">
              <p className="muted" style={{ fontSize: 13, margin: '0 0 8px', textAlign: 'center' }}>
                Qual o motivo?
              </p>
              {REPORT_REASONS.map((r) => (
                <button key={r.value} type="button" className="safety-btn reason-btn" onClick={() => handleReport(r.value)}>
                  {r.label}
                </button>
              ))}
              <button type="button" className="safety-btn cancel-btn" onClick={() => setShowReasons(false)}>
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
