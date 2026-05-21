import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../state/AuthContext';
import { BottomNav } from '../components/BottomNav';

export function Profile() {
  const { user, setUser, signOut } = useAuth();
  const nav = useNavigate();
  const [bio, setBio] = useState(user?.bio || '');
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const { user } = await api.updateMe({ nickname, bio });
      setUser(user);
    } finally {
      setSaving(false);
    }
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const { photoUrl } = await api.uploadPhoto(f);
    if (user) setUser({ ...user, photoUrl });
  }

  return (
    <div className="screen">
      <div className="header"><h2>Seu perfil</h2></div>

      <div className="card" style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 18 }}>
        <div
          className="avatar"
          style={{ width: 80, height: 80, backgroundImage: user?.photoUrl ? `url("${user.photoUrl}")` : undefined }}
        />
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: 18 }}>{user?.nickname || '—'}</strong>
          <div className="muted" style={{ fontSize: 13 }}>{user?.phone}</div>
          <label className="chip" style={{ marginTop: 8, display: 'inline-flex', cursor: 'pointer' }}>
            Trocar foto
            <input type="file" accept="image/*" onChange={onPhoto} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      <label className="muted" style={{ fontSize: 13 }}>Apelido</label>
      <input value={nickname} maxLength={30} onChange={(e) => setNickname(e.target.value)} />

      <label className="muted" style={{ fontSize: 13, marginTop: 12, display: 'block' }}>Bio</label>
      <textarea value={bio} maxLength={200} rows={3} onChange={(e) => setBio(e.target.value)} />

      <button className="btn" style={{ marginTop: 16 }} disabled={saving} onClick={save}>
        {saving ? 'Salvando...' : 'Salvar'}
      </button>

      <button
        className="btn ghost"
        style={{ marginTop: 24 }}
        onClick={() => {
          signOut();
          nav('/', { replace: true });
        }}
      >
        Sair
      </button>

      <BottomNav />
    </div>
  );
}
