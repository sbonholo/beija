import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { activeApi as api, errorMessage, isMockMode } from '../lib/api';
import { useAuth } from '../state/AuthContext';
import type { EventItem } from '../types';
import { getCurrentPosition } from '../platform/geolocation';
import { BottomNav } from '../components/BottomNav';

function formatDistance(m: number | null | undefined) {
  if (m == null) return '';
  if (m < 1000) return `${m}m`;
  return `${(m / 1000).toFixed(1)}km`;
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pos = await getCurrentPosition();
      const { events } = await api.listEvents(pos?.lat ?? null, pos?.lng ?? null);
      setEvents(events);
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
    }
  }, [nav, signOut]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="screen">
      <div className="header">
        <div>
          <h2 style={{ fontFamily: 'Poppins, system-ui, sans-serif' }}>
            Eai, {user?.nickname || 'você'} 💋
          </h2>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>Escolha o rolê de hoje</p>
        </div>
      </div>

      {loading && (
        <div className="empty">
          <div className="big" style={{ animation: 'pulse 1.2s ease-in-out infinite' }}>🎶</div>
          <p>Buscando rolês...</p>
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
          <p>Nenhum evento por perto agora.</p>
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
                {e.distanceMeters != null && (
                  <span className="pill pill-fire">
                    📍 {formatDistance(e.distanceMeters)}
                  </span>
                )}
              </div>
            </div>
            <div className="event-arrow">›</div>
          </div>
        ))}
      </div>

      <BottomNav />
    </div>
  );
}
