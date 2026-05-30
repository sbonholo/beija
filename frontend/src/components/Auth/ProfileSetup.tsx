import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  deletePhoto,
  getUserPhoto,
  pickPhoto,
  uploadProfilePhoto,
} from '../../lib/storage';
import { ModerationError } from '../../lib/moderation';
import { useToast } from '../Toast';

const ModerationFeedbackModal = lazy(
  () => import('../Moderation/ModerationFeedbackModal'),
);

const MAX_BIO = 300;

const INTERESTS = [
  'viagem', 'fitness', 'leitura', 'música', 'cinema',
  'gastronomia', 'arte', 'esportes', 'dança', 'fotografia',
  'natureza', 'animais', 'gaming', 'tecnologia', 'moda',
  'espiritualidade', 'política', 'voluntariado', 'festas', 'conversas',
] as const;

export function ProfileSetup() {
  const nav = useNavigate();
  const toast = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(50);
  const [maxDistance, setMaxDistance] = useState(50);
  const [busy, setBusy] = useState(false);
  const [moderationReasons, setModerationReasons] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshPhoto = useCallback(async (uid: string) => {
    try {
      const { publicUrl } = await getUserPhoto(uid);
      setPhotoUrl(publicUrl);
    } catch {
      /* keep current photo on transient list error */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) {
          nav('/', { replace: true });
          return;
        }
        if (cancelled) return;
        setUserId(uid);

        const [{ data: profile }] = await Promise.all([
          supabase
            .from('profiles')
            .select('bio, min_age, max_age, max_distance_km')
            .eq('id', uid)
            .maybeSingle(),
          refreshPhoto(uid),
        ]);
        if (cancelled) return;
        if (profile) {
          setBio(profile.bio ?? '');
          setMinAge(profile.min_age ?? 18);
          setMaxAge(profile.max_age ?? 50);
          setMaxDistance(profile.max_distance_km ?? 50);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nav, refreshPhoto]);

  async function onChangePhoto() {
    if (!userId || busy) return;
    setBusy(true);
    try {
      const base64 = await pickPhoto();
      if (!base64) return;
      const { publicUrl } = await uploadProfilePhoto(userId, base64);
      const { error } = await supabase
        .from('photos')
        .upsert({ user_id: userId, url: publicUrl }, { onConflict: 'user_id' });
      if (error) throw error;
      await refreshPhoto(userId);
    } catch (e) {
      if (e instanceof ModerationError) {
        setModerationReasons(e.reasons);
      } else {
        toast({ kind: 'info', text: e instanceof Error ? e.message : 'Erro ao enviar foto' });
      }
    } finally {
      setBusy(false);
    }
  }

  async function onRemovePhoto() {
    if (!userId || busy) return;
    if (!confirm('Remover sua foto?')) return;
    setBusy(true);
    try {
      await deletePhoto(userId);
      await supabase.from('photos').delete().eq('user_id', userId);
      await refreshPhoto(userId);
    } catch (e) {
      toast({ kind: 'info', text: e instanceof Error ? e.message : 'Erro ao remover foto' });
    } finally {
      setBusy(false);
    }
  }

  function toggleInterest(interest: string) {
    setInterests((cur) =>
      cur.includes(interest) ? cur.filter((x) => x !== interest) : [...cur, interest],
    );
  }

  async function save() {
    if (!userId) return;
    if (minAge > maxAge) {
      toast({ kind: 'info', text: 'Idade mínima maior que a máxima.' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          bio: bio.trim() || null,
          min_age: minAge,
          max_age: maxAge,
          max_distance_km: maxDistance,
          last_active_at: new Date().toISOString(),
        })
        .eq('id', userId);
      if (error) throw error;
      toast({ kind: 'info', text: 'Perfil atualizado.' });
    } catch (e) {
      toast({ kind: 'info', text: e instanceof Error ? e.message : 'Erro ao salvar' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="screen">
        <p className="muted">Carregando perfil...</p>
      </div>
    );
  }

  return (
    <div className="screen" style={{ paddingBottom: 120 }}>
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Seu perfil</h2>
        <Link
          to="/settings"
          aria-label="Configurações"
          style={{
            display: 'inline-flex',
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.12)',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            color: 'var(--fg, #fff)',
            textDecoration: 'none',
          }}
        >
          ⚙
        </Link>
      </div>

      <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
        Sua foto
      </div>
      <div
        style={{
          display: 'flex',
          gap: 14,
          alignItems: 'center',
          marginBottom: 22,
        }}
      >
        <button
          type="button"
          onClick={onChangePhoto}
          disabled={busy}
          aria-label={photoUrl ? 'Trocar foto' : 'Adicionar foto'}
          style={{
            position: 'relative',
            width: 120,
            height: 120,
            flexShrink: 0,
            borderRadius: '50%',
            padding: 0,
            backgroundImage: photoUrl ? `url("${photoUrl}")` : undefined,
            backgroundColor: photoUrl ? undefined : 'var(--card)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            border: photoUrl ? '2px solid transparent' : '2px dashed rgba(255, 59, 154, 0.35)',
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.5 : 1,
            boxShadow: photoUrl ? 'var(--shadow)' : undefined,
          }}
        >
          {!photoUrl && (
            <span style={{ fontSize: 36, color: 'var(--muted)' }}>+</span>
          )}
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            className="btn ghost"
            onClick={onChangePhoto}
            disabled={busy}
            style={{ padding: '8px 14px', fontSize: 13 }}
          >
            {photoUrl ? 'Trocar foto' : 'Adicionar foto'}
          </button>
          {photoUrl && (
            <button
              type="button"
              className="btn ghost"
              onClick={onRemovePhoto}
              disabled={busy}
              style={{ padding: '8px 14px', fontSize: 13, color: 'var(--danger)' }}
            >
              Remover
            </button>
          )}
        </div>
      </div>

      <label htmlFor="profile-bio" className="muted" style={{ fontSize: 13, display: 'block' }}>Bio</label>
      <textarea
        id="profile-bio"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        rows={3}
        maxLength={MAX_BIO}
        placeholder="Diz algo sobre você"
      />
      <p className="muted" style={{ fontSize: 11, textAlign: 'right' }}>
        {bio.length}/{MAX_BIO}
      </p>

      <div id="profile-interests-label" className="muted" style={{ fontSize: 13, marginTop: 14, marginBottom: 8 }}>
        Interesses
      </div>
      <div className="row" role="group" aria-labelledby="profile-interests-label" style={{ flexWrap: 'wrap', gap: 8 }}>
        {INTERESTS.map((it) => (
          <button
            key={it}
            type="button"
            className={`chip ${interests.includes(it) ? 'selected' : ''}`}
            onClick={() => toggleInterest(it)}
          >
            {it}
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
        (Interesses ainda não são salvos no servidor — campo virá num update do schema.)
      </p>

      <label className="muted" style={{ fontSize: 13, marginTop: 18, display: 'block' }}>
        Faixa etária: <span style={{ color: 'var(--text)' }}>{minAge} – {maxAge}</span>
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
        <input
          type="range"
          min={18}
          max={99}
          value={minAge}
          onChange={(e) => setMinAge(Math.min(parseInt(e.target.value, 10), maxAge))}
          aria-label="Idade mínima"
        />
        <input
          type="range"
          min={18}
          max={99}
          value={maxAge}
          onChange={(e) => setMaxAge(Math.max(parseInt(e.target.value, 10), minAge))}
          aria-label="Idade máxima"
        />
      </div>

      <label className="muted" style={{ fontSize: 13, marginTop: 18, display: 'block' }}>
        Distância máxima: <span style={{ color: 'var(--text)' }}>{maxDistance} km</span>
      </label>
      <input
        type="range"
        min={1}
        max={100}
        value={maxDistance}
        onChange={(e) => setMaxDistance(parseInt(e.target.value, 10))}
        style={{ marginTop: 6 }}
        aria-label="Distância máxima em km"
      />

      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '12px 18px calc(12px + env(safe-area-inset-bottom))',
          background: 'rgba(10, 0, 20, 0.92)',
          backdropFilter: 'blur(14px)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: '100%', maxWidth: 540 }}>
          <button className="btn" disabled={saving} onClick={save}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
      {moderationReasons && (
        <Suspense fallback={null}>
          <ModerationFeedbackModal
            reasons={moderationReasons}
            onClose={() => setModerationReasons(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
