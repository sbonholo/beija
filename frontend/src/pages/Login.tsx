import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { activeApi } from '../lib/api';

// Format any international number as the user types. Keeps a single leading '+'.
// Applies BR-specific spacing for +55 numbers; leaves other country codes as raw digits.
function maskInternational(value: string): string {
  // Strip everything except digits and '+'
  let raw = value.replace(/[^\d+]/g, '');
  // Collapse multiple '+' into one at position 0
  const hadPlus = raw.includes('+');
  raw = raw.replace(/\+/g, '');
  if (hadPlus) raw = '+' + raw;

  if (!raw) return '';
  if (!raw.startsWith('+')) raw = '+' + raw;

  // Cap to E.164 max: '+' followed by 15 digits
  const digits = raw.slice(1).slice(0, 15);

  // BR-specific formatting
  if (digits.startsWith('55')) {
    const d = digits.slice(2);
    if (d.length === 0) return '+55 ';
    if (d.length <= 2) return `+55 ${d}`;
    if (d.length <= 6) return `+55 ${d.slice(0, 2)} ${d.slice(2)}`;
    if (d.length <= 10) return `+55 ${d.slice(0, 2)} ${d.slice(2, 6)}-${d.slice(6)}`;
    return `+55 ${d.slice(0, 2)} ${d.slice(2, 7)}-${d.slice(7, 11)}`;
  }

  return '+' + digits;
}

function toE164(value: string): string {
  return value.replace(/[^\d+]/g, '');
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
    setPhone(maskInternational(e.target.value));
    setError('');
  }

  function handleFocus() {
    if (!phone) setPhone('+55 ');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const e164 = toE164(phone);
    if (!/^\+\d{8,15}$/.test(e164)) {
      setError('Digite um número válido em formato internacional. Ex: +55 11 91234-5678');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await activeApi.requestOtp(e164);
      sessionStorage.setItem('beija_phone', e164);
      nav('/verify');
    } catch {
      setError('Não foi possível enviar o código. Tente de novo.');
    } finally {
      setLoading(false);
    }
  }

  const e164 = toE164(phone);
  const isValid = /^\+\d{8,15}$/.test(e164);

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
            inputMode="tel"
            placeholder="+55 11 91234-5678"
            value={phone}
            onChange={handleChange}
            onFocus={handleFocus}
            autoFocus
            className={`phone-input${isValid ? ' phone-valid' : ''}`}
          />
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 6, textAlign: 'center', lineHeight: 1.5 }}>
          Use formato internacional. Ex: +55 11 91234-5678 ou +1 555 123 4567
        </p>

        {error && (
          <p className="auth-error">{error}</p>
        )}

        <button
          className={`btn${isValid ? ' btn-ready' : ''}`}
          type="submit"
          disabled={loading || !isValid}
        >
          {loading ? 'Enviando…' : 'Receber código no WhatsApp 💬'}
        </button>

        <p className="auth-disclaimer">
          Ao entrar, você confirma ter 18+ anos e aceita os termos de uso.
        </p>
      </form>
    </div>
  );
}
