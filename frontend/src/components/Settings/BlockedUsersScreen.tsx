import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast';
import { formatFullDate } from '../../lib/dates';

interface BlockedRow {
  blocked_id: string;
  created_at: string;
  profile: { id: string; name: string | null } | null;
}

export function BlockedUsersScreen() {
  const { t } = useTranslation('settings');
  const nav = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState<BlockedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('blocks')
      .select('blocked_id, created_at, profile:profiles!blocks_blocked_id_fkey(id, name)')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ kind: 'info', text: t('errors:generic', { defaultValue: 'Algo deu errado.' }) });
      setRows([]);
    } else {
      setRows((data ?? []) as unknown as BlockedRow[]);
    }
    setLoading(false);
  }, [t, toast]);

  useEffect(() => { void load(); }, [load]);

  async function unblock(userId: string) {
    if (unblocking) return;
    setUnblocking(userId);
    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('blocked_id', userId);
    if (error) {
      toast({ kind: 'info', text: t('errors:generic', { defaultValue: 'Não foi possível desbloquear.' }) });
    } else {
      setRows((rs) => rs.filter((r) => r.blocked_id !== userId));
      toast({ kind: 'info', text: t('blocked.unblocked', { defaultValue: 'Desbloqueado.' }) });
    }
    setUnblocking(null);
  }

  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button
          onClick={() => nav(-1)}
          aria-label={t('common:actions.back', { defaultValue: 'Voltar' })}
          style={{ fontSize: 22, padding: '4px 10px', color: 'var(--text)' }}
        >
          ←
        </button>
        <h2 style={{ margin: 0 }}>
          {t('blocked.title', { defaultValue: 'Usuários bloqueados' })}
        </h2>
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14 }}>
              <div className="skeleton circle" style={{ width: 44, height: 44, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ height: 14, width: '50%', marginBottom: 6 }} />
                <div className="skeleton" style={{ height: 12, width: '30%' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="empty" style={{ marginTop: 40 }}>
          <div style={{ fontSize: 48 }}>🙅‍♀️</div>
          <p className="muted">
            {t('blocked.empty', { defaultValue: 'Você não bloqueou ninguém ainda.' })}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((r) => (
          <div
            key={r.blocked_id}
            className="card"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>
                {r.profile?.name || t('blocked.deleted_user', { defaultValue: 'Conta removida' })}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {formatFullDate(r.created_at)}
              </div>
            </div>
            <button
              onClick={() => void unblock(r.blocked_id)}
              disabled={unblocking === r.blocked_id}
              className="btn ghost"
              style={{ width: 'auto', padding: '8px 14px', fontSize: 14 }}
            >
              {unblocking === r.blocked_id
                ? t('blocked.unblocking', { defaultValue: 'Aguarde…' })
                : t('blocked.unblock', { defaultValue: 'Desbloquear' })}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
