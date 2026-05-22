import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { mockedApi as api, ApiError } from '../lib/api';
import { useAuth } from '../state/AuthContext';
import { formatPhone } from '../lib/phone';

const authScreenStyle: React.CSSProperties = {
  minHeight: '100svh',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  padding: '40px 24px',
  boxSizing: 'border-box',
};

interface LocationState {
  phone?: string;
  hint?: string | null;
}

export function VerifyOtp() {
  const nav = useNavigate();
  const location = useLocation();
  const state = (location.state as LocationState | null) ?? {};
  const phone = state.phone || '';
  const [hint, setHint] = useState<string | null>(state.hint ?? null);

  const { signIn } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [resending, setResending] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = window.setInterval(() => {
      setResendCooldown((n) => (n > 0 ? n - 1 : 0));
    }, 1000);
    return () => window.clearInterval(t);
  }, [resendCooldown]);

  const doVerify = useCallback(async (otp: string) => {
    if (!phone || submittingRef.current) return;
    submittingRef.current = true;
    setError(null);
    setLoading(true);
    try {
      const res = await api.verifyOtp(phone, otp);
      signIn(res.token, res.user);
      nav(res.needsProfile ? '/onboarding' : '/events', { replace: true });
    } catch (err) {
      const errCode = err instanceof ApiError ? err.code : '';
      const msg: Record<string, string> = {
        invalid_otp: 'Código inválido. Confira e tente de novo.',
        otp_expired: 'Código expirado. Peça um novo.',
        request_failed: 'Serviço indisponível. Tente novamente mais tarde.',
      };
      setError(msg[errCode] ?? 'Não foi possível verificar o código. Tente novamente.');
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }, [phone, signIn, nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length < 6) return;
    await doVerify(code);
  }

  async function resend() {
    if (resendCooldown > 0 || resending || !phone) return;
    setResending(true);
    setError(null);
    try {
      const res = await api.requestOtp(phone);
      setHint(res.devCode ?? null);
      setResendCooldown(60);
    } catch (err) {
      const errCode = err instanceof ApiError ? err.code : '';
      const msg: Record<string, string> = {
        request_failed: 'Serviço indisponível. Tente novamente mais tarde.',
        too_many_requests: 'Muitas tentativas. Aguarde alguns minutos.',
      };
      setError(msg[errCode] ?? 'Erro ao reenviar código. Tente novamente.');
    } finally {
      setResending(false);
    }
  }

  return (
    <div style={authScreenStyle}>
      <div style={{ marginBottom: 32 }}>
        <h1 className="brand-title" style={{ fontSize: 30 }}>Confirme o código</h1>
        <p className="brand-sub">Mandamos um SMS para <strong>{formatPhone(phone)}</strong></p>
      </div>
      <form onSubmit={submit}>
        <input
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => {
            const next = e.target.value.replace(/\D/g, '').slice(0, 6);
            setCode(next);
            if (next.length === 6) void doVerify(next);
          }}
          style={{ fontSize: 28, textAlign: 'center', letterSpacing: '0.4em' }}
        />
        {hint && (
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            modo dev: código <strong>{hint}</strong>
          </p>
        )}
        {error && <p style={{ color: 'var(--danger)', marginTop: 8, fontSize: 13 }}>{error}</p>}
        <button className="btn" style={{ marginTop: 18 }} disabled={loading || code.length < 6}>
          {loading ? 'Verificando...' : 'Entrar'}
        </button>

        {resendCooldown > 0 ? (
          <p className="muted" style={{ marginTop: 14, textAlign: 'center', fontSize: 13 }}>
            Reenviar em {resendCooldown}s
          </p>
        ) : (
          <button
            type="button"
            className="btn ghost"
            style={{ marginTop: 14 }}
            disabled={resending}
            onClick={resend}
          >
            {resending ? 'Reenviando...' : 'Reenviar código'}
          </button>
        )}
      </form>
      <Link to="/" className="muted" style={{ marginTop: 20, textAlign: 'center', fontSize: 14 }}>
        ← Mudar número
      </Link>
    </div>
  );
}
