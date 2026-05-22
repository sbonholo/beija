import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mockedApi as api } from '../lib/api';
import { useAuth } from '../state/AuthContext';
import type { Gender } from '../types';

const genders: { value: Gender; label: string; icon: string }[] = [
  { value: 'woman', label: 'Mulher', icon: '♀️' },
  { value: 'man', label: 'Homem', icon: '♂️' },
  { value: 'non-binary', label: 'Não-binário', icon: '⚧️' },
  { value: 'other', label: 'Outro', icon: '✨' },
];

export function Onboarding() {
  const nav = useNavigate();
  const { user, setUser } = useAuth();
  const [step, setStep] = useState(0);
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [gender, setGender] = useState<Gender | null>(user?.gender || null);
  const [birthdate, setBirthdate] = useState(user?.birthdate || '');
  const [saving, setSaving] = useState(false);

  const maxBirthdate = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().slice(0, 10);
  })();

  async function finish(withBirthdate: string | null) {
    if (!nickname || !gender) return;
    setSaving(true);
    try {
      const patch: Record<string, unknown> = { nickname, gender };
      if (withBirthdate) patch.birthdate = withBirthdate;
      const { user } = await api.updateMe(patch);
      setUser(user);
      nav(user.photoUrl ? '/events' : '/photo', { replace: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen">
      <h2 style={{ marginTop: 12, marginBottom: 4 }}>Vamos te conhecer</h2>
      <p className="muted" style={{ marginBottom: 22 }}>Passo {step + 1} de 3</p>

      {step === 0 && (
        <>
          <label className="muted" style={{ fontSize: 13 }}>Como te chamam?</label>
          <input
            autoFocus
            placeholder="Seu apelido"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={30}
          />
          <button className="btn" style={{ marginTop: 18 }} disabled={!nickname.trim()} onClick={() => setStep(1)}>
            Próximo
          </button>
        </>
      )}

      {step === 1 && (
        <>
          <label className="muted" style={{ fontSize: 13, marginBottom: 8, display: 'block' }}>
            Você se identifica como
          </label>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {genders.map((g) => (
              <button
                key={g.value}
                type="button"
                className={`chip ${gender === g.value ? 'selected' : ''}`}
                onClick={() => setGender(g.value)}
              >
                <span aria-hidden>{g.icon}</span> {g.label}
              </button>
            ))}
          </div>
          <button className="btn" style={{ marginTop: 22 }} disabled={!gender} onClick={() => setStep(2)}>
            Próximo
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <label className="muted" style={{ fontSize: 13, marginBottom: 4, display: 'block' }}>
            Quando você nasceu?
          </label>
          <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 12 }}>
            Isso nos ajuda a encontrar pessoas compatíveis
          </p>
          <input
            type="date"
            max={maxBirthdate}
            value={birthdate}
            onChange={(e) => setBirthdate(e.target.value)}
          />
          <button
            className="btn"
            style={{ marginTop: 22 }}
            disabled={saving || !birthdate}
            onClick={() => finish(birthdate)}
          >
            {saving ? 'Salvando...' : 'Bora! 🔥'}
          </button>
          <button
            className="btn ghost"
            style={{ marginTop: 12 }}
            disabled={saving}
            onClick={() => finish(null)}
          >
            Pular
          </button>
        </>
      )}

      {step > 0 && (
        <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => setStep((s) => s - 1)}>
          Voltar
        </button>
      )}
    </div>
  );
}
