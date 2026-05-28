import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast';

interface Props {
  targetUserId: string;
  targetName?: string;
  onBlocked?: () => void;
  variant?: 'chip' | 'ghost';
}

export function BlockButton({ targetUserId, targetName, onBlocked, variant = 'chip' }: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);

  async function confirmBlock() {
    if (working) return;
    setWorking(true);
    try {
      const { error } = await supabase.rpc('block_user', { p_blocked_id: targetUserId });
      if (error) throw error;
      toast({ kind: 'info', text: 'Usuário bloqueado.' });
      setOpen(false);
      onBlocked?.();
    } catch (e) {
      toast({ kind: 'info', text: e instanceof Error ? e.message : 'Erro ao bloquear.' });
    } finally {
      setWorking(false);
    }
  }

  const className = variant === 'ghost' ? 'btn ghost' : 'chip';

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
        aria-label={targetName ? `Bloquear ${targetName}` : 'Bloquear'}
      >
        🚫 Bloquear
      </button>

      {open && (
        <div
          className="match-modal-bg"
          role="dialog"
          aria-modal="true"
          onClick={() => !working && setOpen(false)}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 400,
              padding: '22px',
            }}
          >
            <h2 style={{ margin: '0 0 8px' }}>
              Bloquear {targetName ?? 'esta pessoa'}?
            </h2>
            <p className="muted" style={{ marginTop: 0, marginBottom: 18 }}>
              Vocês não se verão mais. Matches e mensagens entre vocês serão removidos.
            </p>
            <button
              className="btn"
              style={{ background: 'var(--danger)' }}
              disabled={working}
              onClick={confirmBlock}
            >
              {working ? 'Bloqueando...' : 'Bloquear'}
            </button>
            <button
              className="btn ghost"
              style={{ marginTop: 10 }}
              disabled={working}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
