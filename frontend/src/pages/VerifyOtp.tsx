import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { activeApi, setToken } from '../lib/api';
import { useAuth } from '../state/AuthContext';

function formatDisplay(d: string): string {
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function VerifyOtp() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const rawPhone = sessionStorage.getItem('beija_phone') || '';

  useEffect(() => {
    if (!rawPhone) nav('/login', { replace: true });
    inputRef.current?.focus();
  }, [rawPhone, nav]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length < 4) return;
    setLoading(true);
    setError('');
    try {
      const res = await activeApi.verifyOtp(rawPhone, code);
      setToken(res.token);
      setUser(res.user);
      sessionStorage.removeItem('beija_phone');
      nav(res.needsProfile ? '/' : '/events', { replace: true });
    } catch (err: any) {
      const msg: Record<string, string> = {
        wrong_code: 'Código incorreto. Tente de novo.',
        expired: 'Código expirado. Volte e peça um novo.',
        too_many_attempts: 'Muitas tentativas. Volte e peça um novo código.',
      };
      setError(msg[err?.code] || 'Erro ao verificar. Tente de novo.');
      setCode('');
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  const isReady = code.length >= 4;

  return (
    <div className="auth-screen">
      {/* Hero */}
      <div className="auth-hero">
        <div className="lock-hero" aria-hidden="true">🔐</div>
        <h1 className="brand-title">Beija</h1>

        {rawPhone && (
          <div className="verify-sent-badge">
            <span>✓</span> Código enviado para {formatDisplay(rawPhone)}
          </div>
        )}

        <p className="auth-tagline" style={{ marginTop: 12 }}>
          Digite o código de 6 dígitos que chegou por SMS.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="auth-form">
        <input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          maxLength={6}
          placeholder="· · · · · ·"
          value={code}
          onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
          className={`otp-input${isReady ? ' otp-ready' : ''}`}
        />

        {error && <p className="auth-error">{error}</p>}

        <button
          className={`btn${isReady ? ' btn-ready' : ''}`}
          type="submit"
          disabled={loading || !isReady}
        >
          {loading ? 'Verificando…' : 'Entrar 🔓'}
        </button>

        <button type="button" className="btn ghost" onClick={() => nav('/login')}>
          ← Trocar número
        </button>
      </form>
    </div>
  );
}
