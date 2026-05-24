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

const FLOATIES: { emoji: string; left: string; top: string; dur: string; delay: string }[] = [
  { emoji: '💋', left: '6%',  top: '10%', dur: '5.2s', delay: '0s'    },
  { emoji: '❤️', left: '88%', top: '16%', dur: '7.1s', delay: '1.3s'  },
  { emoji: '🔥', left: '12%', top: '68%', dur: '6.4s', delay: '0.6s'  },
  { emoji: '💋', left: '80%', top: '74%', dur: '5.8s', delay: '2.1s'  },
  { emoji: '✨', left: '48%', top: '6%',  dur: '8s',   delay: '0.9s'  },
  { emoji: '❤️', left: '65%', top: '58%', dur: '6s',   delay: '3.2s'  },
];

export function Login() {
  const nav = useNavigate();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPhone(maskPhone(e.target.value));
    setError('');
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
    <div className="auth-screen">
      {/* Floating decorative emojis */}
      <div className="auth-floaties" aria-hidden="true">
        {FLOATIES.map((f, i) => (
          <span
            key={i}
            className="floaty"
            style={{ left: f.left, top: f.top, '--dur': f.dur, '--delay': f.delay } as React.CSSProperties}
          >
            {f.emoji}
          </span>
        ))}
      </div>

      {/* Hero */}
      <div className="auth-hero">
        <div className="lips-hero" aria-hidden="true">💋</div>
        <h1 className="brand-title">Beija</h1>
        <p className="brand-subtitle">Conexões no rolê 🔥</p>
        <p className="auth-tagline">Entre no rolê. Conheça gente incrível. 💋</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="auth-form">
        <div className="phone-input-wrap">
          <input
            type="tel"
            inputMode="numeric"
            placeholder="(11) 99999-9999"
            value={phone}
            onChange={handleChange}
            autoFocus
            className={`phone-input${isValid ? ' phone-valid' : ''}`}
          />
        </div>

        {error && (
          <p className="auth-error">{error}</p>
        )}

        <button
          className={`btn${isValid ? ' btn-ready' : ''}`}
          type="submit"
          disabled={loading || !isValid}
        >
          {loading ? 'Enviando…' : 'Receber código 📱'}
        </button>

        <p className="auth-disclaimer">
          Ao entrar, você confirma ter 18+ anos e aceita os termos de uso.
        </p>
      </form>
    </div>
  );
}
