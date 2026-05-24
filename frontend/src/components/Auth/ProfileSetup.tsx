import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  deletePhoto,
  listUserPhotos,
  pickPhoto,
  uploadProfilePhoto,
  type PhotoSlot,
} from '../../lib/storage';
import { ModerationError } from '../../lib/moderation';
import { useToast } from '../Toast';

const ModerationFeedbackModal = lazy(
  () => import('../Moderation/ModerationFeedbackModal'),
);

const TOTAL_SLOTS = 6;
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
  const [photos, setPhotos] = useState<PhotoSlot[]>(
    Array.from({ length: TOTAL_SLOTS }, (_, i) => ({ slot: i, publicUrl: null })),
  );
  const [bio, setBio] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(50);
  const [maxDistance, setMaxDistance] = useState(50);
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [moderationReasons, setModerationReasons] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshPhotos = useCallback(async (uid: string) => {
    try {
      const slots = await listUserPhotos(uid);
      setPhotos(slots);
    } catch {
      /* keep current slots on transient list error */
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
          refreshPhotos(uid),
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
  }, [nav, refreshPhotos]);

  async function onAddPhoto(slot: number) {
    if (!userId || busySlot !== null) return;
    setBusySlot(slot);
    try {
      const base64 = await pickPhoto();
      if (!base64) return;
      const { publicUrl } = await uploadProfilePhoto(userId, base64, slot);
      const { error } = await supabase
        .from('photos')
        .upsert({ user_id: userId, slot, url: publicUrl }, { onConflict: 'user_id,slot' });
      if (error) throw error;
      await refreshPhotos(userId);
    } catch (e) {
      if (e instanceof ModerationError) {
        setModerationReasons(e.reasons);
      } else {
        toast({ kind: 'info', text: e instanceof Error ? e.message : 'Erro ao enviar foto' });
      }
    } finally {
      setBusySlot(null);
    }
  }

  async function onRemovePhoto(slot: number) {
    if (!userId || busySlot !== null) return;
    if (!confirm('Remover essa foto?')) return;
    setBusySlot(slot);
    try {
      await deletePhoto(userId, slot);
      await supabase.from('photos').delete().eq('user_id', userId).eq('slot', slot);
      await refreshPhotos(userId);
    } catch (e) {
      toast({ kind: 'info', text: e instanceof Error ? e.message : 'Erro ao remover foto' });
    } finally {
      setBusySlot(null);
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

      <label className="muted" style={{ fontSize: 13, marginBottom: 8, display: 'block' }}>
        Fotos ({photos.filter((p) => p.publicUrl).length}/{TOTAL_SLOTS})
      </label>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gridTemplateRows: 'repeat(3, auto)',
          gap: 10,
          marginBottom: 22,
        }}
      >
        {photos.map((p) => (
          <button
            key={p.slot}
            type="button"
            onClick={() => (p.publicUrl ? onRemovePhoto(p.slot) : onAddPhoto(p.slot))}
            disabled={busySlot !== null}
            aria-label={p.publicUrl ? `Remover foto ${p.slot + 1}` : `Adicionar foto ${p.slot + 1}`}
            style={{
              position: 'relative',
              aspectRatio: '3 / 4',
              width: '100%',
              borderRadius: 'var(--radius)',
              backgroundImage: p.publicUrl ? `url("${p.publicUrl}")` : undefined,
              backgroundColor: p.publicUrl ? undefined : 'var(--card)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              border: p.publicUrl ? '2px solid transparent' : '2px dashed rgba(255, 59, 154, 0.35)',
              padding: 0,
              cursor: busySlot === p.slot ? 'wait' : 'pointer',
              opacity: busySlot === p.slot ? 0.5 : 1,
            }}
          >
            {!p.publicUrl && (
              <span style={{ fontSize: 32, color: 'var(--muted)' }}>+</span>
            )}
            {p.publicUrl && (
              <span
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  width: 26,
                  height: 26,
                  borderRadius: 999,
                  background: 'rgba(0,0,0,0.65)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                }}
              >
                ×
              </span>
            )}
          </button>
        ))}
      </div>

      <label className="muted" style={{ fontSize: 13, display: 'block' }}>Bio</label>
      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        rows={3}
        maxLength={MAX_BIO}
        placeholder="Diz algo sobre você"
      />
      <p className="muted" style={{ fontSize: 11, textAlign: 'right' }}>
        {bio.length}/{MAX_BIO}
      </p>

      <label className="muted" style={{ fontSize: 13, marginTop: 14, marginBottom: 8, display: 'block' }}>
        Interesses
      </label>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
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
