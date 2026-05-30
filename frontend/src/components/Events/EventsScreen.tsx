import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import type { NearbyEvent } from '../../lib/supabase';
import { useToast } from '../Toast';
import { formatShortDate, formatTime } from '../../lib/dates';

const CATEGORY_GRADIENT: Record<string, string> = {
  festival:  'linear-gradient(135deg, var(--pink) 0%, var(--hot) 100%)',
  concert:   'linear-gradient(135deg, var(--pink-glow) 0%, var(--aurora) 100%)',
  bar:       'linear-gradient(135deg, var(--hot) 0%, var(--gold) 100%)',
  nightclub: 'linear-gradient(135deg, var(--aurora) 0%, var(--pink) 100%)',
  show:      'linear-gradient(135deg, var(--hot) 20%, var(--heart) 100%)',
  other:     'linear-gradient(135deg, var(--card-raised) 0%, var(--bg-elev) 100%)',
};

const CATEGORY_LABEL: Record<string, string> = {
  festival: '🎪 Festival', concert: '🎵 Show', bar: '🍺 Bar',
  nightclub: '🪩 Balada', show: '🎭 Espetáculo', other: '📍 Outro',
};

const CATEGORIES = ['bar', 'nightclub', 'festival', 'concert', 'show', 'other'] as const;

function formatEventTime(event: NearbyEvent, t: (k: string, opts?: Record<string, unknown>) => string): string {
  const start = new Date(event.starts_at);
  const now   = new Date();
  const timeStr = formatTime(event.starts_at);

  const isHappening =
    start <= now &&
    (event.ends_at == null || new Date(event.ends_at) > now);

  if (isHappening) return t('happening_now');

  const startDay  = start.toDateString();
  const todayStr  = now.toDateString();
  const tomorrow  = new Date(now); tomorrow.setDate(now.getDate() + 1);

  if (startDay === todayStr)                return t('today_at',    { time: timeStr });
  if (startDay === tomorrow.toDateString()) return t('tomorrow_at', { time: timeStr });

  const dateStr = formatShortDate(event.starts_at);
  return t('date_at', { date: dateStr, time: timeStr });
}

function isHappeningNow(event: NearbyEvent): boolean {
  const now   = new Date();
  const start = new Date(event.starts_at);
  const end   = event.ends_at ? new Date(event.ends_at) : null;
  return start <= now && (end == null || end > now);
}

function expiresIn(isoString: string): string {
  const ms = new Date(isoString).getTime() - Date.now();
  if (ms <= 0) return 'Expirando…';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `Expira em ${h}h${m > 0 ? ` ${m}min` : ''}` : `Expira em ${m}min`;
}

export function EventsScreen() {
  const { t } = useTranslation('events');
  const nav   = useNavigate();
  const toast = useToast();

  const [events,   setEvents]   = useState<NearbyEvent[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [checking, setChecking] = useState<Set<string>>(new Set());

  // Create-room form
  const [showCreate,  setShowCreate]  = useState(false);
  const [creating,    setCreating]    = useState(false);
  const [newName,     setNewName]     = useState('');
  const [newCat,      setNewCat]      = useState<string>('other');
  const [newVenue,    setNewVenue]    = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Store own user id once
  const [myId, setMyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: auth } = await supabase.auth.getUser();
    if (!myId && auth.user?.id) setMyId(auth.user.id);

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
  }, [t, toast, myId]);

  useEffect(() => { void load(); }, [load]);

  // Focus room name when form opens
  useEffect(() => {
    if (showCreate) setTimeout(() => nameInputRef.current?.focus(), 80);
  }, [showCreate]);

  async function toggleCheckIn(e: React.MouseEvent, event: NearbyEvent) {
    e.stopPropagation();
    if (checking.has(event.id)) return;

    setChecking((prev) => new Set(prev).add(event.id));

    if (event.is_checked_in) {
      const { error } = await supabase.rpc('leave_event_room', { p_event_id: event.id });
      if (error) {
        toast({ kind: 'info', text: t('error_checkin') });
        setChecking((prev) => { const s = new Set(prev); s.delete(event.id); return s; });
        return;
      }
    } else {
      const { error } = await supabase.rpc('join_event_room', { p_event_id: event.id });
      if (error) {
        toast({ kind: 'info', text: t('error_checkin') });
        setChecking((prev) => { const s = new Set(prev); s.delete(event.id); return s; });
        return;
      }
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

  async function handleCreateRoom() {
    if (!newName.trim() || creating) return;
    setCreating(true);

    let pLat: number | null = null;
    let pLon: number | null = null;
    try {
      await new Promise<void>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => { pLat = pos.coords.latitude; pLon = pos.coords.longitude; resolve(); },
          () => resolve(),
          { timeout: 3000 },
        );
      });
    } catch { /* ignore */ }

    const { data: newId, error } = await supabase.rpc('create_event_room', {
      p_name:     newName.trim(),
      p_category: newCat,
      p_venue:    newVenue.trim() || null,
      p_lat:      pLat,
      p_lon:      pLon,
    });

    if (error) {
      toast({ kind: 'info', text: t('error_checkin') });
    } else {
      setShowCreate(false);
      setNewName('');
      setNewVenue('');
      setNewCat('other');
      await load();
      nav(`/events/${newId as string}`);
    }
    setCreating(false);
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
      <div className="header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2>{t('title')}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="chip"
            onClick={() => setShowCreate((v) => !v)}
            aria-expanded={showCreate}
            style={showCreate ? { background: 'var(--pink)', color: '#fff', borderColor: 'transparent' } : undefined}
          >
            {showCreate ? '✕ Cancelar' : '＋ Criar sala'}
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => void load()}
            aria-label="Atualizar"
            style={{ fontSize: 18, padding: '4px 12px' }}
          >
            ↻
          </button>
        </div>
      </div>

      {/* Create-room form */}
      {showCreate && (
        <div className="card" style={{ padding: '16px 16px 20px', marginBottom: 14 }}>
          <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15, margin: '0 0 12px' }}>
            Nova sala
          </p>

          <input
            ref={nameInputRef}
            className="input"
            type="text"
            placeholder="Nome da festa / lugar"
            maxLength={80}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ marginBottom: 10 }}
          />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`chip${newCat === cat ? ' selected' : ''}`}
                onClick={() => setNewCat(cat)}
                style={{ fontSize: 13 }}
              >
                {CATEGORY_LABEL[cat]}
              </button>
            ))}
          </div>

          <input
            className="input"
            type="text"
            placeholder="Endereço ou ponto de referência (opcional)"
            maxLength={100}
            value={newVenue}
            onChange={(e) => setNewVenue(e.target.value)}
            style={{ marginBottom: 14 }}
          />

          <button
            className="btn"
            disabled={creating || !newName.trim()}
            onClick={() => void handleCreateRoom()}
          >
            {creating ? 'Criando…' : 'Criar e entrar'}
          </button>
        </div>
      )}

      {events.length === 0 && !showCreate && (
        <div className="empty" style={{ marginTop: 60 }}>
          <span className="glow-emoji" style={{ fontSize: 52 }}>🎪</span>
          <p style={{ fontWeight: 600, marginTop: 12 }}>{t('empty')}</p>
          <p className="muted" style={{ fontSize: 14 }}>{t('empty_hint')}</p>
          <button
            className="btn"
            style={{ marginTop: 16, maxWidth: 260 }}
            onClick={() => setShowCreate(true)}
          >
            ＋ Criar a primeira sala
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {events.map((ev) => {
          const happening   = isHappeningNow(ev);
          const gradient    = CATEGORY_GRADIENT[ev.category] ?? CATEGORY_GRADIENT.other;
          const isChecking  = checking.has(ev.id);
          const isUserRoom  = !!(ev.created_by && ev.created_by === myId);
          const hasExpiry   = !!ev.expires_at;

          return (
            <div
              key={ev.id}
              className="card"
              onClick={() => nav(`/events/${ev.id}`)}
              style={{ cursor: 'pointer', padding: 0, overflow: 'hidden' }}
            >
              <div style={{ background: gradient, height: 6 }} />

              <div style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span
                    className="chip"
                    style={{ fontSize: 12, padding: '2px 10px', background: 'rgba(255,255,255,0.08)' }}
                  >
                    {t(`categories.${ev.category}`)}
                  </span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {isUserRoom && (
                      <span style={{ fontSize: 11, color: 'var(--aurora)', fontWeight: 600 }}>Sua sala</span>
                    )}
                    {ev.distance_km != null && (
                      <span className="muted" style={{ fontSize: 12 }}>
                        {t('km_away', { km: ev.distance_km })}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 2 }}>{ev.name}</div>

                {(ev.venue || ev.city) && (
                  <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>
                    {[ev.venue, ev.city].filter(Boolean).join(' • ')}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div
                    style={{
                      fontSize: 13,
                      color: happening ? 'var(--fire)' : 'var(--muted)',
                      fontWeight: happening ? 600 : 400,
                    }}
                  >
                    {formatEventTime(ev, t)}
                  </div>
                  {hasExpiry && ev.expires_at && (
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {expiresIn(ev.expires_at)}
                    </span>
                  )}
                </div>

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
