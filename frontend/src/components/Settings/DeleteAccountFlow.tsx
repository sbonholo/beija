import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { signOut } from '../../lib/auth';

const CONFIRM_WORD = 'DELETAR';

const REASONS = [
  'Encontrei alguém',
  'Não estou tendo matches suficientes',
  'O app não atendeu minhas expectativas',
  'Preocupação com privacidade',
  'Vou fazer uma pausa',
  'Outro',
] as const;

type Reason = (typeof REASONS)[number];

export function DeleteAccountFlow({ onCancel }: { onCancel?: () => void }) {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [selectedReasons, setSelectedReasons] = useState<Set<Reason>>(new Set());
  const [typed, setTyped] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleReason(r: Reason) {
    setSelectedReasons((cur) => {
      const next = new Set(cur);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  }

  async function confirmDelete() {
    if (working) return;
    if (typed !== CONFIRM_WORD) return;
    setWorking(true);
    setError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id;
      if (!me) throw new Error('not_authenticated');

      // 1) Create deletion request (30-day cooldown).
      const { error: reqErr } = await supabase.from('deletion_requests').upsert(
        {
          user_id: me,
          requested_at: new Date().toISOString(),
          scheduled_for: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          cancelled_at: null,
        },
        { onConflict: 'user_id' },
      );
      if (reqErr) throw reqErr;

      // 2) Soft delete: hide profile from app immediately.
      const { error: softErr } = await supabase
        .from('profiles')
        .update({
          deleted_at: new Date().toISOString(),
          push_token: null,
        })
        .eq('id', me);
      if (softErr) throw softErr;

      // 3) (TODO) Trigger confirmation email via Supabase edge function.
      //    Edge function `account_deletion_confirmation` is expected to email
      //    the user with cancellation instructions; we just kick it off here.
      try {
        await supabase.functions.invoke('account_deletion_confirmation', {
          body: { user_id: me, reasons: Array.from(selectedReasons) },
        });
      } catch {
        /* email is best-effort */
      }

      // 4) Sign out locally.
      await signOut();
      nav('/', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao processar exclusão.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="screen" style={{ paddingBottom: 40 }}>
      <div className="header"><h2>Excluir conta</h2></div>

      <div
        className="onboarding-progress"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={3}
        aria-valuenow={step + 1}
        aria-label={`Passo ${step + 1} de 3`}
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className={`onboarding-progress-seg ${i <= step ? 'filled' : ''}`} />
        ))}
      </div>
      <p className="muted" style={{ marginTop: 6, marginBottom: 22, fontSize: 12 }}>
        Passo {step + 1} de 3
      </p>

      {step === 0 && (
        <>
          <h3 style={{ marginTop: 0 }}>Por que você está saindo?</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            Opcional — ajuda a gente a melhorar.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
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
                  border: `1px solid ${
                    selectedReasons.has(r) ? 'var(--pink)' : 'rgba(255,255,255,0.08)'
                  }`,
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedReasons.has(r)}
                  onChange={() => toggleReason(r)}
                  style={{ accentColor: 'var(--pink)' }}
                />
                <span style={{ fontSize: 14 }}>{r}</span>
              </label>
            ))}
          </div>
          <button className="btn" style={{ marginTop: 22 }} onClick={() => setStep(1)}>
            Continuar
          </button>
          <button className="btn ghost" style={{ marginTop: 10 }} onClick={onCancel}>
            Cancelar
          </button>
        </>
      )}

      {step === 1 && (
        <>
          <h3 style={{ marginTop: 0 }}>Tem certeza?</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Seu perfil ficará oculto agora mesmo. Você tem <strong>30 dias</strong> pra
            reativar entrando de novo. Depois disso, todos os seus dados (perfil, fotos,
            mensagens, matches) serão apagados permanentemente.
          </p>
          <p style={{ marginTop: 14, fontSize: 13 }}>
            Digite <strong>{CONFIRM_WORD}</strong> pra confirmar:
          </p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value.toUpperCase())}
            placeholder={CONFIRM_WORD}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            className="btn"
            style={{
              marginTop: 18,
              background: typed === CONFIRM_WORD ? 'var(--danger)' : undefined,
            }}
            disabled={typed !== CONFIRM_WORD}
            onClick={() => setStep(2)}
          >
            Próximo
          </button>
          <button
            className="btn ghost"
            style={{ marginTop: 10 }}
            onClick={() => setStep(0)}
          >
            Voltar
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <div style={{ fontSize: 56, textAlign: 'center', marginTop: 18 }}>⚠️</div>
          <h3 style={{ textAlign: 'center', marginTop: 8 }}>Último passo</h3>
          <p className="muted" style={{ textAlign: 'center', marginTop: 0 }}>
            Confirma a exclusão da sua conta? Você poderá cancelar essa solicitação
            entrando de novo nos próximos 30 dias.
          </p>
          {error && (
            <p style={{ color: 'var(--danger)', textAlign: 'center', fontSize: 13 }}>{error}</p>
          )}
          <button
            className="btn"
            style={{ marginTop: 22, background: 'var(--danger)' }}
            disabled={working}
            onClick={confirmDelete}
          >
            {working ? 'Processando...' : 'Sim, excluir minha conta'}
          </button>
          <button
            className="btn ghost"
            style={{ marginTop: 10 }}
            disabled={working}
            onClick={() => setStep(1)}
          >
            Voltar
          </button>
        </>
      )}
    </div>
  );
}
