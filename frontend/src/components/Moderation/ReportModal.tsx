import { useState } from 'react';

export type ReportTargetType = 'user' | 'message';

export type ReportReason =
  | 'inappropriate_photo'
  | 'harassment'
  | 'fake_profile'
  | 'underage'
  | 'spam'
  | 'other';

const REASONS: { value: ReportReason; label: string }[] = [
  { value: 'inappropriate_photo', label: 'Foto inapropriada' },
  { value: 'harassment', label: 'Assédio ou agressão' },
  { value: 'fake_profile', label: 'Perfil falso / catfish' },
  { value: 'underage', label: 'Parece menor de 18' },
  { value: 'spam', label: 'Spam ou golpe' },
  { value: 'other', label: 'Outro motivo' },
];

interface Props {
  targetType: ReportTargetType;
  targetId: string;
  targetName?: string;
  onClose: () => void;
  onSubmit: (payload: {
    targetType: ReportTargetType;
    targetId: string;
    reason: ReportReason;
    details: string;
  }) => Promise<void> | void;
}

export function ReportModal({ targetType, targetId, targetName, onClose, onSubmit }: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!reason) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ targetType, targetId, reason, details: details.trim() });
      setSubmitted(true);
    } catch {
      setError('Não foi possível enviar a denúncia. Tente novamente.');
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
          maxWidth: 420,
          padding: '20px 22px calc(20px + env(safe-area-inset-bottom))',
        }}
      >
        {submitted ? (
          <>
            <div style={{ fontSize: 48, textAlign: 'center', marginBottom: 8 }}>✅</div>
            <h2 style={{ margin: '0 0 6px', textAlign: 'center' }}>Denúncia recebida</h2>
            <p className="muted" style={{ textAlign: 'center', marginTop: 0 }}>
              Nossa equipe vai analisar. Obrigado por ajudar a manter o Beija seguro.
            </p>
            <button className="btn" style={{ marginTop: 18 }} onClick={onClose}>
              Fechar
            </button>
          </>
        ) : (
          <>
            <h2 style={{ margin: '0 0 6px' }}>
              {targetType === 'user' ? 'Denunciar perfil' : 'Denunciar mensagem'}
            </h2>
            <p className="muted" style={{ marginTop: 0, marginBottom: 16, fontSize: 13 }}>
              {targetName
                ? `Conta pra gente o que rolou com ${targetName}.`
                : 'Conta pra gente o que rolou.'}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    background: 'var(--bg-elev)',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    border: `1px solid ${reason === r.value ? 'var(--pink)' : 'rgba(255,255,255,0.08)'}`,
                  }}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    style={{ accentColor: 'var(--pink)' }}
                  />
                  <span style={{ fontSize: 14 }}>{r.label}</span>
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
