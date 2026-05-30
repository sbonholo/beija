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

const MAX_BIO = 280;

type GenderUI = 'woman' | 'man' | 'non-binary' | 'prefer_not_to_say';
type SeekingUI = 'women' | 'men' | 'all';

const ALL_GENDERS: GenderUI[] = ['woman', 'man', 'non-binary', 'prefer_not_to_say'];

const GENDER_OPTIONS: { value: GenderUI; label: string }[] = [
  { value: 'woman', label: 'Mulher' },
  { value: 'man', label: 'Homem' },
  { value: 'non-binary', label: 'Não-binário' },
  { value: 'prefer_not_to_say', label: 'Prefiro não dizer' },
];

const SEEKING_OPTIONS: { value: SeekingUI; label: string }[] = [
  { value: 'women', label: 'Mulheres' },
  { value: 'men', label: 'Homens' },
  { value: 'all', label: 'Todos' },
];

function seekingToArray(s: SeekingUI): string[] {
  if (s === 'women') return ['woman'];
  if (s === 'men') return ['man'];
  return [...ALL_GENDERS];
}

// Inverse of seekingToArray. Used to seed the UI from what's in the DB —
// onboarding writes one of the three canonical shapes, so this just inverts
// it. Any non-matching shape (legacy data) falls back to 'all'.
function arrayToSeeking(arr: string[] | null | undefined): SeekingUI {
  if (!arr || arr.length === 0) return 'all';
  if (arr.length === 1 && arr[0] === 'woman') return 'women';
  if (arr.length === 1 && arr[0] === 'man') return 'men';
  return 'all';
}

function ageFromBirthdate(birthdate: string | null): number | null {
  if (!birthdate) return null;
  const d = new Date(birthdate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
}

export function ProfileSetup() {
  const nav = useNavigate();
  const toast = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  // Bumped after every successful upload/remove so the <img>/background-image
  // refreshes — the storage path is stable (userId/avatar.jpg) so without a
  // cache-buster the URL string is identical and React/CDN both serve stale.
  const [photoBust, setPhotoBust] = useState(0);
  const [name, setName] = useState<string>('');
  const [age, setAge] = useState<number | null>(null);
  const [gender, setGender] = useState<GenderUI | null>(null);
  const [seeking, setSeeking] = useState<SeekingUI>('all');
  const [bio, setBio] = useState('');
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(50);
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
            .select('name, birthdate, gender, interested_in, bio, min_age, max_age')
            .eq('id', uid)
            .maybeSingle(),
          refreshPhoto(uid),
        ]);
        if (cancelled) return;
        if (profile) {
          setName(profile.name ?? '');
          setAge(ageFromBirthdate(profile.birthdate));
          setGender((profile.gender as GenderUI | null) ?? null);
          setSeeking(arrayToSeeking(profile.interested_in));
          setBio(profile.bio ?? '');
          setMinAge(profile.min_age ?? 18);
          setMaxAge(profile.max_age ?? 50);
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
      setPhotoBust((v) => v + 1);
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
      setPhotoBust((v) => v + 1);
    } catch (e) {
      toast({ kind: 'info', text: e instanceof Error ? e.message : 'Erro ao remover foto' });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!userId) return;
    if (!gender) {
      toast({ kind: 'info', text: 'Escolha como você se identifica.' });
      return;
    }
    if (minAge > maxAge) {
      toast({ kind: 'info', text: 'Idade mínima maior que a máxima.' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          gender,
          interested_in: seekingToArray(seeking),
          bio: bio.trim() || null,
          min_age: minAge,
          max_age: maxAge,
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <div className="skeleton" style={{ width: 36, height: 36, borderRadius: '50%' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div className="skeleton circle" style={{ width: 96, height: 96 }} />
          <div className="skeleton" style={{ height: 20, width: 120 }} />
          <div className="skeleton" style={{ height: 14, width: 80 }} />
        </div>
        <div className="skeleton" style={{ height: 56, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 80, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 56, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 56 }} />
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        padding: 'env(safe-area-inset-top) 0 0 0',
        boxSizing: 'border-box',
      }}
    >
      {/* Slim header: just the settings cog */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          padding: 'var(--space-3) var(--space-5) 0',
          flexShrink: 0,
        }}
      >
        <Link
          to="/settings"
          aria-label="Configurações"
          style={{
            display: 'inline-flex',
            width: 36,
            height: 36,
            borderRadius: 'var(--radius-pill)',
            border: '1px solid var(--hairline)',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            color: 'var(--text)',
            textDecoration: 'none',
          }}
        >
          ⚙
        </Link>
      </div>

      {/* HERO — ~1/3 of viewport. Photo as the inviting centerpiece. */}
      <section
        style={{
          flex: '0 0 32vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--space-3)',
          padding: 'var(--space-2) var(--space-5)',
        }}
      >
        <button
          type="button"
          onClick={onChangePhoto}
          disabled={busy}
          aria-label={photoUrl ? 'Trocar foto' : 'Adicionar foto'}
          style={{
            position: 'relative',
            width: 'min(40vw, 168px)',
            aspectRatio: '1 / 1',
            borderRadius: '50%',
            padding: 0,
            backgroundImage: photoUrl ? `url("${photoUrl}${photoBust ? `?v=${photoBust}` : ''}")` : undefined,
            backgroundColor: photoUrl ? undefined : 'var(--card)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            border: photoUrl
              ? '3px solid var(--card-raised)'
              : '2px dashed rgba(255, 59, 154, 0.35)',
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.5 : 1,
            boxShadow: photoUrl
              ? 'var(--shadow-lg), 0 0 32px var(--aurora-glow)'
              : undefined,
          }}
        >
          {!photoUrl && (
            <span style={{ fontSize: 42, color: 'var(--muted)' }}>+</span>
          )}
        </button>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            type="button"
            className="btn ghost"
            onClick={onChangePhoto}
            disabled={busy}
            style={{
              padding: '6px 14px',
              fontSize: 'var(--text-sm)',
              borderRadius: 'var(--radius-pill)',
              maxWidth: 'unset',
              width: 'auto',
              height: 'auto',
            }}
          >
            {photoUrl ? 'Trocar' : 'Adicionar foto'}
          </button>
          {photoUrl && (
            <button
              type="button"
              className="btn ghost"
              onClick={onRemovePhoto}
              disabled={busy}
              style={{
                padding: '6px 14px',
                fontSize: 'var(--text-sm)',
                borderRadius: 'var(--radius-pill)',
                color: 'var(--danger)',
                maxWidth: 'unset',
                width: 'auto',
                height: 'auto',
              }}
            >
              Remover
            </button>
          )}
        </div>

        {name && (
          <div style={{ textAlign: 'center', lineHeight: 1.1 }}>
            <strong style={{ fontSize: 'var(--text-lg)', fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
              {name}
            </strong>
            {age != null && (
              <span style={{ color: 'var(--muted)', fontSize: 'var(--text-base)' }}>
                {' '}· {age}
              </span>
            )}
          </div>
        )}
      </section>

      {/* EDIT BLOCK — fills remaining vertical space, no scroll on 390×844 */}
      <section
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          padding: '0 var(--space-5) var(--space-3)',
        }}
      >
        {/* Gender */}
        <div>
          <div id="profile-gender-label" className="muted" style={{ fontSize: 'var(--text-xs)', marginBottom: 4 }}>
            Você é
          </div>
          <div
            role="group"
            aria-labelledby="profile-gender-label"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
          >
            {GENDER_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`chip ${gender === o.value ? 'selected' : ''}`}
                onClick={() => setGender(o.value)}
                style={{ fontSize: 'var(--text-sm)', minHeight: 30, padding: '4px 12px' }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Seeking */}
        <div>
          <div id="profile-seeking-label" className="muted" style={{ fontSize: 'var(--text-xs)', marginBottom: 4 }}>
            Quer conhecer
          </div>
          <div
            role="group"
            aria-labelledby="profile-seeking-label"
            style={{ display: 'flex', gap: 6 }}
          >
            {SEEKING_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`chip ${seeking === o.value ? 'selected' : ''}`}
                onClick={() => setSeeking(o.value)}
                style={{ flex: 1, fontSize: 'var(--text-sm)', minHeight: 30, padding: '4px 12px' }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Bio — compact 2 rows */}
        <div>
          <label htmlFor="profile-bio" className="muted" style={{ fontSize: 'var(--text-xs)', display: 'block', marginBottom: 4 }}>
            Bio
          </label>
          <textarea
            id="profile-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={2}
            maxLength={MAX_BIO}
            placeholder="Diz algo sobre você"
            style={{ resize: 'none', fontSize: 'var(--text-sm)' }}
          />
        </div>

        {/* Age range */}
        <div>
          <div className="muted" style={{ fontSize: 'var(--text-xs)', marginBottom: 2 }}>
            Idade <span style={{ color: 'var(--text)' }}>{minAge}–{maxAge}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
        </div>

      </section>

      {/* Save bar */}
      <div
        style={{
          flexShrink: 0,
          padding: 'var(--space-3) var(--space-5) calc(var(--space-3) + env(safe-area-inset-bottom))',
          background: 'rgba(10, 0, 20, 0.92)',
          backdropFilter: 'blur(14px)',
          borderTop: '1px solid var(--hairline)',
        }}
      >
        <button className="btn" disabled={saving} onClick={save}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
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
