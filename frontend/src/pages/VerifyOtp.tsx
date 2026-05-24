import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { activeApi, setToken } from '../lib/api';
import { useAuth } from '../state/AuthContext';

export function VerifyOtp() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const rawPhone = sessionStorage.getItem('beija_phone') || '';
  const phone = rawPhone;
  function formatDisplay(d: string): string {
    if (d.length <= 2) return d;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  useEffect(() => {
    if (!rawPhone) nav('/login', { replace: true });
    inputRef.current?.focus();
  }, [rawPhone, nav]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 4) return;
    setLoading(true);
    setError('');
    try {
      const res = await activeApi.verifyOtp(phone, code);
      setToken(res.token);
      setUser(res.user);
      sessionStorage.removeItem('beija_phone');
      nav(res.needsProfile ? '/' : '/events', { replace: true });
    } catch (err: any) {
      const msg: Record<string, string> = {
        wrong_code: 'Código incorreto.',
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

  return (
    <div className="screen" style={{ justifyContent: 'center', paddingBottom: 40 }}>
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <h1 className="brand-title">Beija</h1>
        <p className="brand-sub">Digite o código de 4 dígitos</p>
        {phone && <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>{formatDisplay(phone)}</p>}
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          maxLength={4}
          placeholder="0000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
          style={{ fontSize: 32, textAlign: 'center', letterSpacing: 10 }}
        />
        {error && <p style={{ color: 'var(--pink)', fontSize: 13, textAlign: 'center', margin: 0 }}>{error}</p>}
        <button className="btn" type="submit" disabled={loading || code.length !== 4}>
          {loading ? 'Verificando...' : 'Entrar 🔓'}
        </button>
        <button type="button" className="btn ghost" onClick={() => nav('/login')}>
          Voltar
        </button>
      </form>
    </div>
  );
}
