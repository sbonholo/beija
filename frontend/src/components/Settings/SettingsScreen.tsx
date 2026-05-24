import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast';
import {
  APP_VERSION,
  STR_DELETE_ACCOUNT,
  STR_HIDE_DISTANCE,
  STR_MUTE_NOTIFICATIONS,
  STR_PRIVACY_POLICY,
  STR_SETTINGS_ABOUT,
  STR_SETTINGS_ACCOUNT,
  STR_SETTINGS_NOTIFICATIONS,
  STR_SETTINGS_PRIVACY,
  STR_SETTINGS_TITLE,
  STR_SHOW_AGE,
  STR_TERMS,
} from '../../lib/constants';

interface Prefs {
  mute_notifications: boolean;
  hide_distance: boolean;
  show_age: boolean;
}

const DEFAULT_PREFS: Prefs = {
  mute_notifications: false,
  hide_distance: false,
  show_age: true,
};

export default function SettingsScreen() {
  const nav = useNavigate();
  const toast = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<keyof Prefs | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id;
      if (!me) {
        nav('/signin', { replace: true });
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('mute_notifications, hide_distance, show_age')
        .eq('id', me)
        .maybeSingle();
      if (cancelled) return;
      setUserId(me);
      setPrefs({
        mute_notifications: !!data?.mute_notifications,
        hide_distance: !!data?.hide_distance,
        show_age: data?.show_age !== false,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [nav]);

  const update = useCallback(
    async (key: keyof Prefs, value: boolean) => {
      if (!userId) return;
      const prev = prefs[key];
      setPrefs((p) => ({ ...p, [key]: value }));
      setSaving(key);
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ [key]: value })
          .eq('id', userId);
        if (error) throw error;
      } catch (e) {
        setPrefs((p) => ({ ...p, [key]: prev }));
        toast({ kind: 'info', text: e instanceof Error ? e.message : 'Erro ao salvar' });
      } finally {
        setSaving(null);
      }
    },
    [userId, prefs, toast],
  );

  if (loading) {
    return (
      <div className="screen">
        <div className="header"><h2>{STR_SETTINGS_TITLE}</h2></div>
        <div className="skeleton" style={{ height: 56, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 56, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 56 }} />
      </div>
    );
  }

  return (
    <div className="screen" style={{ paddingBottom: 120 }}>
      <div className="header"><h2>{STR_SETTINGS_TITLE}</h2></div>

      <Section title={STR_SETTINGS_NOTIFICATIONS}>
        <Toggle
          label={STR_MUTE_NOTIFICATIONS}
          checked={prefs.mute_notifications}
          saving={saving === 'mute_notifications'}
          onChange={(v) => void update('mute_notifications', v)}
          hint="Não recebe push de match nem mensagem nova."
        />
      </Section>

      <Section title={STR_SETTINGS_PRIVACY}>
        <Toggle
          label={STR_HIDE_DISTANCE}
          checked={prefs.hide_distance}
          saving={saving === 'hide_distance'}
          onChange={(v) => void update('hide_distance', v)}
          hint="Outros usuários não veem sua distância no card."
        />
        <Toggle
          label={STR_SHOW_AGE}
          checked={prefs.show_age}
          saving={saving === 'show_age'}
          onChange={(v) => void update('show_age', v)}
          hint="Mostra sua idade no card do Discover."
        />
        <Link to="/privacy" className="settings-link">
          {STR_PRIVACY_POLICY} →
        </Link>
      </Section>

      <Section title={STR_SETTINGS_ACCOUNT}>
        <Link to="/settings/delete" className="settings-link" style={{ color: '#ff8585' }}>
          {STR_DELETE_ACCOUNT} →
        </Link>
      </Section>

      <Section title={STR_SETTINGS_ABOUT}>
        <Link to="/terms" className="settings-link">
          {STR_TERMS} →
        </Link>
        <p className="muted" style={{ fontSize: 12, marginTop: 8, padding: '0 4px' }}>
          Beija v{APP_VERSION}
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 18 }}>
      <h3
        style={{
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
          margin: '0 0 8px 4px',
        }}
      >
        {title}
      </h3>
      <div
        className="card"
        style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        {children}
      </div>
    </section>
  );
}

function Toggle({
  label,
  checked,
  saving,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  saving: boolean;
  onChange: (next: boolean) => void;
  hint?: string;
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '14px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        cursor: 'pointer',
      }}
    >
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block' }}>{label}</span>
        {hint && (
          <span className="muted" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
            {hint}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={saving}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        style={{ width: 20, height: 20, accentColor: 'var(--pink)' }}
      />
    </label>
  );
}
