import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { mockedApi as api } from '../lib/api';
import { useAuth } from '../state/AuthContext';
import type { Gender } from '../types';

const identityOptions: { value: Gender; label: string; icon: string }[] = [
  { value: 'woman', label: 'Mulher', icon: '♀️' },
  { value: 'man', label: 'Homem', icon: '♂️' },
  { value: 'non-binary', label: 'Não-binário/a', icon: '⚧️' },
  { value: 'other', label: 'Outro', icon: '✨' },
];

const ALL_GENDERS: Gender[] = ['woman', 'man', 'non-binary', 'other'];

type SeekingChip = Gender | 'everyone';

const seekingOptions: { value: SeekingChip; label: string; icon: string }[] = [
  { value: 'woman', label: 'Mulheres', icon: '♀️' },
  { value: 'man', label: 'Homens', icon: '♂️' },
  { value: 'non-binary', label: 'Não-binárias', icon: '⚧️' },
  { value: 'everyone', label: 'Qualquer pessoa', icon: '💫' },
];

export function Onboarding() {
  const nav = useNavigate();
  const { user, setUser, signOut } = useAuth();
  const [step, setStep] = useState(0);
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [gender, setGender] = useState<Gender | null>(user?.gender ?? null);
  const [seeking, setSeeking] = useState<Gender[]>(user?.seeking ?? []);
  const [underage, setUnderage] = useState(false);
  const [saving, setSaving] = useState(false);

  const everyoneSelected = ALL_GENDERS.every((g) => seeking.includes(g));

  function toggleSeeking(value: SeekingChip) {
    if (value === 'everyone') {
      setSeeking(everyoneSelected ? [] : [...ALL_GENDERS]);
      return;
    }
    setSeeking((cur) =>
      cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value],
    );
  }

  function isChipSelected(value: SeekingChip): boolean {
    if (value === 'everyone') return everyoneSelected;
    return seeking.includes(value);
  }

  async function finish() {
    if (!nickname || !gender || seeking.length === 0) return;
    setSaving(true);
    try {
      const { user } = await api.updateMe({ nickname, gender, seeking });
      setUser(user);
      nav(user.photoUrl ? '/events' : '/photo', { replace: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen">
      <h2 style={{ marginTop: 12, marginBottom: 4 }}>Vamos te conhecer</h2>
      <div
        className="onboarding-progress"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={3}
        aria-valuenow={step + 1}
        aria-label={`Passo ${step + 1} de 3`}
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className={`onboarding-progress-seg ${i <= step ? 'filled' : ''}`} />
        ))}
      </div>
      <p className="muted" style={{ marginTop: 6, marginBottom: 22, fontSize: 12 }}>Passo {step + 1} de 3</p>

      {step === 0 && (
        <>
          <label className="muted" style={{ fontSize: 13 }}>Como te chamamos no rolê? 💋</label>
          <input
            autoFocus
            placeholder="Seu nome ou apelido"
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
            Como você se identifica?
          </label>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {identityOptions.map((g) => (
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

          <div style={{ height: 16 }} />

          <label className="muted" style={{ fontSize: 13, marginBottom: 8, display: 'block' }}>
            Quem você quer conhecer?
          </label>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {seekingOptions.map((s) => (
              <button
                key={s.value}
                type="button"
                className={`chip ${isChipSelected(s.value) ? 'selected' : ''}`}
                onClick={() => toggleSeeking(s.value)}
              >
                <span aria-hidden>{s.icon}</span> {s.label}
              </button>
            ))}
          </div>

          <button
            className="btn"
            style={{ marginTop: 22 }}
            disabled={!gender || seeking.length === 0}
            onClick={() => setStep(2)}
          >
            Próximo
          </button>
        </>
      )}

      {step === 2 && !underage && (
        <>
          <label className="muted" style={{ fontSize: 13, marginBottom: 4, display: 'block' }}>
            Você tem 18 anos ou mais?
          </label>
          <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 16 }}>
            O Beija é só pra maiores de 18.
          </p>
          <button
            className="btn"
            style={{ marginTop: 6 }}
            disabled={saving}
            onClick={finish}
          >
            {saving ? 'Salvando...' : 'Sim, tenho 18+'}
          </button>
          <button
            className="btn ghost"
            style={{ marginTop: 12 }}
            disabled={saving}
            onClick={() => setUnderage(true)}
          >
            Não
          </button>
        </>
      )}

      {step === 2 && underage && (
        <>
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>🚫</div>
            <h3 style={{ margin: '0 0 8px' }}>Volta quando completar 18</h3>
            <p className="muted" style={{ margin: 0 }}>
              O Beija é exclusivo pra maiores de 18 anos.
            </p>
          </div>
          <button
            className="btn"
            style={{ marginTop: 22 }}
            onClick={() => {
              signOut();
              nav('/', { replace: true });
            }}
          >
            Sair
          </button>
          <button
            className="btn ghost"
            style={{ marginTop: 12 }}
            onClick={() => setUnderage(false)}
          >
            Voltar
          </button>
        </>
      )}

      {step > 0 && !(step === 2 && underage) && (
        <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => setStep((s) => s - 1)}>
          Voltar
        </button>
      )}
    </div>
  );
}
