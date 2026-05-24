import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../state/AuthContext';

function daysLeft(scheduledFor: string | null): number {
  if (!scheduledFor) return 0;
  const ms = new Date(scheduledFor).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export function ReactivationScreen() {
  const nav = useNavigate();
  const { profile, refresh, signOut } = useAuth();
  const [working, setWorking] = useState<'reactivate' | 'signout' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remaining = daysLeft(profile?.deletion_scheduled_for ?? null);

  async function reactivate() {
    if (working) return;
    setWorking('reactivate');
    setError(null);
    try {
      const { error: rpcErr } = await supabase.rpc('reactivate_account');
      if (rpcErr) throw rpcErr;
      await refresh();
      nav('/discover', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao reativar.');
    } finally {
      setWorking(null);
    }
  }

  async function leaveItDeleted() {
    if (working) return;
    setWorking('signout');
    try {
      await signOut();
      nav('/', { replace: true });
    } finally {
      setWorking(null);
    }
  }

  return (
    <div
      style={{
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '40px 24px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ marginBottom: 28 }}>
        <h1 className="brand-title">Beija</h1>
      </div>

      <div style={{ fontSize: 56, textAlign: 'center', marginBottom: 8 }}>👋</div>
      <h2 style={{ margin: '0 0 12px', textAlign: 'center' }}>Bem-vindo de volta</h2>
      <p className="muted" style={{ margin: 0, textAlign: 'center', lineHeight: 1.5 }}>
        Sua conta foi marcada pra exclusão. Você tem{' '}
        <strong style={{ color: 'var(--text)' }}>{remaining} {remaining === 1 ? 'dia' : 'dias'}</strong>
        {' '}pra reativar antes que tudo seja apagado.
      </p>

      <button
        className="btn"
        style={{ marginTop: 28 }}
        disabled={working !== null}
        onClick={reactivate}
      >
        {working === 'reactivate' ? 'Reativando...' : 'Reativar minha conta'}
      </button>

      <button
        className="btn ghost"
        style={{ marginTop: 12 }}
        disabled={working !== null}
        onClick={leaveItDeleted}
      >
        {working === 'signout' ? 'Saindo...' : 'Mudei de ideia, sair'}
      </button>

      {error && (
        <p style={{ color: 'var(--danger)', marginTop: 12, fontSize: 13, textAlign: 'center' }}>
          {error}
        </p>
      )}

      <p className="muted" style={{ marginTop: 28, fontSize: 12, textAlign: 'center' }}>
        Se não fizer nada nos próximos {remaining} dias, seu perfil, fotos, matches e mensagens
        serão apagados permanentemente.
      </p>
    </div>
  );
}
