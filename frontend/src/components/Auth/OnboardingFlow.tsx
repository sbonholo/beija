import { Suspense, lazy, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { pickPhoto, uploadProfilePhoto } from '../../lib/storage';
import { ModerationError } from '../../lib/moderation';
import { track } from '../../lib/analytics';
import { useToast } from '../Toast';

const ModerationFeedbackModal = lazy(
  () => import('../Moderation/ModerationFeedbackModal'),
);

type GenderUI = 'woman' | 'man' | 'other';
type SeekingUI = 'women' | 'men' | 'all';

const ALL_GENDERS = ['woman', 'man', 'non-binary', 'other'] as const;

function seekingToArray(s: SeekingUI): string[] {
  if (s === 'women') return ['woman'];
  if (s === 'men') return ['man'];
  return [...ALL_GENDERS];
}

function calcAge(birthdate: string): number | null {
  if (!birthdate) return null;
  const d = new Date(birthdate);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export function OnboardingFlow() {
  const nav = useNavigate();
  const toast = useToast();

  const [name, setName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [gender, setGender] = useState<GenderUI | null>(null);
  const [seeking, setSeeking] = useState<SeekingUI | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [moderationReasons, setModerationReasons] = useState<string[] | null>(null);

  const maxBirthdate = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().slice(0, 10);
  })();

  const ageValid = (() => {
    const age = calcAge(birthdate);
    return age !== null && age >= 18 && age <= 120;
  })();

  const canFinish =
    name.trim().length >= 2 &&
    ageValid &&
    gender !== null &&
    seeking !== null &&
    photoBase64 !== null &&
    agreed;

  async function onPickPhoto() {
    const base64 = await pickPhoto();
    if (!base64) return;
    setPhotoBase64(base64);
    setPhotoPreview(`data:image/jpeg;base64,${base64}`);
  }

  async function finish() {
    if (!canFinish || !gender || !seeking || !photoBase64) return;
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error('not_authenticated');

      const dbGender = gender === 'other' ? 'other' : gender;

      const { error: profileErr } = await supabase.from('profiles').upsert({
        id: userId,
        name: name.trim(),
        birthdate,
        gender: dbGender,
        interested_in: seekingToArray(seeking),
        bio: bio.trim() || null,
        last_active_at: new Date().toISOString(),
      });
      if (profileErr) throw profileErr;

      const { publicUrl } = await uploadProfilePhoto(userId, photoBase64, 0);
      const { error: photoRowErr } = await supabase.from('photos').upsert(
        { user_id: userId, slot: 0, url: publicUrl },
        { onConflict: 'user_id,slot' },
      );
      if (photoRowErr) throw photoRowErr;

      track('profile_setup_completed');
      track('signup_completed');
      nav('/discover', { replace: true });
    } catch (e) {
      if (e instanceof ModerationError) {
        setModerationReasons(e.reasons);
      } else {
        toast({ kind: 'info', text: e instanceof Error ? e.message : 'Erro ao salvar perfil' });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen" style={{ paddingBottom: 40 }}>
      <h2 style={{ marginTop: 12, marginBottom: 20 }}>Vamos te conhecer</h2>

      <label htmlFor="onb-name" className="muted" style={{ fontSize: 13 }}>Seu nome</label>
      <input
        id="onb-name"
        placeholder="Como te chamam"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        autoComplete="given-name"
      />

      <label htmlFor="onb-birthdate" className="muted" style={{ fontSize: 13, marginTop: 14, display: 'block' }}>
        Data de nascimento
      </label>
      <input
        id="onb-birthdate"
        type="date"
        max={maxBirthdate}
        value={birthdate}
        onChange={(e) => setBirthdate(e.target.value)}
        autoComplete="bday"
      />
      {birthdate && !ageValid && (
        <p style={{ fontSize: 11, marginTop: 4, color: 'var(--pink)' }}>
          Você precisa ter entre 18 e 120 anos para continuar.
        </p>
      )}

      <div id="onb-gender-label" className="muted" style={{ fontSize: 13, marginTop: 18, marginBottom: 8 }}>Você é</div>
      <div className="row" role="group" aria-labelledby="onb-gender-label" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className={`chip ${gender === 'woman' ? 'selected' : ''}`} onClick={() => setGender('woman')}>♀️ Mulher</button>
        <button type="button" className={`chip ${gender === 'man' ? 'selected' : ''}`} onClick={() => setGender('man')}>♂️ Homem</button>
        <button type="button" className={`chip ${gender === 'other' ? 'selected' : ''}`} onClick={() => setGender('other')}>✨ Outro</button>
      </div>

      <div id="onb-seeking-label" className="muted" style={{ fontSize: 13, marginTop: 18, marginBottom: 8 }}>Quer conhecer</div>
      <div className="row" role="group" aria-labelledby="onb-seeking-label" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className={`chip ${seeking === 'women' ? 'selected' : ''}`} onClick={() => setSeeking('women')}>♀️ Mulheres</button>
        <button type="button" className={`chip ${seeking === 'men' ? 'selected' : ''}`} onClick={() => setSeeking('men')}>♂️ Homens</button>
        <button type="button" className={`chip ${seeking === 'all' ? 'selected' : ''}`} onClick={() => setSeeking('all')}>💫 Todos</button>
      </div>

      <div id="onb-photo-label" className="muted" style={{ fontSize: 13, marginTop: 18, marginBottom: 8 }}>Foto principal</div>
      <button
        type="button"
        onClick={onPickPhoto}
        aria-labelledby="onb-photo-label"
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          maxWidth: 280,
          margin: '0 auto 12px',
          padding: 0,
          borderRadius: 'var(--radius)',
          backgroundImage: photoPreview ? `url("${photoPreview}")` : undefined,
          backgroundColor: photoPreview ? undefined : '#1c0a2b',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          border: '2px dashed rgba(255, 59, 154, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: '#fff',
          boxShadow: photoPreview ? 'var(--shadow)' : undefined,
        }}
      >
        {!photoPreview && <span style={{ fontSize: 48 }} aria-hidden>📷</span>}
      </button>

      <label htmlFor="onb-bio" className="muted" style={{ fontSize: 13, marginTop: 10, display: 'block' }}>Bio (opcional)</label>
      <textarea
        id="onb-bio"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        rows={3}
        maxLength={150}
        placeholder="Diz algo sobre você"
      />
      <p className="muted" style={{ fontSize: 11, textAlign: 'right' }}>{bio.length}/150</p>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 20, cursor: 'pointer', fontSize: 13, lineHeight: 1.4 }}>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          style={{ marginTop: 2, flexShrink: 0, accentColor: 'var(--pink)' }}
        />
        <span className="muted">
          Ao continuar, você confirma que tem 18+ e aceita os{' '}
          <Link to="/terms" style={{ color: 'var(--pink)', textDecoration: 'none' }}>Termos</Link>
          {' '}e{' '}
          <Link to="/privacy" style={{ color: 'var(--pink)', textDecoration: 'none' }}>Privacidade</Link>.
        </span>
      </label>

      <button
        className="btn"
        style={{ marginTop: 18 }}
        disabled={!canFinish || saving}
        onClick={finish}
      >
        {saving ? 'Salvando...' : 'Completar perfil 🔥'}
      </button>

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
