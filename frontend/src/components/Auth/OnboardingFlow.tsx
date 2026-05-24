import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { pickPhoto, uploadProfilePhoto } from '../../lib/storage';
import { useToast } from '../Toast';

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

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [gender, setGender] = useState<GenderUI | null>(null);
  const [seeking, setSeeking] = useState<SeekingUI | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);

  // Track which step has already auto-advanced so coming back doesn't re-trigger.
  const advancedFrom = useRef<Set<number>>(new Set());

  const maxBirthdate = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 18);
    return d.toISOString().slice(0, 10);
  })();

  const step1Valid = name.trim().length >= 2 && (() => {
    const age = calcAge(birthdate);
    return age !== null && age >= 18 && age <= 120;
  })();

  const step2Valid = gender !== null && seeking !== null;
  const step3Valid = photoBase64 !== null;

  // Auto-advance from step 0
  useEffect(() => {
    if (step === 0 && step1Valid && !advancedFrom.current.has(0)) {
      advancedFrom.current.add(0);
      const id = window.setTimeout(() => setStep(1), 250);
      return () => window.clearTimeout(id);
    }
  }, [step, step1Valid]);

  // Auto-advance from step 1
  useEffect(() => {
    if (step === 1 && step2Valid && !advancedFrom.current.has(1)) {
      advancedFrom.current.add(1);
      const id = window.setTimeout(() => setStep(2), 250);
      return () => window.clearTimeout(id);
    }
  }, [step, step2Valid]);

  async function onPickPhoto() {
    const base64 = await pickPhoto();
    if (!base64) return;
    setPhotoBase64(base64);
    setPhotoPreview(`data:image/jpeg;base64,${base64}`);
  }

  async function finish() {
    if (!step1Valid || !step2Valid || !step3Valid || !gender || !seeking || !photoBase64) return;
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
        last_active: new Date().toISOString(),
      });
      if (profileErr) throw profileErr;

      const { publicUrl } = await uploadProfilePhoto(userId, photoBase64, 0);
      const { error: photoRowErr } = await supabase.from('photos').upsert(
        { user_id: userId, slot: 0, url: publicUrl },
        { onConflict: 'user_id,slot' },
      );
      if (photoRowErr) throw photoRowErr;

      nav('/discover', { replace: true });
    } catch (e) {
      toast({ kind: 'info', text: e instanceof Error ? e.message : 'Erro ao salvar perfil' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="screen" style={{ paddingBottom: 40 }}>
      <h2 style={{ marginTop: 12, marginBottom: 4 }}>Vamos te conhecer</h2>
      <div
        className="onboarding-progress"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={3}
        aria-valuenow={step + 1}
        aria-label={`Passo ${step + 1} de 3`}
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className={`onboarding-progress-seg ${i <= step ? 'filled' : ''}`} />
        ))}
      </div>
      <p className="muted" style={{ marginTop: 6, marginBottom: 22, fontSize: 12 }}>
        Passo {step + 1} de 3
      </p>

      {step === 0 && (
        <>
          <label className="muted" style={{ fontSize: 13 }}>Seu nome</label>
          <input
            autoFocus
            placeholder="Como te chamam"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
          />

          <label className="muted" style={{ fontSize: 13, marginTop: 14, display: 'block' }}>
            Data de nascimento
          </label>
          <input
            type="date"
            max={maxBirthdate}
            value={birthdate}
            onChange={(e) => setBirthdate(e.target.value)}
          />
          <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
            Você precisa ter 18+ pra continuar.
          </p>
        </>
      )}

      {step === 1 && (
        <>
          <label className="muted" style={{ fontSize: 13, marginBottom: 8, display: 'block' }}>
            Você é
          </label>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className={`chip ${gender === 'woman' ? 'selected' : ''}`}
              onClick={() => setGender('woman')}
            >
              ♀️ Mulher
            </button>
            <button
              type="button"
              className={`chip ${gender === 'man' ? 'selected' : ''}`}
              onClick={() => setGender('man')}
            >
              ♂️ Homem
            </button>
            <button
              type="button"
              className={`chip ${gender === 'other' ? 'selected' : ''}`}
              onClick={() => setGender('other')}
            >
              ✨ Outro
            </button>
          </div>

          <div style={{ height: 18 }} />

          <label className="muted" style={{ fontSize: 13, marginBottom: 8, display: 'block' }}>
            Quer conhecer
          </label>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              className={`chip ${seeking === 'women' ? 'selected' : ''}`}
              onClick={() => setSeeking('women')}
            >
              ♀️ Mulheres
            </button>
            <button
              type="button"
              className={`chip ${seeking === 'men' ? 'selected' : ''}`}
              onClick={() => setSeeking('men')}
            >
              ♂️ Homens
            </button>
            <button
              type="button"
              className={`chip ${seeking === 'all' ? 'selected' : ''}`}
              onClick={() => setSeeking('all')}
            >
              💫 Todos
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <label className="muted" style={{ fontSize: 13, marginBottom: 8, display: 'block' }}>
            Foto principal
          </label>
          <div
            onClick={onPickPhoto}
            role="button"
            aria-label="Escolher foto"
            style={{
              width: '100%',
              aspectRatio: '1 / 1',
              maxWidth: 280,
              margin: '0 auto 12px',
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
              boxShadow: photoPreview ? 'var(--shadow)' : undefined,
            }}
          >
            {!photoPreview && <span style={{ fontSize: 48 }}>📷</span>}
          </div>

          <label className="muted" style={{ fontSize: 13, marginTop: 10, display: 'block' }}>
            Bio (opcional)
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={150}
            placeholder="Diz algo sobre você"
          />
          <p className="muted" style={{ fontSize: 11, textAlign: 'right' }}>
            {bio.length}/150
          </p>

          <button
            className="btn"
            style={{ marginTop: 18 }}
            disabled={!step3Valid || saving}
            onClick={finish}
          >
            {saving ? 'Salvando...' : 'Pronto, ver pessoas 🔥'}
          </button>
        </>
      )}

      {step > 0 && (
        <button
          className="btn ghost"
          style={{ marginTop: 12 }}
          onClick={() => setStep((s) => s - 1)}
        >
          Voltar
        </button>
      )}
    </div>
  );
}
