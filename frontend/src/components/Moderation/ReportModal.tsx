import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';

const REASON_TOKENS = [
  'fake_profile',
  'harassment',
  'inappropriate_content',
  'underage',
  'scam_spam',
  'other',
] as const;

type ReasonToken = (typeof REASON_TOKENS)[number];

interface Props {
  reportedUserId: string;
  reportedName?: string;
  onClose: () => void;
  onReported?: () => void;
}

export function ReportModal({ reportedUserId, reportedName, onClose, onReported }: Props) {
  const { t } = useTranslation('moderation');
  const [reason, setReason] = useState<ReasonToken | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // Atomic server-side: insert report (status pending) + optional block
      // (which also deletes swipes + match). No client-side cleanup needed.
      const { error: rpcErr } = await supabase.rpc('report_user', {
        p_reported_id: reportedUserId,
        p_reason: reason,
        p_details: details.trim() || null,
        p_also_block: alsoBlock,
      });
      if (rpcErr) throw rpcErr;

      setSubmitted(true);
      onReported?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('report.error'));
    } finally {
      setSubmitting(false);
    }
  }

  const name = reportedName ?? t('report.default_name');

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
            <h2 style={{ margin: '0 0 6px', textAlign: 'center' }}>{t('report.success_title')}</h2>
            <p className="muted" style={{ textAlign: 'center', marginTop: 0 }}>
              {t('report.success_body')}
            </p>
            <button className="btn" style={{ marginTop: 18 }} onClick={onClose}>
              {t('report.close')}
            </button>
          </>
        ) : (
          <>
            <h2 style={{ margin: '0 0 6px' }}>{t('report.title', { name })}</h2>
            <p className="muted" style={{ marginTop: 0, marginBottom: 16, fontSize: 13 }}>
              {t('report.subtitle')}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {REASON_TOKENS.map((token) => (
                <label
                  key={token}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    background: 'var(--bg-elev)',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    border: `1px solid ${reason === token ? 'var(--pink)' : 'rgba(255,255,255,0.08)'}`,
                  }}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    checked={reason === token}
                    onChange={() => setReason(token)}
                    style={{ accentColor: 'var(--pink)' }}
                  />
                  <span style={{ fontSize: 14 }}>{t(`report.reasons.${token}`)}</span>
                </label>
              ))}
            </div>

            <label htmlFor="report-details" className="muted" style={{ fontSize: 13, marginTop: 14, display: 'block' }}>
              {t('report.details_label')}
            </label>
            <textarea
              id="report-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder={t('report.details_placeholder')}
            />

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginTop: 14,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={alsoBlock}
                onChange={(e) => setAlsoBlock(e.target.checked)}
                style={{ width: 20, height: 20, flexShrink: 0, accentColor: 'var(--pink)' }}
              />
              <span style={{ fontSize: 14 }}>{t('report.also_block')}</span>
            </label>

            {error && (
              <p style={{ color: 'var(--danger)', marginTop: 10, fontSize: 13 }}>{error}</p>
            )}

            <button
              className="btn"
              style={{ marginTop: 18 }}
              disabled={!reason || submitting}
              onClick={() => void submit()}
            >
              {submitting ? t('report.submitting') : t('report.submit')}
            </button>
            <button
              className="btn ghost"
              style={{ marginTop: 10 }}
              disabled={submitting}
              onClick={onClose}
            >
              {t('report.cancel')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
