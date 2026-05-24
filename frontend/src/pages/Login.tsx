import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { activeApi } from '../lib/api';

function maskPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function Login() {
  const nav = useNavigate();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPhone(maskPhone(e.target.value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = phone.replace(/\D/g, '');
    if (raw.length < 10 || raw.length > 11) {
      setError('Digite um número válido com DDD (ex: 11 99999-9999).');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await activeApi.requestOtp(raw);
      sessionStorage.setItem('beija_phone', raw);
      nav('/verify');
    } catch {
      setError('Não foi possível enviar o código. Tente de novo.');
    } finally {
      setLoading(false);
    }
  }

  const digits = phone.replace(/\D/g, '');
  const isValid = digits.length === 10 || digits.length === 11;

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
          onChange={handleChange}
          autoFocus
          style={{ fontSize: 18, textAlign: 'center', letterSpacing: 2 }}
        />
        {error && <p style={{ color: 'var(--pink)', fontSize: 13, textAlign: 'center', margin: 0 }}>{error}</p>}
        <button className="btn" type="submit" disabled={loading || !isValid}>
          {loading ? 'Enviando...' : 'Receber código 📱'}
        </button>
      </form>
    </div>
  );
}
