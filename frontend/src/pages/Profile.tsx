import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { activeApi, isMockMode } from '../lib/api';
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  async function save() {
    if (!user || !gender || seeking.length === 0 || !nickname.trim()) return;
    const patch = { nickname: nickname.trim(), bio: bio.trim() || null, gender, seeking };
    if (isMockMode) {
      setUser({ ...user, ...patch });
    } else {
      try {
        const r = await activeApi.updateMe(patch);
        setUser(r.user);
      } catch {
        return;
      }
    }
    nav('/events');
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !user) return;
    setIsUploading(true);
    try {
      const { photoUrl } = await activeApi.uploadPhoto(f);
      if (!isMockMode) await activeApi.updateMe({ photoUrl });
      setUser({ ...user, photoUrl });
    } catch {
      /* keep existing photo on failure */
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="screen">
      <div className="header">
        <h2 style={{ fontFamily: 'Poppins, system-ui, sans-serif' }}>Seu perfil</h2>
      </div>

      {/* Avatar card */}
      <div
        className="card"
        style={{
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          marginBottom: 20,
          position: 'relative',
          opacity: isUploading ? 0.5 : 1,
          pointerEvents: isUploading ? 'none' : 'auto',
          transition: 'opacity 0.15s ease',
        }}
      >
        <div
          className="avatar"
          style={{
            width: 84,
            height: 84,
            borderRadius: '50%',
            border: '3px solid rgba(255,59,154,0.5)',
            boxShadow: '0 0 20px rgba(255,59,154,0.3)',
            backgroundImage: user?.photoUrl ? `url("${user.photoUrl}")` : undefined,
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: 20, fontFamily: 'Poppins, system-ui, sans-serif' }}>
            {user?.nickname || '—'}
          </strong>
          {user?.gender && (
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{genderLabel[user.gender]}</div>
          )}
          <label className="chip" style={{ marginTop: 10, display: 'inline-flex', cursor: 'pointer', fontSize: 13 }}>
            {isUploading ? 'Enviando…' : '📷 Trocar foto'}
            <input type="file" accept="image/*" onChange={onPhoto} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      <label className="field-label">Apelido</label>
      <input value={nickname} maxLength={30} onChange={(e) => setNickname(e.target.value)} style={{ marginBottom: 14 }} />

      <label className="field-label">Bio</label>
      <textarea value={bio} maxLength={200} rows={3} onChange={(e) => setBio(e.target.value)} style={{ marginBottom: 16 }} />

      <label className="field-label">Como você se identifica?</label>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
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

      <label className="field-label">Quem você quer conhecer?</label>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
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
        disabled={!dirty || !nickname.trim() || !gender || seeking.length === 0}
        onClick={save}
      >
        Salvar alterações
      </button>

      <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => nav('/events')}>
        Ver eventos
      </button>

      <button
        className="btn ghost"
        style={{ marginTop: 24, color: 'var(--danger)', borderColor: 'rgba(255,91,91,0.3)' }}
        onClick={() => setShowDeleteConfirm(true)}
      >
        Apagar perfil
      </button>

      {/* In-app delete confirmation */}
      {showDeleteConfirm && (
        <div className="confirm-dialog-bg" onClick={() => setShowDeleteConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
            <h3>Apagar perfil?</h3>
            <p className="muted" style={{ marginTop: 4, marginBottom: 20, fontSize: 14 }}>
              Essa ação não pode ser desfeita. Você sairá do app.
            </p>
            <button
              className="btn danger"
              onClick={async () => {
                try { await activeApi.deleteMe(); } catch { /* proceed regardless */ }
                signOut();
                nav('/', { replace: true });
              }}
            >
              Sim, apagar tudo
            </button>
            <button
              className="btn ghost"
              style={{ marginTop: 10 }}
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
