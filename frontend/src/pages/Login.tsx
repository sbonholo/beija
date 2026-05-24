import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { activeApi } from '../lib/api';

export function Login() {
  const nav = useNavigate();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = phone.replace(/\D/g, '');
    if (raw.length < 10) { setError('Digite um número válido com DDD.'); return; }
    setLoading(true);
    setError('');
    try {
      await activeApi.requestOtp(phone);
      sessionStorage.setItem('beija_phone', phone);
      nav('/verify');
    } catch {
      setError('Não foi possível enviar o código. Tente de novo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen" style={{ justifyContent: 'center', paddingBottom: 40 }}>
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <h1 className="brand-title">Beija</h1>
        <p className="brand-sub">Seu número de celular para entrar</p>
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <input
          type="tel"
          inputMode="numeric"
          placeholder="(11) 99999-9999"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoFocus
          style={{ fontSize: 18, textAlign: 'center', letterSpacing: 2 }}
        />
        {error && <p style={{ color: 'var(--pink)', fontSize: 13, textAlign: 'center', margin: 0 }}>{error}</p>}
        <button className="btn" type="submit" disabled={loading}>
          {loading ? 'Enviando...' : 'Receber código 📱'}
        </button>
      </form>
    </div>
  );
}
