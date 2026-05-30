import { Suspense, lazy, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { pickPhoto, uploadProfilePhoto } from '../../lib/storage';
import { ModerationError } from '../../lib/moderation';
import { track } from '../../lib/analytics';
import { useAuth } from '../../state/AuthContext';
import { useToast } from '../Toast';

const ModerationFeedbackModal = lazy(
  () => import('../Moderation/ModerationFeedbackModal'),
);

type GenderUI = 'woman' | 'man' | 'non-binary' | 'prefer_not_to_say';
type SeekingUI = 'women' | 'men' | 'all';

const ALL_GENDERS = ['woman', 'man', 'non-binary', 'prefer_not_to_say'] as const;

const GENDER_OPTIONS: { value: GenderUI; label: string; icon: string }[] = [
  { value: 'woman',             label: 'Mulher',           icon: '♀' },
  { value: 'man',               label: 'Homem',            icon: '♂' },
  { value: 'non-binary',        label: 'Não-binário',      icon: '⚧' },
  { value: 'prefer_not_to_say', label: 'Prefiro não dizer', icon: '·' },
];

const SEEKING_OPTIONS: { value: SeekingUI; label: string; icon: string }[] = [
  { value: 'women', label: 'Mulheres', icon: '♀' },
  { value: 'men',   label: 'Homens',   icon: '♂' },
  { value: 'all',   label: 'Todos',    icon: '✨' },
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
  const { refresh } = useAuth();

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
  const maxYear = currentYear - 18;
  const minYear = currentYear - 120;
  const maxDayForMonth = daysInMonth(Number(bYear), Number(bMonth));

  useEffect(() => {
    if (bDay && bMonth && bYear) {
      setBirthdate(`${bYear}-${bMonth}-${bDay}`);
    } else {
      setBirthdate('');
    }
  }, [bDay, bMonth, bYear]);

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

  const missingHint = (() => {
    if (photoBase64 === null) return 'Toque na foto para começar';
    if (name.trim().length < 2) return 'Digite seu nome';
    if (!ageValid) return 'Informe sua data de nascimento';
    if (gender === null) return 'Como você se identifica?';
    if (seeking === null) return 'Quem você quer conhecer?';
    if (!agreed) return 'Aceite os termos pra continuar';
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

      const { error: profileErr } = await supabase.from('profiles').upsert(
        {
          id: userId,
          name: name.trim(),
          birthdate,
          gender,
          interested_in: seekingToArray(seeking),
          bio: bio.trim() || null,
          last_active_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      );
      if (profileErr) throw profileErr;

      const { publicUrl } = await uploadProfilePhoto(userId, photoBase64, 0);
      const { error: photoRowErr } = await supabase.from('photos').upsert(
        { user_id: userId, url: publicUrl, slot: 0 },
        { onConflict: 'user_id,slot' },
      );
      if (photoRowErr) throw photoRowErr;

      track('profile_setup_completed');
      track('signup_completed');
      await refresh();
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

  const sectionLabel = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: 'var(--muted)',
    marginBottom: 10,
    paddingLeft: 2,
  };

  return (
    <div
      style={{
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        background:
          'radial-gradient(circle at 50% -10%, rgba(225, 16, 112, 0.18) 0%, transparent 60%), ' +
          'radial-gradient(circle at 100% 30%, rgba(139, 92, 246, 0.10) 0%, transparent 50%), ' +
          'var(--bg)',
        boxSizing: 'border-box',
      }}
    >
      {/* ── Scrollable body ────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding:
            'max(env(safe-area-inset-top), 16px) 20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-6)',
        }}
      >
        {/* ── Hero: photo + headline ──────────────────────────── */}
        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            paddingTop: 8,
          }}
        >
          <button
            type="button"
            onClick={onPickPhoto}
            aria-label={photoPreview ? 'Trocar foto' : 'Adicionar foto principal'}
            style={{
              width: 132,
              height: 132,
              borderRadius: '50%',
              padding: 0,
              position: 'relative',
              backgroundImage: photoPreview ? `url("${photoPreview}")` : undefined,
              backgroundColor: photoPreview ? undefined : 'var(--card)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              border: photoPreview
                ? '4px solid transparent'
                : '2px dashed rgba(255, 59, 154, 0.45)',
              backgroundOrigin: 'border-box',
              backgroundClip: photoPreview
                ? 'padding-box, border-box'
                : undefined,
              ...(photoPreview && {
                backgroundImage:
                  `url("${photoPreview}"), linear-gradient(135deg, var(--pink), var(--hot), var(--aurora))`,
              }),
              boxShadow: photoPreview
                ? 'var(--shadow-lg), 0 0 40px var(--aurora-glow)'
                : '0 0 28px rgba(255, 59, 154, 0.15)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--muted)',
              transition: 'transform var(--dur-base) var(--ease-spring), box-shadow var(--dur-base) var(--ease-out)',
            }}
          >
            {!photoPreview && (
              <span style={{ fontSize: 36, lineHeight: 1 }} aria-hidden>📷</span>
            )}
            {/* Edit affordance once a photo is chosen */}
            {photoPreview && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  bottom: 4,
                  right: 4,
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--pink), var(--hot))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 15,
                  color: '#fff',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                  border: '2px solid var(--bg)',
                }}
              >
                ✎
              </span>
            )}
          </button>

          <div style={{ textAlign: 'center' }}>
            <h2
              style={{
                margin: 0,
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
                fontWeight: 700,
                fontSize: 26,
                letterSpacing: '-0.01em',
              }}
            >
              Vamos te conhecer
            </h2>
            <p
              className="muted"
              style={{ fontSize: 14, margin: '6px 0 0', lineHeight: 1.4 }}
            >
              Só algumas coisinhas pra começar 💋
            </p>
          </div>
        </section>

        {/* ── Name + birthdate card ───────────────────────────── */}
        <section className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={sectionLabel}>Nome</div>
            <input
              id="onb-name"
              placeholder="Como te chamam?"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              autoComplete="given-name"
              style={{ fontSize: 16 }}
            />
          </div>

          <div>
            <div style={sectionLabel}>Data de nascimento</div>
            <div
              role="group"
              aria-label="Data de nascimento"
              style={{ display: 'flex', gap: 8 }}
            >
              <select
                aria-label="Dia"
                value={bDay}
                onChange={(e) => setBDay(e.target.value)}
                style={{ flex: '0 0 28%', fontSize: 15 }}
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
                style={{ flex: 1, fontSize: 15 }}
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
                style={{ flex: '0 0 30%', fontSize: 15 }}
              >
                <option value="" disabled>Ano</option>
                {Array.from({ length: maxYear - minYear + 1 }, (_, i) => {
                  const y = String(maxYear - i);
                  return <option key={y} value={y}>{y}</option>;
                })}
              </select>
            </div>
            {birthdate && !ageValid && (
              <p style={{ fontSize: 12, marginTop: 8, marginBottom: 0, color: 'var(--pink)' }}>
                Você precisa ter entre 18 e 120 anos.
              </p>
            )}
          </div>
        </section>

        {/* ── Gender ──────────────────────────────────────────── */}
        <section>
          <div id="onb-gender-label" style={sectionLabel}>Você é</div>
          <div
            role="group"
            aria-labelledby="onb-gender-label"
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}
          >
            {GENDER_OPTIONS.map((o) => {
              const active = gender === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setGender(o.value)}
                  style={{
                    minHeight: 52,
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: active ? '1px solid transparent' : '1px solid var(--hairline)',
                    background: active
                      ? 'linear-gradient(120deg, var(--pink), var(--hot))'
                      : 'var(--card)',
                    color: active ? '#fff' : 'var(--text)',
                    fontWeight: active ? 700 : 500,
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    gap: 10,
                    boxShadow: active ? 'var(--shadow-pink)' : 'inset 0 1px 0 rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                    transition: 'background var(--dur-base) var(--ease-out), transform var(--dur-fast) var(--ease-out)',
                  }}
                >
                  <span style={{ fontSize: 18, opacity: active ? 1 : 0.7 }} aria-hidden>{o.icon}</span>
                  <span>{o.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Seeking ─────────────────────────────────────────── */}
        <section>
          <div id="onb-seeking-label" style={sectionLabel}>Quer conhecer</div>
          <div
            role="group"
            aria-labelledby="onb-seeking-label"
            style={{ display: 'flex', gap: 8 }}
          >
            {SEEKING_OPTIONS.map((o) => {
              const active = seeking === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setSeeking(o.value)}
                  style={{
                    flex: 1,
                    minHeight: 56,
                    padding: '10px 8px',
                    borderRadius: 'var(--radius-sm)',
                    border: active ? '1px solid transparent' : '1px solid var(--hairline)',
                    background: active
                      ? 'linear-gradient(120deg, var(--pink), var(--hot))'
                      : 'var(--card)',
                    color: active ? '#fff' : 'var(--text)',
                    fontWeight: active ? 700 : 500,
                    fontSize: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    boxShadow: active ? 'var(--shadow-pink)' : 'inset 0 1px 0 rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                    transition: 'background var(--dur-base) var(--ease-out)',
                  }}
                >
                  <span style={{ fontSize: 20, lineHeight: 1, opacity: active ? 1 : 0.75 }} aria-hidden>{o.icon}</span>
                  <span>{o.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Bio ─────────────────────────────────────────────── */}
        <section>
          <div style={sectionLabel}>Bio · opcional</div>
          <textarea
            id="onb-bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={150}
            placeholder="Uma frase que te define"
            aria-label="Bio"
            style={{ resize: 'none', fontSize: 14, lineHeight: 1.5 }}
          />
          <p
            className="muted"
            style={{
              fontSize: 11,
              textAlign: 'right',
              margin: '4px 4px 0',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {bio.length}/150
          </p>
        </section>

        {/* ── Terms ───────────────────────────────────────────── */}
        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            cursor: 'pointer',
            padding: '12px 14px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--card)',
            border: '1px solid var(--hairline)',
          }}
        >
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            style={{
              width: 20,
              height: 20,
              flexShrink: 0,
              accentColor: 'var(--pink)',
              marginTop: 1,
            }}
          />
          <span className="muted" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
            Tenho 18+ e aceito os{' '}
            <Link to="/terms" onClick={(e) => e.stopPropagation()} style={{ color: 'var(--pink)', textDecoration: 'none', fontWeight: 600 }}>Termos</Link>
            {' '}e a{' '}
            <Link to="/privacy" onClick={(e) => e.stopPropagation()} style={{ color: 'var(--pink)', textDecoration: 'none', fontWeight: 600 }}>Privacidade</Link>.
          </span>
        </label>
      </div>

      {/* ── Sticky CTA bar (always reachable) ──────────────────── */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          zIndex: 5,
          padding: '14px 20px calc(14px + env(safe-area-inset-bottom))',
          background: 'rgba(6, 0, 15, 0.88)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderTop: '1px solid var(--hairline)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <button
          className="btn"
          style={{
            background: canFinish
              ? 'linear-gradient(120deg, var(--pink), var(--hot))'
              : undefined,
            boxShadow: canFinish ? 'var(--shadow-pink), 0 0 24px var(--pink-glow)' : undefined,
            transition: 'box-shadow var(--dur-base) var(--ease-out)',
          }}
          disabled={!canFinish || saving}
          onClick={finish}
        >
          {saving ? 'Salvando…' : 'Completar perfil 🔥'}
        </button>
        {!saving && missingHint && (
          <p
            aria-live="polite"
            className="muted"
            style={{ fontSize: 12, textAlign: 'center', margin: 0 }}
          >
            {missingHint}
          </p>
        )}
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
