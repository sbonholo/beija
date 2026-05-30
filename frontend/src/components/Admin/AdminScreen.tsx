import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, type Event } from '../../lib/supabase';
import { useToast } from '../Toast';
import { AdminEventForm } from './AdminEventForm';

type Tab = 'kpis' | 'events' | 'reports';

interface Kpis {
  total_users: number;
  new_24h: number;
  new_7d: number;
  new_30d: number;
  profiles_completed: number;
  dau: number;
  wau: number;
  mau: number;
  yau: number;
  total_checkins: number;
  total_matches: number;
  matches_24h: number;
  matches_7d: number;
  matches_30d: number;
  matches_365d: number;
  reactions_kiss: number;
  reactions_heart: number;
  reactions_fire: number;
  reports_pending: number;
  reports_actioned: number;
  total_blocks: number;
  banned_users: number;
  total_events: number;
  active_events: number;
  seed_users: number;
  seed_matches: number;
}

interface EventCheckins {
  event_id: string;
  name: string;
  starts_at: string;
  is_active: boolean;
  checkins: number;
}

interface PendingReport {
  report_id: string;
  reason: string;
  details: string | null;
  created_at: string;
  reporter_id: string | null;
  reporter_name: string | null;
  reported_id: string;
  reported_name: string | null;
  reported_is_banned: boolean;
  reported_report_count: number;
}

// Growth/engagement metrics — surfaced separately above the catch-all grid
// because these are the numbers an acquirer's due diligence anchors on.
const ACTIVE_USER_KEYS = ['dau', 'wau', 'mau', 'yau'] as const;
const MATCH_WINDOW_KEYS = ['matches_24h', 'matches_7d', 'matches_30d', 'matches_365d'] as const;

// Everything else (catch-all detail grid below the growth section).
const KPI_ORDER: (keyof Kpis)[] = [
  'total_users', 'new_24h', 'new_7d', 'new_30d', 'profiles_completed',
  'total_checkins', 'total_matches',
  'reactions_kiss', 'reactions_heart', 'reactions_fire',
  'reports_pending', 'reports_actioned', 'total_blocks', 'banned_users',
  'total_events', 'active_events',
];

export function AdminScreen() {
  const { t } = useTranslation('admin');
  const [tab, setTab] = useState<Tab>('kpis');

  return (
    <div className="screen" style={{ paddingBottom: 40 }}>
      <div className="header"><h2>{t('title')}</h2></div>

      <div className="row" role="tablist" style={{ gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['kpis', 'events', 'reports'] as Tab[]).map((tb) => (
          <button
            key={tb}
            type="button"
            role="tab"
            aria-selected={tab === tb}
            className={`chip ${tab === tb ? 'selected' : ''}`}
            onClick={() => setTab(tb)}
          >
            {t(`tabs.${tb}`)}
          </button>
        ))}
      </div>

      {tab === 'kpis' && <KpisPanel />}
      {tab === 'events' && <EventsPanel />}
      {tab === 'reports' && <ReportsPanel />}
    </div>
  );
}

function KpisPanel() {
  const { t } = useTranslation('admin');
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [events, setEvents] = useState<EventCheckins[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Default: real users only. Acquirer-friendly. Toggle adds seed rows back in
  // for testing / pre-launch sanity checks.
  const [includeSeeds, setIncludeSeeds] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const [kpiRes, evRes] = await Promise.all([
      supabase.rpc('admin_dashboard_kpis'),
      supabase.rpc('admin_event_checkins'),
    ]);
    if (kpiRes.error || evRes.error) {
      setError(true);
    } else {
      setKpis(kpiRes.data as unknown as Kpis);
      setEvents((evRes.data ?? []) as unknown as EventCheckins[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <p className="muted">{t('loading')}</p>;
  if (error || !kpis) {
    return (
      <div>
        <p className="muted">{t('error')}</p>
        <button className="btn ghost" style={{ maxWidth: 200 }} onClick={() => void load()}>{t('retry')}</button>
      </div>
    );
  }

  // For the active-user windows we already have seed-excluded counts from the
  // RPC; toggling "include seeds" adds the single seed_users delta. Active-user
  // seeds aren't time-windowed, so the toggle widens every window by the same
  // constant — pragmatic shortcut, doesn't pretend to be more precise than it
  // is, and lines up with the seed_users / seed_matches stamp shown below.
  const seedDelta = includeSeeds ? kpis.seed_users : 0;
  const activeValue = (key: (typeof ACTIVE_USER_KEYS)[number]) => kpis[key] + seedDelta;
  const matchValue = (key: (typeof MATCH_WINDOW_KEYS)[number]) =>
    kpis[key] + (includeSeeds ? kpis.seed_matches : 0);

  // Match conversion: matches/1k MAU over the last 30 days. Trivial derived
  // figure — the kind of single-number engagement stat an acquirer asks for.
  // Anchored on MAU since that's the standard denominator; guard div-by-zero.
  const mauDisplay = activeValue('mau');
  const matches30 = matchValue('matches_30d');
  const matchesPerKMau = mauDisplay > 0
    ? Math.round((matches30 * 1000) / mauDisplay)
    : null;

  return (
    <>
      {/* MAU hero — the single number an acquirer anchors on. */}
      <div
        className="card"
        style={{
          padding: '18px 20px',
          borderTop: '2px solid var(--aurora)',
          marginBottom: 14,
        }}
      >
        <div className="muted" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {t('kpis.mau_hero')}
        </div>
        <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1, marginTop: 4 }}>
          {mauDisplay.toLocaleString('pt-BR')}
        </div>
        {matchesPerKMau !== null && (
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            {t('kpis.matches_per_k_mau', { count: matchesPerKMau })}
          </div>
        )}
      </div>

      {/* Seed toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', margin: 0 }}>
          {t('kpis.growth_section')}
        </h3>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 }}>
          <input
            type="checkbox"
            checked={includeSeeds}
            onChange={(e) => setIncludeSeeds(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: 'var(--pink)' }}
          />
          <span className="muted">
            {includeSeeds ? t('kpis.include_seeds') : t('kpis.real_users_only')}
          </span>
        </label>
      </div>

      {/* Active users row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
        {ACTIVE_USER_KEYS.map((key) => (
          <div
            key={key}
            className="card"
            style={{ padding: '12px 10px', borderTop: '2px solid var(--aurora)' }}
          >
            <div style={{ fontSize: 20, fontWeight: 800 }}>{activeValue(key).toLocaleString('pt-BR')}</div>
            <div className="muted" style={{ fontSize: 11 }}>{t(`kpis.${key}`)}</div>
          </div>
        ))}
      </div>

      {/* Match velocity row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 6 }}>
        {MATCH_WINDOW_KEYS.map((key) => (
          <div
            key={key}
            className="card"
            style={{ padding: '12px 10px', borderTop: '2px solid var(--pink)' }}
          >
            <div style={{ fontSize: 20, fontWeight: 800 }}>{matchValue(key).toLocaleString('pt-BR')}</div>
            <div className="muted" style={{ fontSize: 11 }}>{t(`kpis.${key}`)}</div>
          </div>
        ))}
      </div>

      {includeSeeds && (
        <p className="muted" style={{ fontSize: 11, marginTop: 6, marginBottom: 14 }}>
          {t('kpis.seed_stamp', {
            users: kpis.seed_users.toLocaleString('pt-BR'),
            matches: kpis.seed_matches.toLocaleString('pt-BR'),
          })}
        </p>
      )}

      {/* Catch-all detail grid */}
      <h3 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', margin: '24px 0 10px' }}>
        {t('kpis.detail_section')}
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {KPI_ORDER.map((key) => (
          <div key={key} className="card" style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{kpis[key]}</div>
            <div className="muted" style={{ fontSize: 12 }}>{t(`kpis.${key}`)}</div>
          </div>
        ))}
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', margin: '24px 0 10px' }}>
        {t('kpis.checkins_per_event')}
      </h3>
      {events.length === 0 ? (
        <p className="muted">{t('kpis.no_recent_events')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {events.map((ev) => (
            <div key={ev.event_id} className="card" style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.name}{!ev.is_active && ` · ${t('events.inactive')}`}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {new Date(ev.starts_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, flexShrink: 0 }}>{ev.checkins}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function EventsPanel() {
  const { t } = useTranslation('admin');
  const toast = useToast();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Event | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const { data, error: err } = await supabase.rpc('admin_list_events');
    if (err) setError(true);
    else setEvents((data ?? []) as unknown as Event[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function toggleActive(ev: Event) {
    if (toggling) return;
    setToggling(ev.id);
    const { error: err } = await supabase.rpc('admin_set_event_active', {
      p_id: ev.id,
      p_active: !ev.is_active,
    });
    if (err) {
      toast({ kind: 'info', text: t('error') });
    } else {
      setEvents((list) => list.map((e) => (e.id === ev.id ? { ...e, is_active: !e.is_active } : e)));
    }
    setToggling(null);
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(ev: Event) {
    setEditing(ev);
    setFormOpen(true);
  }

  return (
    <>
      <button className="btn" style={{ marginBottom: 16 }} onClick={openCreate}>
        + {t('events.new')}
      </button>

      {loading ? (
        <p className="muted">{t('loading')}</p>
      ) : error ? (
        <div>
          <p className="muted">{t('error')}</p>
          <button className="btn ghost" style={{ maxWidth: 200 }} onClick={() => void load()}>{t('retry')}</button>
        </div>
      ) : events.length === 0 ? (
        <p className="muted">{t('events.empty')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {events.map((ev) => (
            <div key={ev.id} className="card" style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{ev.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {[ev.venue, ev.city].filter(Boolean).join(' • ')}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {new Date(ev.starts_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <span
                  className="chip"
                  style={{
                    flexShrink: 0,
                    fontSize: 11,
                    color: ev.is_active ? 'var(--online)' : 'var(--muted)',
                  }}
                >
                  {ev.is_active ? t('events.active') : t('events.inactive')}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn ghost" style={{ flex: 1, padding: '8px 0', fontSize: 13 }} onClick={() => openEdit(ev)}>
                  {t('events.edit')}
                </button>
                <button
                  className="btn ghost"
                  style={{ flex: 1, padding: '8px 0', fontSize: 13 }}
                  disabled={toggling === ev.id}
                  onClick={() => void toggleActive(ev)}
                >
                  {ev.is_active ? t('events.deactivate') : t('events.activate')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <AdminEventForm
          event={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => void load()}
        />
      )}
    </>
  );
}

function ReportsPanel() {
  const { t } = useTranslation('admin');
  const toast = useToast();
  const [reports, setReports] = useState<PendingReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [banTarget, setBanTarget] = useState<PendingReport | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const { data, error: err } = await supabase.rpc('admin_list_pending_reports');
    if (err) setError(true);
    else setReports((data ?? []) as unknown as PendingReport[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function confirmBan() {
    if (!banTarget || working) return;
    setWorking(true);
    const { error: err } = await supabase.rpc('admin_ban_user', { p_user_id: banTarget.reported_id });
    if (err) {
      toast({ kind: 'info', text: t('reports.action_error') });
    } else {
      toast({ kind: 'info', text: t('reports.ban_done') });
      setBanTarget(null);
      await load();
    }
    setWorking(false);
  }

  async function dismiss(report: PendingReport) {
    if (working) return;
    setWorking(true);
    const { error: err } = await supabase.rpc('admin_dismiss_report', { p_report_id: report.report_id });
    if (err) {
      toast({ kind: 'info', text: t('reports.action_error') });
    } else {
      toast({ kind: 'info', text: t('reports.dismiss_done') });
      setReports((list) => list.filter((r) => r.report_id !== report.report_id));
    }
    setWorking(false);
  }

  if (loading) return <p className="muted">{t('loading')}</p>;
  if (error) {
    return (
      <div>
        <p className="muted">{t('error')}</p>
        <button className="btn ghost" style={{ maxWidth: 200 }} onClick={() => void load()}>{t('retry')}</button>
      </div>
    );
  }
  if (reports.length === 0) return <p className="muted">{t('reports.empty')}</p>;

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {reports.map((r) => (
          <div key={r.report_id} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <strong>{r.reported_name ?? t('reports.deleted_user')}</strong>
              {r.reported_is_banned && (
                <span className="chip" style={{ fontSize: 11, color: 'var(--danger)', flexShrink: 0 }}>
                  {t('reports.already_banned')}
                </span>
              )}
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              {t('reports.reason')}: <strong style={{ color: 'var(--text)' }}>{r.reason}</strong>
            </div>
            {r.details && (
              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                {t('reports.details')}: {r.details}
              </div>
            )}
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              {t('reports.reporter')}: {r.reporter_name ?? t('reports.anonymous')} ·{' '}
              {new Date(r.created_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {t('reports.report_count', { count: r.reported_report_count })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                className="btn"
                style={{ flex: 1, background: 'var(--danger)', padding: '9px 0', fontSize: 14 }}
                disabled={working || r.reported_is_banned}
                onClick={() => setBanTarget(r)}
              >
                {t('reports.ban')}
              </button>
              <button
                className="btn ghost"
                style={{ flex: 1, padding: '9px 0', fontSize: 14 }}
                disabled={working}
                onClick={() => void dismiss(r)}
              >
                {t('reports.dismiss')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {banTarget && (
        <div className="match-modal-bg" role="dialog" aria-modal="true" onClick={() => !working && setBanTarget(null)}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 400, padding: 22 }}>
            <h2 style={{ margin: '0 0 8px' }}>
              {t('reports.ban_confirm_title', { name: banTarget.reported_name ?? t('reports.deleted_user') })}
            </h2>
            <p className="muted" style={{ marginTop: 0, marginBottom: 18 }}>{t('reports.ban_confirm_body')}</p>
            <button
              className="btn"
              style={{ background: 'var(--danger)' }}
              disabled={working}
              onClick={() => void confirmBan()}
            >
              {working ? t('reports.banning') : t('reports.ban')}
            </button>
            <button className="btn ghost" style={{ marginTop: 10 }} disabled={working} onClick={() => setBanTarget(null)}>
              {t('events.form.cancel')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
