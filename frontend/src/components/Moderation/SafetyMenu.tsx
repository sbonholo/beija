import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast';
import { ReportModal } from './ReportModal';

interface Props {
  targetUserId: string;
  targetName?: string;
  onClose: () => void;
  /** Called after a successful block or report so callers can remove the
   *  person from a list / navigate away. */
  onDone?: () => void;
}

/**
 * Shared report/block action sheet, reused everywhere a person appears
 * (swipe card, event attendee, chat, profile detail). Block goes through the
 * atomic block_user RPC; report through ReportModal (report_user RPC).
 */
export function SafetyMenu({ targetUserId, targetName, onClose, onDone }: Props) {
  const { t } = useTranslation('moderation');
  const toast = useToast();
  const [view, setView] = useState<'menu' | 'block'>('menu');
  const [reporting, setReporting] = useState(false);
  const [working, setWorking] = useState(false);

  const name = targetName ?? t('safety.default_name');

  async function confirmBlock() {
    if (working) return;
    setWorking(true);
    try {
      const { error } = await supabase.rpc('block_user', { p_blocked_id: targetUserId });
      if (error) throw error;
      toast({ kind: 'info', text: t('safety.block_toast') });
      onDone?.();
      onClose();
    } catch (e) {
      toast({ kind: 'info', text: e instanceof Error ? e.message : t('safety.block_error') });
    } finally {
      setWorking(false);
    }
  }

  if (reporting) {
    return (
      <ReportModal
        reportedUserId={targetUserId}
        reportedName={targetName}
        onClose={onClose}
        onReported={onDone}
      />
    );
  }

  return (
    <div
      className="match-modal-bg"
      role="dialog"
      aria-modal="true"
      onClick={() => !working && onClose()}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 440,
          padding: '18px 20px calc(18px + env(safe-area-inset-bottom))',
        }}
      >
        {view === 'menu' ? (
          <>
            <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>{name}</h2>
            <p className="muted" style={{ marginTop: 0, marginBottom: 16, fontSize: 13 }}>
              {t('safety.subtitle')}
            </p>
            <button
              className="btn ghost"
              style={{ marginBottom: 10 }}
              onClick={() => setReporting(true)}
            >
              🚩 {t('safety.report')}
            </button>
            <button
              className="btn ghost"
              style={{ marginBottom: 10, color: '#ff8585' }}
              onClick={() => setView('block')}
            >
              🚫 {t('safety.block')}
            </button>
            <button className="btn ghost" onClick={onClose}>
              {t('safety.cancel')}
            </button>
          </>
        ) : (
          <>
            <h2 style={{ margin: '0 0 8px' }}>{t('safety.block_confirm_title', { name })}</h2>
            <p className="muted" style={{ marginTop: 0, marginBottom: 18 }}>
              {t('safety.block_confirm_body')}
            </p>
            <button
              className="btn"
              style={{ background: 'var(--danger)' }}
              disabled={working}
              onClick={() => void confirmBlock()}
            >
              {working ? t('safety.blocking') : t('safety.block')}
            </button>
            <button
              className="btn ghost"
              style={{ marginTop: 10 }}
              disabled={working}
              onClick={() => setView('menu')}
            >
              {t('safety.cancel')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
