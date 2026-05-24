import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { setAnalyticsConsent, track } from '../../lib/analytics';
import { useToast } from '../Toast';
import { APP_VERSION } from '../../lib/constants';
import { SUPPORTED_LOCALES, changeLocale, type SupportedLocale } from '../../i18n';

interface Prefs {
  mute_notifications: boolean;
  hide_distance: boolean;
  show_age: boolean;
  allow_analytics: boolean;
  locale: SupportedLocale;
}

const DEFAULT_PREFS: Prefs = {
  mute_notifications: false,
  hide_distance: false,
  show_age: true,
  allow_analytics: true,
  locale: 'pt-BR',
};

export default function SettingsScreen() {
  const nav = useNavigate();
  const toast = useToast();
  const { t, i18n: i18nInstance } = useTranslation('settings');
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
        .select('mute_notifications, hide_distance, show_age, allow_analytics, locale')
        .eq('id', me)
        .maybeSingle();
      if (cancelled) return;
      setUserId(me);
      const dbLocale = (data?.locale as SupportedLocale | undefined) ?? null;
      const effectiveLocale: SupportedLocale =
        dbLocale && SUPPORTED_LOCALES.includes(dbLocale)
          ? dbLocale
          : ((i18nInstance.resolvedLanguage as SupportedLocale | undefined) ?? 'pt-BR');
      setPrefs({
        mute_notifications: !!data?.mute_notifications,
        hide_distance: !!data?.hide_distance,
        show_age: data?.show_age !== false,
        allow_analytics: data?.allow_analytics !== false,
        locale: effectiveLocale,
      });
      track('settings_opened');
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [nav, i18nInstance]);

  const update = useCallback(
    async <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
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
        // Track BEFORE flipping consent so the opt-out itself gets recorded.
        track('settings_changed', { setting_name: key, value });
        if (key === 'allow_analytics' && typeof value === 'boolean') {
          setAnalyticsConsent(value);
        }
        if (key === 'locale' && typeof value === 'string') {
          changeLocale(value as SupportedLocale);
        }
      } catch (e) {
        setPrefs((p) => ({ ...p, [key]: prev }));
        toast({ kind: 'info', text: e instanceof Error ? e.message : t('save_error') });
      } finally {
        setSaving(null);
      }
    },
    [userId, prefs, toast, t],
  );

  if (loading) {
    return (
      <div className="screen">
        <div className="header"><h2>{t('title')}</h2></div>
        <div className="skeleton" style={{ height: 56, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 56, marginBottom: 12 }} />
        <div className="skeleton" style={{ height: 56 }} />
      </div>
    );
  }

  return (
    <div className="screen" style={{ paddingBottom: 120 }}>
      <div className="header"><h2>{t('title')}</h2></div>

      <Section title={t('sections.notifications')}>
        <Toggle
          label={t('toggles.mute_notifications')}
          checked={prefs.mute_notifications}
          saving={saving === 'mute_notifications'}
          onChange={(v) => void update('mute_notifications', v)}
          hint={t('toggles.mute_notifications_hint')}
        />
      </Section>

      <Section title={t('sections.privacy')}>
        <Toggle
          label={t('toggles.hide_distance')}
          checked={prefs.hide_distance}
          saving={saving === 'hide_distance'}
          onChange={(v) => void update('hide_distance', v)}
          hint={t('toggles.hide_distance_hint')}
        />
        <Toggle
          label={t('toggles.show_age')}
          checked={prefs.show_age}
          saving={saving === 'show_age'}
          onChange={(v) => void update('show_age', v)}
          hint={t('toggles.show_age_hint')}
        />
        <Toggle
          label={t('toggles.allow_analytics')}
          checked={prefs.allow_analytics}
          saving={saving === 'allow_analytics'}
          onChange={(v) => void update('allow_analytics', v)}
          hint={t('toggles.allow_analytics_hint')}
        />
        <Link to="/privacy" className="settings-link">
          {t('links.privacy_policy')} →
        </Link>
      </Section>

      <Section title={t('sections.language')}>
        <LanguagePicker
          value={prefs.locale}
          onChange={(loc) => void update('locale', loc)}
          saving={saving === 'locale'}
        />
      </Section>

      <Section title={t('sections.account')}>
        <Link to="/settings/delete" className="settings-link" style={{ color: '#ff8585' }}>
          {t('links.delete_account')} →
        </Link>
      </Section>

      <Section title={t('sections.about')}>
        <Link to="/terms" className="settings-link">
          {t('links.terms')} →
        </Link>
        <p className="muted" style={{ fontSize: 12, marginTop: 8, padding: '0 4px' }}>
          {t('version', { version: APP_VERSION })}
        </p>
      </Section>
    </div>
  );
}

function LanguagePicker({
  value,
  onChange,
  saving,
}: {
  value: SupportedLocale;
  onChange: (next: SupportedLocale) => void;
  saving: boolean;
}) {
  const { t } = useTranslation('common');
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '14px 16px',
        cursor: 'pointer',
      }}
    >
      <span style={{ flex: 1 }}>Idioma / Language</span>
      <select
        value={value}
        disabled={saving}
        onChange={(e) => onChange(e.target.value as SupportedLocale)}
        aria-label="Idioma / Language"
        style={{
          width: 'auto',
          minWidth: 160,
          padding: '8px 12px',
          fontSize: 14,
        }}
      >
        {SUPPORTED_LOCALES.map((loc) => (
          <option key={loc} value={loc}>
            {t(`languages.${loc}`)}
          </option>
        ))}
      </select>
    </label>
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
