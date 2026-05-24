import { useState } from 'react';
import { supabase } from '../../lib/supabase';

const REASONS = [
  'Foto inadequada',
  'Perfil falso',
  'Comportamento abusivo',
  'Spam',
  'Menor de idade',
  'Outro',
] as const;

type Reason = (typeof REASONS)[number];

interface Props {
  reportedUserId: string;
  reportedName?: string;
  onClose: () => void;
  onReported?: () => void;
}

export function ReportModal({ reportedUserId, reportedName, onClose, onReported }: Props) {
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id;
      if (!me) throw new Error('not_authenticated');

      const { error: reportErr } = await supabase.from('reports').insert({
        reporter_id: me,
        reported_id: reportedUserId,
        reason,
        details: details.trim() || null,
      });
      if (reportErr) throw reportErr;

      // Auto-block the reported user
      const { error: blockErr } = await supabase
        .from('blocks')
        .insert({ blocker_id: me, blocked_id: reportedUserId });
      if (blockErr && blockErr.code !== '23505') {
        // unique_violation just means they were already blocked — ignore
        console.warn('[ReportModal] auto-block failed:', blockErr);
      }

      // Remove mutual swipes and match so we don't show them again
      await supabase
        .from('swipes')
        .delete()
        .or(
          `and(swiper_id.eq.${me},swipee_id.eq.${reportedUserId}),and(swiper_id.eq.${reportedUserId},swipee_id.eq.${me})`,
        );
      const lo = me < reportedUserId ? me : reportedUserId;
      const hi = me < reportedUserId ? reportedUserId : me;
      await supabase.from('matches').delete().eq('user1_id', lo).eq('user2_id', hi);

      setSubmitted(true);
      onReported?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar denúncia.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="match-modal-bg" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 440,
          padding: '20px 22px calc(20px + env(safe-area-inset-bottom))',
        }}
      >
        {submitted ? (
          <>
            <div style={{ fontSize: 48, textAlign: 'center', marginBottom: 8 }}>✅</div>
            <h2 style={{ margin: '0 0 6px', textAlign: 'center' }}>Denúncia recebida</h2>
            <p className="muted" style={{ textAlign: 'center', marginTop: 0 }}>
              Nossa equipe vai responder em até 24h. Você não vai mais ver{' '}
              {reportedName ?? 'essa pessoa'} no app.
            </p>
            <button className="btn" style={{ marginTop: 18 }} onClick={onClose}>
              Fechar
            </button>
          </>
        ) : (
          <>
            <h2 style={{ margin: '0 0 6px' }}>
              Denunciar {reportedName ?? 'perfil'}
            </h2>
            <p className="muted" style={{ marginTop: 0, marginBottom: 16, fontSize: 13 }}>
              Conta pra gente o que rolou. Nossa equipe analisa em até 24h.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {REASONS.map((r) => (
                <label
                  key={r}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    background: 'var(--bg-elev)',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    border: `1px solid ${reason === r ? 'var(--pink)' : 'rgba(255,255,255,0.08)'}`,
                  }}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    style={{ accentColor: 'var(--pink)' }}
                  />
                  <span style={{ fontSize: 14 }}>{r}</span>
                </label>
              ))}
            </div>

            <label className="muted" style={{ fontSize: 13, marginTop: 14, display: 'block' }}>
              Detalhes (opcional)
            </label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Descreve o que aconteceu"
            />

            {error && (
              <p style={{ color: 'var(--danger)', marginTop: 10, fontSize: 13 }}>{error}</p>
            )}

            <button
              className="btn"
              style={{ marginTop: 18 }}
              disabled={!reason || submitting}
              onClick={submit}
            >
              {submitting ? 'Enviando...' : 'Enviar denúncia'}
            </button>
            <button
              className="btn ghost"
              style={{ marginTop: 10 }}
              disabled={submitting}
              onClick={onClose}
            >
              Cancelar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
