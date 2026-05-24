import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { BottomNav } from '../components/BottomNav';
import { genderLabel } from '../lib/labels';
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

export function Profile() {
  const { user, setUser, signOut } = useAuth();
  const nav = useNavigate();
  const [bio, setBio] = useState(user?.bio || '');
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [gender, setGender] = useState<Gender | null>(user?.gender ?? null);
  const [seeking, setSeeking] = useState<Gender[]>(user?.seeking ?? []);
  const [isUploading, setIsUploading] = useState(false);

  const everyoneSelected = ALL_GENDERS.every((g) => seeking.includes(g));

  function toggleSeeking(v: SeekingChip) {
    if (v === 'everyone') {
      setSeeking(everyoneSelected ? [] : [...ALL_GENDERS]);
      return;
    }
    setSeeking((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
  }

  function isChipSelected(v: SeekingChip) {
    if (v === 'everyone') return everyoneSelected;
    return seeking.includes(v);
  }

  const dirty =
    !!user &&
    (nickname.trim() !== (user.nickname ?? '') ||
      (bio || null) !== (user.bio || null) ||
      gender !== user.gender ||
      JSON.stringify(seeking) !== JSON.stringify(user.seeking ?? []));

  function save() {
    if (!user || !gender || seeking.length === 0 || !nickname.trim()) return;
    setUser({
      ...user,
      nickname: nickname.trim(),
      bio: bio.trim() || null,
      gender,
      seeking,
    });
    nav('/events');
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !user) return;
    setIsUploading(true);
    try {
      const photoUrl = URL.createObjectURL(f);
      setUser({ ...user, photoUrl });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="screen">
      <div className="header"><h2>Seu perfil</h2></div>

      <div
        className="card"
        style={{
          display: 'flex',
          gap: 14,
          alignItems: 'center',
          marginBottom: 18,
          position: 'relative',
          opacity: isUploading ? 0.5 : 1,
          pointerEvents: isUploading ? 'none' : 'auto',
          transition: 'opacity 0.15s ease',
        }}
      >
        <div
          className="avatar"
          style={{ width: 80, height: 80, backgroundImage: user?.photoUrl ? `url("${user.photoUrl}")` : undefined }}
        />
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: 18 }}>{user?.nickname || '—'}</strong>
          {user?.gender && (
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{genderLabel[user.gender]}</div>
          )}
          <label className="chip" style={{ marginTop: 8, display: 'inline-flex', cursor: 'pointer' }}>
            Trocar foto
            <input type="file" accept="image/*" onChange={onPhoto} style={{ display: 'none' }} />
          </label>
        </div>
        {isUploading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(10, 0, 20, 0.55)',
              borderRadius: 'var(--radius)',
              fontWeight: 700,
              color: 'var(--text)',
              pointerEvents: 'auto',
            }}
          >
            Enviando…
          </div>
        )}
      </div>

      <label className="muted" style={{ fontSize: 13 }}>Apelido</label>
      <input value={nickname} maxLength={30} onChange={(e) => setNickname(e.target.value)} />

      <label className="muted" style={{ fontSize: 13, marginTop: 12, display: 'block' }}>Bio</label>
      <textarea value={bio} maxLength={200} rows={3} onChange={(e) => setBio(e.target.value)} />

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

      <button
        className="btn"
        style={{ marginTop: 22 }}
        disabled={!dirty || !nickname.trim() || !gender || seeking.length === 0}
        onClick={save}
      >
        Salvar
      </button>

      <button
        className="btn ghost"
        style={{ marginTop: 12 }}
        onClick={() => nav('/events')}
      >
        Ver eventos
      </button>

      <button
        className="btn ghost"
        style={{ marginTop: 24 }}
        onClick={() => {
          if (confirm('Apagar seu perfil e sair?')) {
            signOut();
            nav('/', { replace: true });
          }
        }}
      >
        Apagar perfil
      </button>

      <BottomNav />
    </div>
  );
}
