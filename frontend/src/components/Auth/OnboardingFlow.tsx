import { Suspense, lazy, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { pickPhoto, uploadProfilePhoto } from '../../lib/storage';
import { ModerationError } from '../../lib/moderation';
import { track } from '../../lib/analytics';
import { useToast } from '../Toast';

const ModerationFeedbackModal = lazy(
  () => import('../Moderation/ModerationFeedbackModal'),
);

type GenderUI = 'woman' | 'man' | 'non-binary' | 'prefer_not_to_say';
type SeekingUI = 'women' | 'men' | 'all';

const ALL_GENDERS = ['woman', 'man', 'non-binary', 'prefer_not_to_say'] as const;

const GENDER_OPTIONS: { value: GenderUI; label: string }[] = [
  { value: 'woman', label: 'Mulher' },
  { value: 'man', label: 'Homem' },
  { value: 'non-binary', label: 'Não-binário' },
  { value: 'prefer_not_to_say', label: 'Prefiro não dizer' },
];

const SEEKING_OPTIONS: { value: SeekingUI; label: string }[] = [
  { value: 'women', label: '♀ Mulheres' },
  { value: 'men', label: '♂ Homens' },
  { value: 'all', label: '✨ Todos' },
];

function seekingToArray(s: SeekingUI): string[] {
  if (s === 'women') return ['woman'];
  if (s === 'men') return ['man'];
  return [...ALL_GENDERS];
}

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** Days in a given 1-based month / full year (handles leap years). */
function daysInMonth(year: number, month: number): number {
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
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
  const [bDay, setBDay] = useState('');
  const [bMonth, setBMonth] = useState('');
  const [bYear, setBYear] = useState('');
  const [gender, setGender] = useState<GenderUI | null>(null);
  const [seeking, setSeeking] = useState<SeekingUI | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [moderationReasons, setModerationReasons] = useState<string[] | null>(null);

  const currentYear = new Date().getFullYear();
  const maxYear = currentYear - 18; // at most ~18 by year; exact check below
  const minYear = currentYear - 120;
  const maxDayForMonth = daysInMonth(Number(bYear), Number(bMonth));

  // Compose the stored ISO value (yyyy-mm-dd) from the three selects. The DB
  // value stays ISO; entry/display format is the only thing that changed.
  useEffect(() => {
    if (bDay && bMonth && bYear) {
      setBirthdate(`${bYear}-${bMonth}-${bDay}`);
    } else {
      setBirthdate('');
    }
  }, [bDay, bMonth, bYear]);

  // Clear an out-of-range day when month/year shrinks the valid range
  // (e.g. 31 selected, then February chosen).
  useEffect(() => {
    if (bDay && Number(bDay) > maxDayForMonth) setBDay('');
  }, [bDay, maxDayForMonth]);

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

  // First missing requirement, surfaced under the disabled CTA so the user
  // knows what's left instead of staring at a greyed-out button.
  const missingHint = (() => {
    if (name.trim().length < 2) return 'Digite seu nome';
    if (!ageValid) return 'Informe sua data de nascimento';
    if (gender === null) return 'Selecione quem você é';
    if (seeking === null) return 'Selecione quem quer conhecer';
    if (photoBase64 === null) return 'Adicione uma foto';
    if (!agreed) return 'Aceite os termos';
    return null;
  })();

  async function onPickPhoto() {
    try {
      const base64 = await pickPhoto();
      if (!base64) return;
      setPhotoBase64(base64);
      setPhotoPreview(`data:image/jpeg;base64,${base64}`);
    } catch (e) {
      toast({ kind: 'info', text: e instanceof Error ? e.message : 'Erro ao abrir a câmera' });
    }
  }

  async function finish() {
    if (!canFinish || !gender || !seeking || !photoBase64) return;
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error('not_authenticated');

      const { error: profileErr } = await supabase.from('profiles').upsert({
        id: userId,
        name: name.trim(),
        birthdate,
        gender,
        interested_in: seekingToArray(seeking),
        bio: bio.trim() || null,
        last_active_at: new Date().toISOString(),
      });
      if (profileErr) throw profileErr;

      const { publicUrl } = await uploadProfilePhoto(userId, photoBase64);
      const { error: photoRowErr } = await supabase.from('photos').upsert(
        { user_id: userId, url: publicUrl },
        { onConflict: 'user_id' },
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

  const labelStyle = { fontSize: 12, marginTop: 12, marginBottom: 6 } as const;

  return (
    <div
      style={{
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        padding:
          'max(env(safe-area-inset-top), 14px) 18px max(env(safe-area-inset-bottom), 14px)',
        boxSizing: 'border-box',
      }}
    >
      <h2 style={{ margin: '2px 0 12px', fontSize: 22 }}>Vamos te conhecer</h2>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <button
          type="button"
          onClick={onPickPhoto}
          aria-label="Adicionar foto principal"
          style={{
            width: 88,
            height: 88,
            flexShrink: 0,
            borderRadius: '50%',
            padding: 0,
            backgroundImage: photoPreview ? `url("${photoPreview}")` : undefined,
            backgroundColor: photoPreview ? undefined : '#1c0a2b',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            border: '2px dashed rgba(255, 59, 154, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#fff',
            boxShadow: photoPreview ? 'var(--shadow)' : undefined,
          }}
        >
          {!photoPreview && <span style={{ fontSize: 30 }} aria-hidden>📷</span>}
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            id="onb-name"
            placeholder="Seu nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            autoComplete="given-name"
            style={{ marginBottom: 8 }}
          />
          <div
            role="group"
            aria-label="Data de nascimento"
            style={{ display: 'flex', gap: 6 }}
          >
            <select
              aria-label="Dia"
              value={bDay}
              onChange={(e) => setBDay(e.target.value)}
              style={{ flex: '0 0 30%' }}
            >
              <option value="" disabled>Dia</option>
              {Array.from({ length: maxDayForMonth }, (_, i) => {
                const d = String(i + 1).padStart(2, '0');
                return <option key={d} value={d}>{i + 1}</option>;
              })}
            </select>
            <select
              aria-label="Mês"
              value={bMonth}
              onChange={(e) => setBMonth(e.target.value)}
              style={{ flex: 1 }}
            >
              <option value="" disabled>Mês</option>
              {MONTHS_PT.map((label, i) => {
                const m = String(i + 1).padStart(2, '0');
                return <option key={m} value={m}>{label}</option>;
              })}
            </select>
            <select
              aria-label="Ano"
              value={bYear}
              onChange={(e) => setBYear(e.target.value)}
              style={{ flex: '0 0 30%' }}
            >
              <option value="" disabled>Ano</option>
              {Array.from({ length: maxYear - minYear + 1 }, (_, i) => {
                const y = String(maxYear - i);
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
          </div>
        </div>
      </div>
      {birthdate && !ageValid && (
        <p style={{ fontSize: 11, marginTop: 6, color: 'var(--pink)' }}>
          Você precisa ter entre 18 e 120 anos para continuar.
        </p>
      )}

      <div id="onb-gender-label" className="muted" style={labelStyle}>Você é</div>
      <div className="row" role="group" aria-labelledby="onb-gender-label" style={{ flexWrap: 'wrap', gap: 8 }}>
        {GENDER_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`chip ${gender === o.value ? 'selected' : ''}`}
            onClick={() => setGender(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div id="onb-seeking-label" className="muted" style={labelStyle}>Quer conhecer</div>
      <div className="row" role="group" aria-labelledby="onb-seeking-label" style={{ flexWrap: 'wrap', gap: 8 }}>
        {SEEKING_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`chip ${seeking === o.value ? 'selected' : ''}`}
            onClick={() => setSeeking(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>

      <textarea
        id="onb-bio"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        rows={2}
        maxLength={150}
        placeholder="Bio (opcional)"
        aria-label="Bio"
        style={{ marginTop: 12, resize: 'none' }}
      />

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          style={{ width: 20, height: 20, flexShrink: 0, accentColor: 'var(--pink)' }}
        />
        <span className="muted" style={{ fontSize: 12, lineHeight: 1.3 }}>
          Tenho 18+ e aceito os{' '}
          <Link to="/terms" onClick={(e) => e.stopPropagation()} style={{ color: 'var(--pink)', textDecoration: 'none' }}>Termos</Link>
          {' '}e{' '}
          <Link to="/privacy" onClick={(e) => e.stopPropagation()} style={{ color: 'var(--pink)', textDecoration: 'none' }}>Privacidade</Link>.
        </span>
      </label>

      <button
        className="btn"
        style={{ marginTop: 'auto', marginBottom: 4 }}
        disabled={!canFinish || saving}
        onClick={finish}
      >
        {saving ? 'Salvando...' : 'Completar perfil 🔥'}
      </button>
      {!canFinish && !saving && missingHint && (
        <p
          aria-live="polite"
          className="muted"
          style={{ fontSize: 12, textAlign: 'center', margin: '2px 0 4px' }}
        >
          {missingHint}
        </p>
      )}

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
