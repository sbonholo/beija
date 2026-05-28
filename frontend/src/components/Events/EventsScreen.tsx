import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import type { NearbyEvent } from '../../lib/supabase';
import { useToast } from '../Toast';

const CATEGORY_GRADIENT: Record<string, string> = {
  festival:  'linear-gradient(135deg, #e11d74 0%, #ff6e3e 100%)',
  concert:   'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
  bar:       'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  nightclub: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
  show:      'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)',
  other:     'linear-gradient(135deg, #6b7280 0%, #374151 100%)',
};

function formatEventTime(event: NearbyEvent, t: (k: string, opts?: Record<string, unknown>) => string): string {
  const start = new Date(event.starts_at);
  const now   = new Date();
  const timeStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const isHappening =
    start <= now &&
    (event.ends_at == null || new Date(event.ends_at) > now);

  if (isHappening) return t('happening_now');

  const startDay  = start.toDateString();
  const todayStr  = now.toDateString();
  const tomorrow  = new Date(now); tomorrow.setDate(now.getDate() + 1);

  if (startDay === todayStr)                return t('today_at',    { time: timeStr });
  if (startDay === tomorrow.toDateString()) return t('tomorrow_at', { time: timeStr });

  const dateStr = start.toLocaleDateString([], { day: '2-digit', month: 'short' });
  return t('date_at', { date: dateStr, time: timeStr });
}

function isHappeningNow(event: NearbyEvent): boolean {
  const now   = new Date();
  const start = new Date(event.starts_at);
  const end   = event.ends_at ? new Date(event.ends_at) : null;
  return start <= now && (end == null || end > now);
}

export function EventsScreen() {
  const { t } = useTranslation('events');
  const nav   = useNavigate();
  const toast = useToast();

  const [events,  setEvents]  = useState<NearbyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);

    // Try to get location; fall back to no-geo query on denial/timeout.
    let pLat: number | null = null;
    let pLon: number | null = null;
    try {
      await new Promise<void>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => { pLat = pos.coords.latitude; pLon = pos.coords.longitude; resolve(); },
          ()    => resolve(),
          { timeout: 5000 },
        );
      });
    } catch { /* ignore */ }

    const { data, error } = await supabase.rpc('get_nearby_events', {
      p_lat:       pLat,
      p_lon:       pLon,
      p_radius_km: 100,
    });

    if (error) {
      toast({ kind: 'info', text: t('error_loading') });
    } else {
      setEvents((data ?? []) as unknown as NearbyEvent[]);
    }
    setLoading(false);
  }, [t, toast]);

  useEffect(() => { void load(); }, [load]);

  async function toggleCheckIn(e: React.MouseEvent, event: NearbyEvent) {
    e.stopPropagation();
    if (checking.has(event.id)) return;

    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return;

    setChecking((prev) => new Set(prev).add(event.id));

    if (event.is_checked_in) {
      await supabase.from('check_ins')
        .delete()
        .eq('event_id', event.id)
        .eq('user_id', userId);
    } else {
      const { error } = await supabase.from('check_ins')
        .insert({ event_id: event.id, user_id: userId });
      if (error) toast({ kind: 'info', text: t('error_checkin') });
    }

    setEvents((prev) =>
      prev.map((ev) =>
        ev.id !== event.id ? ev : {
          ...ev,
          is_checked_in:  !ev.is_checked_in,
          attendee_count: ev.attendee_count + (ev.is_checked_in ? -1 : 1),
        },
      ),
    );
    setChecking((prev) => { const s = new Set(prev); s.delete(event.id); return s; });
  }

  if (loading) {
    return (
      <div className="screen">
        <div className="header"><h2>{t('title')}</h2></div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton" style={{ height: 130, marginBottom: 12, borderRadius: 18 }} />
        ))}
      </div>
    );
  }

  return (
    <div className="screen" style={{ paddingBottom: 96 }}>
      <div className="header"><h2>{t('title')}</h2></div>

      {events.length === 0 && (
        <div className="empty" style={{ marginTop: 60 }}>
          <div style={{ fontSize: 52 }}>🎪</div>
          <p style={{ fontWeight: 600, marginTop: 12 }}>{t('empty')}</p>
          <p className="muted" style={{ fontSize: 14 }}>{t('empty_hint')}</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {events.map((ev) => {
          const happening = isHappeningNow(ev);
          const gradient  = CATEGORY_GRADIENT[ev.category] ?? CATEGORY_GRADIENT.other;
          const isChecking = checking.has(ev.id);

          return (
            <div
              key={ev.id}
              className="card"
              onClick={() => nav(`/events/${ev.id}`)}
              style={{ cursor: 'pointer', padding: 0, overflow: 'hidden' }}
            >
              {/* Colour band */}
              <div style={{ background: gradient, height: 6 }} />

              <div style={{ padding: '14px 16px' }}>
                {/* Top row: category + distance */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span
                    className="chip"
                    style={{ fontSize: 12, padding: '2px 10px', background: 'rgba(255,255,255,0.08)' }}
                  >
                    {t(`categories.${ev.category}`)}
                  </span>
                  {ev.distance_km != null && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      {t('km_away', { km: ev.distance_km })}
                    </span>
                  )}
                </div>

                {/* Name */}
                <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 2 }}>{ev.name}</div>

                {/* Venue */}
                {(ev.venue || ev.city) && (
                  <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
                    {[ev.venue, ev.city].filter(Boolean).join(' • ')}
                  </div>
                )}

                {/* Time */}
                <div
                  style={{
                    fontSize: 13,
                    color: happening ? '#4ade80' : 'var(--muted)',
                    marginBottom: 12,
                  }}
                >
                  {formatEventTime(ev, t)}
                </div>

                {/* Footer: attendees + check-in */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {ev.attendee_count === 0
                      ? t('no_one_yet')
                      : t(ev.attendee_count === 1 ? 'people_here' : 'people_here_plural', {
                          count: ev.attendee_count,
                        })}
                  </span>

                  <button
                    className={ev.is_checked_in ? 'btn' : 'btn ghost'}
                    style={{
                      width: 'auto',
                      padding: '8px 14px',
                      fontSize: 13,
                      background: ev.is_checked_in ? 'var(--pink)' : undefined,
                    }}
                    disabled={isChecking}
                    onClick={(e) => void toggleCheckIn(e, ev)}
                  >
                    {isChecking
                      ? t('checking_in')
                      : ev.is_checked_in
                      ? t('checked_in')
                      : t('check_in')}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
