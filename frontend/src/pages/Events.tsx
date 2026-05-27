import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { activeApi as api, errorMessage, isMockMode } from '../lib/api';
import { useAuth } from '../state/AuthContext';
import type { EventItem } from '../types';
import { getCurrentPosition } from '../platform/geolocation';

const REFRESH_MS = 5 * 60_000; // re-poll every 5 min while page is open

function formatDistance(m: number | null | undefined) {
  if (m == null) return '';
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

function formatRadius(m: number | null) {
  if (m == null) return null;
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(0)}km`;
}

function formatWhen(starts: number, ends: number) {
  const now = Date.now();
  if (starts <= now && ends > now) return 'Rolando agora 🔴';
  const diff = starts - now;
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'Daqui a pouco';
  if (h < 24) return `Em ${h}h`;
  return new Date(starts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function Events() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [radiusMeters, setRadiusMeters] = useState<number | null>(null);
  const [autoEventId, setAutoEventId] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const pos = await getCurrentPosition();
      const { events: fetched, radiusMeters: r } = await api.listEvents(pos?.lat ?? null, pos?.lng ?? null);
      setEvents(fetched);
      setRadiusMeters(r);

      // Fire-and-forget: report location + trigger density cluster check
      if (pos && !isMockMode) {
        api.updateLocation(pos.lat, pos.lng).then(({ autoEventId: newId }) => {
          if (newId) {
            setAutoEventId(newId);
            // Refresh list so the auto-created room appears
            setTimeout(() => void load(), 500);
          }
        }).catch(() => {/* non-critical */});
      }
    } catch (err) {
      const em = errorMessage(err);
      if (em.kind === 'auth') {
        signOut();
        nav(isMockMode ? '/' : '/login', { replace: true });
        return;
      }
      setError(em.text);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [nav, signOut]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load();

    // Auto-refresh while page is visible
    refreshTimer.current = setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);

    const onVisibility = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  const radiusLabel = formatRadius(radiusMeters);

  return (
    <div className="screen">
      <div className="header">
        <div>
          <h2 style={{ fontFamily: 'Poppins, system-ui, sans-serif' }}>
            Eai, {user?.nickname || 'você'} 💋
          </h2>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
            {radiusLabel ? `Rolês num raio de ${radiusLabel} 📍` : 'Escolha o rolê de hoje'}
          </p>
        </div>
      </div>

      {/* Auto-detected room toast */}
      {autoEventId && (
        <button
          className="btn"
          style={{
            background: 'linear-gradient(135deg, rgba(255,59,154,0.9), rgba(120,40,200,0.9))',
            marginBottom: 12,
            fontSize: 14,
          }}
          onClick={() => { nav(`/events/${autoEventId}`); setAutoEventId(null); }}
        >
          🎉 Rolê detectado perto de você! Entrar
        </button>
      )}

      {loading && (
        <div className="empty">
          <div className="big" style={{ animation: 'pulse 1.2s ease-in-out infinite' }}>🎶</div>
          <p>Buscando rolês próximos…</p>
        </div>
      )}

      {!loading && error && (
        <div className="empty">
          <div className="big">⚠️</div>
          <p>{error}</p>
          <button className="btn" style={{ marginTop: 16, maxWidth: 240 }} onClick={() => void load()}>
            Tentar de novo
          </button>
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="empty">
          <div className="big">🎉</div>
          <p>
            {radiusLabel
              ? `Nenhum rolê num raio de ${radiusLabel}. Tente mais tarde!`
              : 'Nenhum evento por perto agora.'}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {events.map((e, i) => (
          <div
            key={e.id}
            className="event-card"
            style={{ animationDelay: `${i * 60}ms` }}
            onClick={() => nav(`/events/${e.id}`)}
          >
            <div
              className="thumb"
              style={e.imageUrl ? { backgroundImage: `url("${e.imageUrl}")` } : undefined}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 className="event-name">{e.name}</h3>
              <div className="meta">{e.venue}{e.city ? ` · ${e.city}` : ''}</div>
              <div className="meta" style={{ marginTop: 2 }}>
                {formatWhen(e.startsAt, e.endsAt)}
                {e.checkinCount ? ` · ${e.checkinCount} aí dentro` : ''}
              </div>
              <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {e.category && <span className="pill">{e.category}</span>}
                {(e as any).source === 'auto' && <span className="pill pill-fire">🎯 Detectado</span>}
                {e.distanceMeters != null && (
                  <span className="pill pill-fire">📍 {formatDistance(e.distanceMeters)}</span>
                )}
              </div>
            </div>
            <div className="event-arrow">›</div>
          </div>
        ))}
      </div>
    </div>
  );
}
