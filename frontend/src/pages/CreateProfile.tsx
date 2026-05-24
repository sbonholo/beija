import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { activeApi, isMockMode } from '../lib/api';
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

function newId() {
  return 'u_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const STEPS = ['Foto', 'Nome', 'Identidade', 'Procuro'];

export function CreateProfile() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [nickname, setNickname] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [seeking, setSeeking] = useState<Gender[]>([]);
  const [isAdult, setIsAdult] = useState(false);
  const [saving, setSaving] = useState(false);

  const everyoneSelected = ALL_GENDERS.every((g) => seeking.includes(g));

  function toggleSeeking(value: SeekingChip) {
    if (value === 'everyone') {
      setSeeking(everyoneSelected ? [] : [...ALL_GENDERS]);
      return;
    }
    setSeeking((cur) => (cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value]));
  }

  function isChipSelected(v: SeekingChip) {
    if (v === 'everyone') return everyoneSelected;
    return seeking.includes(v);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhotoFile(f);
    setPhotoUrl(URL.createObjectURL(f));
  }

  const stepsCompleted = [!!photoUrl, !!nickname.trim(), !!gender, seeking.length > 0];
  const valid = stepsCompleted.every(Boolean) && isAdult;

  async function submit() {
    if (!valid || !gender) return;
    setSaving(true);
    try {
      let uploadedUrl: string | null = null;
      if (photoFile) {
        const r = await activeApi.uploadPhoto(photoFile);
        uploadedUrl = r.photoUrl;
      }
      if (isMockMode) {
        setUser({
          id: newId(),
          nickname: nickname.trim(),
          gender,
          seeking,
          bio: null,
          photoUrl: uploadedUrl,
          birthdate: null,
          currentEventId: null,
          lastActive: Date.now(),
        });
      } else {
        const r = await activeApi.updateMe({ nickname: nickname.trim(), gender, seeking, photoUrl: uploadedUrl });
        setUser(r.user);
      }
      nav('/events', { replace: true });
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="screen" style={{ paddingBottom: 48 }}>
      {/* Header */}
      <div className="create-profile-header">
        <h1 className="brand-title" style={{ fontSize: 40 }}>Beija</h1>
        <p className="create-profile-hook">Cria seu perfil em 30 segundos ⚡</p>
        {/* Progress dots */}
        <div className="cp-progress">
          {STEPS.map((label, i) => (
            <div key={label} className={`cp-step${stepsCompleted[i] ? ' done' : ''}`}>
              <div className="cp-dot">{stepsCompleted[i] ? '✓' : i + 1}</div>
              <span className="cp-label">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Photo */}
      <div className="cp-section">
        <p className="field-label">Sua melhor foto 📸</p>
        <div
          onClick={() => galleryRef.current?.click()}
          role="button"
          aria-label="Escolher foto"
          className={`cp-photo-pick${photoUrl ? ' has-photo' : ''}`}
          style={photoUrl ? { backgroundImage: `url("${photoUrl}")` } : undefined}
        >
          {!photoUrl && (
            <div className="cp-photo-placeholder">
              <span style={{ fontSize: 44 }}>📷</span>
              <span style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>Toque para escolher</span>
            </div>
          )}
          {photoUrl && <div className="cp-photo-overlay">Trocar</div>}
        </div>
        <div className="row" style={{ gap: 8, justifyContent: 'center', marginTop: 10 }}>
          <button type="button" className="chip" onClick={() => cameraRef.current?.click()}>
            📷 Selfie
          </button>
          <button type="button" className="chip" onClick={() => galleryRef.current?.click()}>
            🖼️ Galeria
          </button>
        </div>
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="user" style={{ display: 'none' }} onChange={onPick} />
      <input ref={galleryRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPick} />

      {/* Nickname */}
      <div className="cp-section">
        <p className="field-label">Como te chamam?</p>
        <input
          placeholder="Seu nome ou apelido"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={30}
          style={{ fontSize: 18 }}
        />
      </div>

      {/* Identity */}
      <div className="cp-section">
        <p className="field-label">Como você se identifica?</p>
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
      </div>

      {/* Seeking */}
      <div className="cp-section">
        <p className="field-label">Quem você quer conhecer?</p>
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
      </div>

      {/* Age confirmation */}
      <label className="cp-adult-check">
        <input
          type="checkbox"
          checked={isAdult}
          onChange={(e) => setIsAdult(e.target.checked)}
          style={{ width: 20, height: 20, accentColor: 'var(--pink)', flexShrink: 0 }}
        />
        <span>Tenho 18 anos ou mais e aceito os termos de uso</span>
      </label>

      <button
        className={`btn${valid ? ' btn-ready' : ''}`}
        style={{ marginTop: 22 }}
        disabled={!valid || saving}
        onClick={submit}
      >
        {saving ? 'Criando perfil…' : 'Bora entrar no rolê! 🔥'}
      </button>

      {!valid && (
        <p className="muted" style={{ marginTop: 10, fontSize: 12, textAlign: 'center', lineHeight: 1.5 }}>
          Falta: {[!photoUrl && 'foto', !nickname.trim() && 'apelido', !gender && 'identidade', seeking.length === 0 && 'quem procura', !isAdult && '18+'].filter(Boolean).join(', ')}.
        </p>
      )}
    </div>
  );
}
