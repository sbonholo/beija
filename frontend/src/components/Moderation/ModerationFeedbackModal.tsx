import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { labelReason } from '../../lib/moderation';

interface Props {
  reasons: string[];
  onClose: () => void;
}

/**
 * Surfaced when a photo is rejected by the pre-upload moderation pass.
 * role="alertdialog" because it's gating an action the user already attempted.
 * Focus trap + ESC close required by Apple's accessibility review.
 */
export default function ModerationFeedbackModal({ reasons, onClose }: Props) {
  const { t } = useTranslation('moderation');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeBtnRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    function trap(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !node) return;
      const focusable = node.querySelectorAll<HTMLElement>(
        'a, button:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    node.addEventListener('keydown', trap);
    return () => node.removeEventListener('keydown', trap);
  }, []);

  const unique = Array.from(new Set(reasons));

  return (
    <div
      ref={containerRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="moderation-modal-title"
      aria-describedby="moderation-modal-desc"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(6px)',
        zIndex: 250,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 440,
          width: '100%',
          padding: '24px 22px',
          background: 'var(--card)',
        }}
      >
        <h2 id="moderation-modal-title" style={{ marginTop: 0 }}>
          {t('modal_title')}
        </h2>
        <p id="moderation-modal-desc" className="muted" style={{ marginTop: 6 }}>
          {t('modal_description')}
        </p>

        {unique.length > 0 && (
          <ul style={{ paddingLeft: 18, marginTop: 14, lineHeight: 1.5 }}>
            {unique.map((r) => (
              <li key={r}>{labelReason(r)}</li>
            ))}
          </ul>
        )}

        <div
          style={{
            display: 'flex',
            gap: 10,
            marginTop: 20,
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          <Link
            to="/community-guidelines"
            className="chip"
            style={{ textDecoration: 'none' }}
            onClick={onClose}
          >
            {t('view_guidelines')}
          </Link>
          <button
            type="button"
            ref={closeBtnRef}
            className="btn"
            onClick={onClose}
            style={{ minWidth: 140 }}
          >
            {t('understood')}
          </button>
        </div>
      </div>
    </div>
  );
}
