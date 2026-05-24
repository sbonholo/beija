import { useEffect, useRef, useState } from 'react';
import type { Message } from '../../lib/supabase';

interface Props {
  message: Message;
  isOwn: boolean;
  onDelete?: () => void;
}

const LONG_PRESS_MS = 500;

export function MessageBubble({ message, isOwn, onDelete }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const timerRef = useRef<number | null>(null);
  const movedRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    movedRef.current = false;
    startRef.current = { x: e.clientX, y: e.clientY };
    timerRef.current = window.setTimeout(() => {
      if (!movedRef.current) setMenuOpen(true);
    }, LONG_PRESS_MS);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      movedRef.current = true;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
  }

  function onPointerUp() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      /* ignore — older browsers / iOS without https */
    }
    setMenuOpen(false);
  }

  const time = new Date(message.created_at).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isOwn ? 'flex-end' : 'flex-start',
        marginBottom: 4,
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`chat-message ${isOwn ? 'mine' : 'theirs'}`}
        style={{ position: 'relative', userSelect: 'none', cursor: 'default' }}
      >
        {message.content}
      </div>
      <div
        className="chat-time"
        style={{
          fontSize: 11,
          color: 'var(--muted)',
          margin: isOwn ? '0 6px 6px 0' : '0 0 6px 6px',
          display: 'flex',
          gap: 4,
          alignItems: 'center',
        }}
      >
        <span>{time}</span>
        {isOwn && (
          <span aria-label={message.read_at ? 'lida' : 'enviada'}>
            {message.read_at ? (
              <span style={{ color: '#3aa8ff', fontWeight: 700 }}>✓✓</span>
            ) : (
              <span style={{ color: 'var(--muted)' }}>✓</span>
            )}
          </span>
        )}
      </div>

      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 480,
              background: 'var(--card)',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: '14px 18px calc(20px + env(safe-area-inset-bottom))',
            }}
          >
            <button
              className="btn ghost"
              style={{ marginBottom: 8 }}
              onClick={copyText}
            >
              📋 Copiar
            </button>
            {isOwn && onDelete && (
              <button
                className="btn ghost"
                style={{ color: 'var(--danger)' }}
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
              >
                🗑 Apagar
              </button>
            )}
            <button
              className="btn ghost"
              style={{ marginTop: 8 }}
              onClick={() => setMenuOpen(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
