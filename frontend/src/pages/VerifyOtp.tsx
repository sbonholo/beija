import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { mockedApi as api, ApiError } from '../lib/api';
import { useAuth } from '../state/AuthContext';

export function VerifyOtp() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const phone = params.get('phone') || '';
  const hint = params.get('hint');
  const { signIn } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.verifyOtp(phone, code);
      signIn(res.token, res.user);
      nav(res.needsProfile ? '/onboarding' : '/events', { replace: true });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      const msg: Record<string, string> = {
        invalid_otp: 'Código inválido. Confira e tente de novo.',
        otp_expired: 'Código expirado. Peça um novo.',
        request_failed: 'Serviço indisponível. Tente novamente mais tarde.',
      };
      setError(msg[code] ?? 'Não foi possível verificar o código. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen">
      <div style={{ marginTop: '10vh', marginBottom: 32 }}>
        <h1 className="brand-title" style={{ fontSize: 30 }}>Confirme o código</h1>
        <p className="brand-sub">Mandamos um SMS para <strong>{phone}</strong></p>
      </div>
      <form onSubmit={submit}>
        <input
          autoFocus
          inputMode="numeric"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
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
      </form>
      <Link to="/" className="muted" style={{ marginTop: 20, textAlign: 'center', fontSize: 14 }}>
        ← Mudar número
      </Link>
    </div>
  );
}
