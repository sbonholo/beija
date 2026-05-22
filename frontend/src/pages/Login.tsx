import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mockedApi as api, ApiError } from '../lib/api';
import { digitsOnly, formatPhone } from '../lib/phone';

const authScreenStyle: React.CSSProperties = {
  minHeight: '100svh',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  padding: '40px 24px',
  boxSizing: 'border-box',
};

export function Login() {
  const nav = useNavigate();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.requestOtp(digitsOnly(phone));
      nav('/verify', { state: { phone: res.phone, hint: res.devCode ?? null } });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      const msg: Record<string, string> = {
        request_failed: 'Serviço indisponível. Tente novamente mais tarde.',
        invalid_phone: 'Número de telefone inválido.',
        too_many_requests: 'Muitas tentativas. Aguarde alguns minutos.',
      };
      setError(msg[code] ?? 'Erro ao enviar código. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={authScreenStyle}>
      <div style={{ marginBottom: 32 }}>
        <h1 className="brand-title">Beija</h1>
        <p className="brand-sub">Conexões reais em eventos. Quem tá com você agora?</p>
      </div>
      <form onSubmit={submit}>
        <label htmlFor="phone" className="muted" style={{ fontSize: 13, marginBottom: 6, display: 'block' }}>
          Seu celular
        </label>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(11) 98765-4321"
          maxLength={15}
          value={phone}
          onChange={(e) => {
            const raw = digitsOnly(e.target.value);
            setPhone(formatPhone(raw));
          }}
          required
        />
        {import.meta.env.DEV && (
          <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', marginTop: 8 }}>
            Demo: use (00) 00000-0000 + código 000000
          </p>
        )}
        {error && <p style={{ color: 'var(--danger)', marginTop: 8, fontSize: 13 }}>{error}</p>}
        <button className="btn" style={{ marginTop: 18 }} disabled={loading || !phone}>
          {loading ? 'Enviando...' : 'Receber código 💋'}
        </button>
      </form>
      <p className="muted" style={{ marginTop: 24, fontSize: 12, textAlign: 'center' }}>
        Ao continuar você concorda com os{' '}
        <a href="#" style={{ color: 'var(--pink)', textDecoration: 'none' }}>termos</a>
        {' '}e confirma ter 18+.
      </p>
    </div>
  );
}
