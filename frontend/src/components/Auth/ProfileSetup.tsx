import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import {
  deletePhoto,
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

interface PhotoSlot {
  url: string | null;
  bust: number;
}

export function ProfileSetup() {
  const nav = useNavigate();
  const toast = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  // Two photo slots: index 0 = primary, index 1 = secondary.
  // `bust` is bumped after each upload/remove to force a CDN re-fetch on the
  // stable storage URL.
  const [photos, setPhotos] = useState<[PhotoSlot, PhotoSlot]>([
    { url: null, bust: 0 },
    { url: null, bust: 0 },
  ]);
  const [name, setName] = useState<string>('');
  const [age, setAge] = useState<number | null>(null);
  const [gender, setGender] = useState<GenderUI | null>(null);
  const [seeking, setSeeking] = useState<SeekingUI>('all');
  const [bio, setBio] = useState('');
  const [minAge, setMinAge] = useState(18);
  const [maxAge, setMaxAge] = useState(50);
  // slot currently being uploaded/removed — prevents double-taps
  const [busy, setBusy] = useState<0 | 1 | null>(null);
  // inline confirm-before-delete state (replaces native confirm() dialog)
  const [removeConfirm, setRemoveConfirm] = useState<0 | 1 | null>(null);
  const [moderationReasons, setModerationReasons] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshPhotos = useCallback(async (uid: string) => {
    try {
      const { data: rows } = await supabase
        .from('photos')
        .select('slot, url')
        .eq('user_id', uid)
        .order('slot', { ascending: true });
      setPhotos((prev) => {
        const next: [PhotoSlot, PhotoSlot] = [
          { url: prev[0].url, bust: prev[0].bust },
          { url: prev[1].url, bust: prev[1].bust },
        ];
        for (const row of rows ?? []) {
          const s = row.slot as 0 | 1;
          if (s === 0 || s === 1) next[s] = { url: row.url as string, bust: prev[s].bust };
        }
        return next;
      });
    } catch {
      /* keep current state on transient DB error */
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
          refreshPhotos(uid),
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
  }, [nav, refreshPhotos]);

  async function onChangePhoto(slot: 0 | 1) {
    if (!userId || busy !== null) return;
    setBusy(slot);
    try {
      const base64 = await pickPhoto();
      if (!base64) return;
      const { publicUrl } = await uploadProfilePhoto(userId, base64, slot);
      const { error } = await supabase
        .from('photos')
        .upsert({ user_id: userId, url: publicUrl, slot }, { onConflict: 'user_id,slot' });
      if (error) throw error;
      setPhotos((prev) => {
        const next: [PhotoSlot, PhotoSlot] = [...prev] as [PhotoSlot, PhotoSlot];
        next[slot] = { url: publicUrl, bust: prev[slot].bust + 1 };
        return next;
      });
    } catch (e) {
      if (e instanceof ModerationError) {
        setModerationReasons(e.reasons);
      } else {
        toast({ kind: 'info', text: e instanceof Error ? e.message : 'Erro ao enviar foto' });
      }
    } finally {
      setBusy(null);
    }
  }

  async function onRemovePhoto(slot: 0 | 1) {
    if (!userId || busy !== null) return;
    if (removeConfirm !== slot) {
      setRemoveConfirm(slot);
      setTimeout(() => setRemoveConfirm((c) => (c === slot ? null : c)), 3000);
      return;
    }
    setRemoveConfirm(null);
    setBusy(slot);
    try {
      await deletePhoto(userId, slot);
      await supabase.from('photos').delete().eq('user_id', userId).eq('slot', slot);
      setPhotos((prev) => {
        const next: [PhotoSlot, PhotoSlot] = [...prev] as [PhotoSlot, PhotoSlot];
        next[slot] = { url: null, bust: prev[slot].bust + 1 };
        return next;
      });
    } catch (e) {
      toast({ kind: 'info', text: e instanceof Error ? e.message : 'Erro ao remover foto' });
    } finally {
      setBusy(null);
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
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 12 }}>
          <div className="skeleton circle" style={{ width: 96, height: 96 }} />
          <div className="skeleton circle" style={{ width: 96, height: 96 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 24 }}>
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
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
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

      {/* HERO — two photo slots side by side, then name/age. */}
      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-3)',
          padding: 'var(--space-3) var(--space-5) var(--space-2)',
        }}
      >
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {([0, 1] as const).map((slot) => {
            const { url, bust } = photos[slot];
            const isBusy = busy === slot;
            const imgSrc = url ? `${url}${bust ? `?v=${bust}` : ''}` : undefined;
            return (
              <div key={slot} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => void onChangePhoto(slot)}
                  disabled={busy !== null}
                  aria-label={url ? `Trocar foto ${slot + 1}` : slot === 0 ? 'Adicionar foto principal' : 'Adicionar segunda foto'}
                  style={{
                    width: 'min(36vw, 140px)',
                    aspectRatio: '1 / 1',
                    borderRadius: slot === 0 ? '50%' : '18px',
                    padding: 0,
                    backgroundImage: imgSrc ? `url("${imgSrc}")` : undefined,
                    backgroundColor: imgSrc ? undefined : 'var(--card)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    border: imgSrc
                      ? `${slot === 0 ? 3 : 2}px solid var(--card-raised)`
                      : '2px dashed rgba(255, 59, 154, 0.35)',
                    cursor: busy !== null ? 'wait' : 'pointer',
                    opacity: isBusy ? 0.5 : 1,
                    boxShadow: imgSrc && slot === 0
                      ? 'var(--shadow-lg), 0 0 32px var(--aurora-glow)'
                      : undefined,
                    position: 'relative',
                  }}
                >
                  {!imgSrc && (
                    <span style={{ fontSize: slot === 0 ? 40 : 32, color: 'var(--muted)' }}>+</span>
                  )}
                  {slot === 1 && !imgSrc && (
                    <span
                      style={{
                        position: 'absolute',
                        bottom: -6,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        fontSize: 10,
                        color: 'var(--muted)',
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                      }}
                    >
                      opcional
                    </span>
                  )}
                </button>
                {url && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => void onChangePhoto(slot)}
                      disabled={busy !== null}
                      style={{ padding: '4px 10px', fontSize: 11, borderRadius: 'var(--radius-pill)', maxWidth: 'unset', width: 'auto', height: 'auto' }}
                    >
                      Trocar
                    </button>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => void onRemovePhoto(slot)}
                      disabled={busy !== null}
                      style={{
                        padding: '4px 10px', fontSize: 11, borderRadius: 'var(--radius-pill)',
                        maxWidth: 'unset', width: 'auto', height: 'auto',
                        color: 'var(--danger)',
                        borderColor: removeConfirm === slot ? 'var(--danger)' : undefined,
                        background: removeConfirm === slot ? 'rgba(255,69,69,0.12)' : undefined,
                        fontWeight: removeConfirm === slot ? 700 : undefined,
                      }}
                    >
                      {removeConfirm === slot ? 'Confirmar?' : '✕'}
                    </button>
                  </div>
                )}
                {!url && slot === 0 && (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => void onChangePhoto(0)}
                    disabled={busy !== null}
                    style={{ padding: '4px 10px', fontSize: 11, borderRadius: 'var(--radius-pill)', maxWidth: 'unset', width: 'auto', height: 'auto' }}
                  >
                    Adicionar foto
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: 'center', lineHeight: 1.1 }}>
          <strong style={{ fontSize: 'var(--text-lg)', fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
            {name || <span style={{ color: 'var(--muted)', fontWeight: 400 }}>Seu nome</span>}
          </strong>
          {name && age != null && (
            <span style={{ color: 'var(--muted)', fontSize: 'var(--text-base)' }}>
              {' '}· {age}
            </span>
          )}
        </div>
      </section>

      {/* EDIT BLOCK — natural flow, scrolls when content exceeds viewport.
       * The Save bar below is position:sticky so it always reaches the
       * bottom; padding-bottom here keeps the last input (age slider)
       * tappable above the sticky bar. */}
      <section
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          padding: '0 var(--space-5) calc(var(--space-5) + 72px)',
        }}
      >
        {/* Gender */}
        <div>
          <div id="profile-gender-label" style={{ fontSize: 13, color: 'var(--text)', opacity: 0.65, marginBottom: 6, fontWeight: 500 }}>
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
          <div id="profile-seeking-label" style={{ fontSize: 13, color: 'var(--text)', opacity: 0.65, marginBottom: 6, fontWeight: 500 }}>
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
          <label htmlFor="profile-bio" style={{ fontSize: 13, color: 'var(--text)', opacity: 0.65, display: 'block', marginBottom: 6, fontWeight: 500 }}>
            Bio
          </label>
          <textarea
            id="profile-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            maxLength={MAX_BIO}
            placeholder="Diz algo sobre você"
            style={{ resize: 'none', fontSize: 'var(--text-sm)' }}
          />
        </div>

        {/* Age range */}
        <div>
          <div style={{ fontSize: 13, color: 'var(--text)', opacity: 0.65, marginBottom: 6, fontWeight: 500 }}>
            Idade <span style={{ color: 'var(--text)', opacity: 1 }}>{minAge}–{maxAge}</span>
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

      {/* Save bar — sticky so it always sits at the viewport bottom but
       * the page can scroll above it (otherwise the age slider would
       * overlap the button on shorter viewports). */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          zIndex: 5,
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
