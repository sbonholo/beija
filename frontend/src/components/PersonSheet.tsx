import { useEffect, useRef, useState } from 'react';
import type { PersonAtEvent, ReactionType } from '../types';
import { ReactionBar } from './ReactionBar';
import { genderLabel, seekingLabel, ageFromBirthdate } from '../lib/labels';

const REPORT_REASONS = [
  { value: 'spam', label: 'Spam ou golpe' },
  { value: 'inappropriate', label: 'Conteúdo inapropriado' },
  { value: 'harassment', label: 'Assédio' },
  { value: 'other', label: 'Outro' },
];

const REACTION_ICON: Record<ReactionType, string> = { kiss: '💋', heart: '❤️', fire: '🔥' };
const REACTION_LABEL: Record<ReactionType, string> = { kiss: 'BEIJO', heart: 'CURTIDA', fire: 'FOGO' };

const SWIPE_THRESHOLD = 90;        // px past origin to commit horizontal
const SWIPE_DOWN_THRESHOLD = 110;  // px past origin to commit down-to-close
const SWIPE_INTENT_THRESHOLD = 8;  // px before deciding horizontal vs vertical
const SWIPE_COMMIT_MS = 220;       // CSS transition duration for fly-off

interface Props {
  person: PersonAtEvent;
  onClose: () => void;
  onReact: (type: ReactionType) => void;
  onBlock: () => void;
  onReport: (reason: string) => void;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  lastReaction: ReactionType;
}

export function PersonSheet({ person, onClose, onReact, onBlock, onReport, onSwipeRight, onSwipeLeft, lastReaction }: Props) {
  const age = ageFromBirthdate(person.birthdate);
  const [showSafety, setShowSafety] = useState(false);
  const [showReasons, setShowReasons] = useState(false);

  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startScrollTop: number;
    lockedAxis: 'x' | 'y' | null;
    pointerId: number;
    dx: number;
    dy: number;
    committed: boolean;
  } | null>(null);

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

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Skip swipe when the user is targeting an interactive element (buttons, links, inputs)
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea, [data-no-swipe]')) return;

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startScrollTop: sheetRef.current?.scrollTop ?? 0,
      lockedAxis: null,
      pointerId: e.pointerId,
      dx: 0,
      dy: 0,
      committed: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const s = dragRef.current;
    if (!s || s.committed || e.pointerId !== s.pointerId) return;

    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;

    if (!s.lockedAxis) {
      if (Math.abs(dx) < SWIPE_INTENT_THRESHOLD && Math.abs(dy) < SWIPE_INTENT_THRESHOLD) return;
      s.lockedAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (s.lockedAxis === 'x') setIsDragging(true);
      // Vertical drag-to-close only kicks in when the sheet is scrolled to the top
      // and the user is pulling down. Otherwise let native scroll handle it.
      else if (dy > 0 && s.startScrollTop <= 0) setIsDragging(true);
    }

    if (s.lockedAxis === 'x') {
      s.dx = dx;
      setDragX(dx);
    } else if (s.lockedAxis === 'y' && dy > 0 && s.startScrollTop <= 0) {
      s.dy = dy;
      setDragY(dy);
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const s = dragRef.current;
    if (!s || e.pointerId !== s.pointerId) return;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }

    setIsDragging(false);

    if (s.lockedAxis === 'x') {
      const dx = s.dx;
      if (dx > SWIPE_THRESHOLD) {
        s.committed = true;
        setDragX(window.innerWidth);
        setTimeout(() => { onSwipeRight(); }, SWIPE_COMMIT_MS);
      } else if (dx < -SWIPE_THRESHOLD) {
        s.committed = true;
        setDragX(-window.innerWidth);
        setTimeout(() => { onSwipeLeft(); }, SWIPE_COMMIT_MS);
      } else {
        setDragX(0);
        dragRef.current = null;
      }
      return;
    }

    if (s.lockedAxis === 'y' && s.dy > SWIPE_DOWN_THRESHOLD) {
      s.committed = true;
      setDragY(window.innerHeight);
      setTimeout(() => { onClose(); }, SWIPE_COMMIT_MS);
      return;
    }

    setDragX(0);
    setDragY(0);
    dragRef.current = null;
  }

  const rotation = dragX * 0.04;
  const transforms: string[] = [];
  if (dragX) transforms.push(`translateX(${dragX}px)`, `rotate(${rotation}deg)`);
  if (dragY) transforms.push(`translateY(${dragY}px)`);
  const sheetStyle: React.CSSProperties = transforms.length
    ? { transform: transforms.join(' ') }
    : {};

  const rightOpacity = Math.min(Math.max(dragX, 0) / 100, 1);
  const leftOpacity = Math.min(Math.max(-dragX, 0) / 100, 1);
  const bgOpacity = dragY > 0 ? Math.max(1 - dragY / 400, 0.3) : 1;

  return (
    <div
      className="person-sheet-bg"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={bgOpacity < 1 ? { opacity: bgOpacity } : undefined}
    >
      <div
        ref={sheetRef}
        className={`person-sheet${isDragging ? ' dragging' : ''}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={sheetStyle}
      >
        <div className="person-sheet-handle" aria-hidden />

        <button
          type="button"
          className="person-sheet-close"
          onClick={onClose}
          aria-label="Fechar perfil"
          data-no-swipe
        >
          ✕
        </button>

        <div
          className={`person-sheet-photo ${person.matched ? 'matched' : ''}`}
          style={person.photoUrl ? { backgroundImage: `url("${person.photoUrl}")` } : undefined}
        >
          {rightOpacity > 0 && (
            <div className="swipe-label swipe-label-like" style={{ opacity: rightOpacity }}>
              {REACTION_ICON[lastReaction]} {REACTION_LABEL[lastReaction]}
            </div>
          )}
          {leftOpacity > 0 && (
            <div className="swipe-label swipe-label-pass" style={{ opacity: leftOpacity }}>
              ✗ PASSAR
            </div>
          )}
        </div>

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

        <p className="muted swipe-hint" data-no-swipe>
          ← passar · curtir → · ✕ fechar
        </p>

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
