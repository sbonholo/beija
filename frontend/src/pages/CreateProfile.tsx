import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { activeApi, isMockMode } from '../lib/api';
import type { Gender, User } from '../types';

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

  const valid =
    !!photoUrl &&
    nickname.trim().length > 0 &&
    gender !== null &&
    seeking.length > 0 &&
    isAdult;

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
    <div className="screen" style={{ paddingBottom: 40 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 className="brand-title">Beija</h1>
        <p className="brand-sub">Bem-vindo! Monta seu perfil pra entrar no rolê.</p>
      </div>

      <label className="muted" style={{ fontSize: 13, marginBottom: 8, display: 'block' }}>
        Sua foto
      </label>
      <div
        onClick={() => galleryRef.current?.click()}
        role="button"
        aria-label="Escolher foto"
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          maxWidth: 240,
          margin: '0 auto 12px',
          borderRadius: 'var(--radius)',
          backgroundImage: photoUrl ? `url("${photoUrl}")` : undefined,
          backgroundColor: photoUrl ? undefined : '#1c0a2b',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          border: '2px dashed rgba(255, 59, 154, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: photoUrl ? 'var(--shadow)' : undefined,
        }}
      >
        {!photoUrl && <span style={{ fontSize: 48 }}>📷</span>}
      </div>
      <div className="row" style={{ gap: 8, justifyContent: 'center', marginBottom: 22 }}>
        <button type="button" className="chip" onClick={() => cameraRef.current?.click()}>
          📷 Selfie
        </button>
        <button type="button" className="chip" onClick={() => galleryRef.current?.click()}>
          🖼️ Galeria
        </button>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="user"
        style={{ display: 'none' }}
        onChange={onPick}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onPick}
      />

      <input
        placeholder="Seu nome ou apelido"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        maxLength={30}
      />

      <label className="muted" style={{ fontSize: 13, marginTop: 16, marginBottom: 8, display: 'block' }}>
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

      <label className="muted" style={{ fontSize: 13, marginTop: 16, marginBottom: 8, display: 'block' }}>
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

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginTop: 22,
          padding: '14px 16px',
          background: 'var(--bg-elev)',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <input
          type="checkbox"
          checked={isAdult}
          onChange={(e) => setIsAdult(e.target.checked)}
          style={{ width: 20, height: 20, accentColor: 'var(--pink)' }}
        />
        <span style={{ fontSize: 14 }}>Tenho 18 anos ou mais</span>
      </label>

      <button
        className="btn"
        style={{ marginTop: 22 }}
        disabled={!valid || saving}
        onClick={submit}
      >
        {saving ? 'Salvando...' : 'Bora! 🔥'}
      </button>

      {!valid && (
        <p className="muted" style={{ marginTop: 10, fontSize: 12, textAlign: 'center' }}>
          Pra continuar: foto, nick, identidade, quem você procura e confirmar 18+.
        </p>
      )}
    </div>
  );
}
