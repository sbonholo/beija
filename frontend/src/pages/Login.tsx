import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';

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
      const res = await api.requestOtp(phone);
      const params = new URLSearchParams({ phone: res.phone });
      if (res.devCode) params.set('hint', res.devCode);
      nav(`/verify?${params.toString()}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'Erro ao enviar código');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen">
      <div style={{ marginTop: '12vh', marginBottom: 32 }}>
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
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
        {error && <p style={{ color: 'var(--danger)', marginTop: 8, fontSize: 13 }}>{error}</p>}
        <button className="btn" style={{ marginTop: 18 }} disabled={loading || !phone}>
          {loading ? 'Enviando...' : 'Receber código 💋'}
        </button>
      </form>
      <p className="muted" style={{ marginTop: 24, fontSize: 12, textAlign: 'center' }}>
        Ao continuar você concorda com os termos e confirma ter 18+.
      </p>
    </div>
  );
}
