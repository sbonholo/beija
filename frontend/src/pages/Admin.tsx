import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi, ApiError } from '../lib/api';
import { useAuth } from '../state/AuthContext';

type Tab = 'stats' | 'reports' | 'events' | 'users';

interface Stats {
  dau: number; wau: number; mau: number; yau: number;
  totalUsers: number; bannedUsers: number; totalEvents: number; activeCheckins: number;
  totalReactions: number; totalMatches: number; totalMessages: number; openReports: number;
  newLast24h: number; newLast7d: number; newLast30d: number;
}

interface Report {
  id: string; reason: string; createdAt: number;
  reporter: { id: string; nickname: string | null; phone: string };
  reported: { id: string; nickname: string | null; phone: string; isBanned: boolean; photoUrl: string | null };
}

interface AdminUser {
  id: string; phone: string; nickname: string | null; gender: string | null;
  photoUrl: string | null; createdAt: number; lastActive: number | null;
  isAdmin: boolean; isBanned: boolean;
}

interface AdminEvent {
  id: string; name: string; venue: string; address: string | null;
  city: string | null; lat: number; lng: number;
  startsAt: number; endsAt: number; category: string | null; checkinCount: number;
}

function fmtDate(ts: number | null | undefined) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function fmtDateTime(ts: number | null | undefined) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="admin-stat-card">
      <div className="admin-stat-value">{value}</div>
      <div className="admin-stat-label">{label}</div>
      {sub && <div className="admin-stat-sub">{sub}</div>}
    </div>
  );
}

export function Admin() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>('stats');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  // Stats tab
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Reports tab
  const [reports, setReports] = useState<Report[]>([]);
  const [reportsTotal, setReportsTotal] = useState(0);
  const [reportsOffset, setReportsOffset] = useState(0);
  const [reportsLoading, setReportsLoading] = useState(false);

  // Users tab
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersOffset, setUsersOffset] = useState(0);
  const [usersQ, setUsersQ] = useState('');
  const [usersLoading, setUsersLoading] = useState(false);

  // Events tab
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [eventForm, setEventForm] = useState({
    name: '', venue: '', address: '', city: '',
    lat: '', lng: '', startsAt: '', endsAt: '', category: '',
  });
  const [eventSaving, setEventSaving] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);

  // Check admin status on mount
  useEffect(() => {
    if (!user) {
      nav('/login', { replace: true });
      return;
    }
    if (user.isAdmin) {
      setCheckingAuth(false);
      return;
    }
    // Fetch fresh profile to confirm isAdmin (in case state is stale)
    adminApi.getStats().then(() => {
      setCheckingAuth(false);
    }).catch((err) => {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setForbidden(true);
      }
      setCheckingAuth(false);
    });
  }, [user, nav]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await adminApi.getStats();
      setStats(data);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadReports = useCallback(async (offset = 0) => {
    setReportsLoading(true);
    try {
      const data = await adminApi.getReports(offset);
      setReports(data.reports);
      setReportsTotal(data.total);
      setReportsOffset(offset);
    } finally {
      setReportsLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async (q = '', offset = 0) => {
    setUsersLoading(true);
    try {
      const data = await adminApi.getUsers(q, offset);
      setUsers(data.users);
      setUsersTotal(data.total);
      setUsersOffset(offset);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const data = await adminApi.listEvents();
      setEvents(data.events);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  // Load data when tab becomes active
  useEffect(() => {
    if (checkingAuth || forbidden) return;
    if (tab === 'stats') loadStats();
    if (tab === 'reports') loadReports();
    if (tab === 'users') loadUsers();
    if (tab === 'events') loadEvents();
  }, [tab, checkingAuth, forbidden, loadStats, loadReports, loadUsers, loadEvents]);

  async function banUser(id: string, currentlyBanned: boolean) {
    try {
      if (currentlyBanned) await adminApi.unbanUser(id);
      else await adminApi.banUser(id);
      // Refresh both reports and users to reflect change
      if (tab === 'reports') await loadReports(reportsOffset);
      if (tab === 'users') await loadUsers(usersQ, usersOffset);
    } catch (err: any) {
      alert(err?.message || 'Erro ao ban/unban');
    }
  }

  async function deleteEvent(id: string, name: string) {
    if (!confirm(`Deletar "${name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await adminApi.deleteEvent(id);
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (err: any) {
      alert(err?.message || 'Erro ao deletar evento');
    }
  }

  async function createEvent(e: React.FormEvent) {
    e.preventDefault();
    setEventError(null);
    setEventSaving(true);
    try {
      const startsAtMs = new Date(eventForm.startsAt).getTime();
      const endsAtMs = new Date(eventForm.endsAt).getTime();
      const result = await adminApi.createEvent({
        name: eventForm.name,
        venue: eventForm.venue,
        address: eventForm.address || undefined,
        city: eventForm.city || undefined,
        lat: parseFloat(eventForm.lat),
        lng: parseFloat(eventForm.lng),
        startsAt: startsAtMs,
        endsAt: endsAtMs,
        category: eventForm.category || undefined,
      });
      setEvents((prev) => [result.event, ...prev]);
      setShowCreateEvent(false);
      setEventForm({ name: '', venue: '', address: '', city: '', lat: '', lng: '', startsAt: '', endsAt: '', category: '' });
    } catch (err: any) {
      setEventError(err?.message || 'Erro ao criar evento');
    } finally {
      setEventSaving(false);
    }
  }

  if (checkingAuth) {
    return <div className="screen"><p className="muted" style={{ margin: 'auto' }}>Verificando acesso…</p></div>;
  }

  if (forbidden || (user && !user.isAdmin)) {
    return (
      <div className="screen" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ margin: 'auto 0' }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🚫</div>
          <h2 style={{ margin: '0 0 8px' }}>Acesso restrito</h2>
          <p className="muted">Esta área é exclusiva para administradores.</p>
          <button className="btn" style={{ marginTop: 18, maxWidth: 200 }} onClick={() => nav('/events')}>
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen admin-page">
      <div className="admin-header">
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>⚡ Admin</h1>
          <span className="muted" style={{ fontSize: 12 }}>{user?.nickname || user?.phone}</span>
        </div>
        <button className="chip" onClick={() => nav('/events')}>← App</button>
      </div>

      <div className="admin-tabs">
        {(['stats', 'reports', 'events', 'users'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`admin-tab${tab === t ? ' active' : ''}`}
            onClick={() => setTab(t)}
          >
            {{ stats: '📊 Métricas', reports: '🚨 Denúncias', events: '🎉 Eventos', users: '👥 Usuários' }[t]}
          </button>
        ))}
      </div>

      <div className="admin-content">
        {/* ── Métricas ── */}
        {tab === 'stats' && (
          <div>
            {statsLoading && <p className="muted">Carregando…</p>}
            {stats && (
              <>
                <div className="admin-section-title">Usuários ativos</div>
                <div className="admin-stat-grid">
                  <StatCard label="DAU (24h)" value={stats.dau} />
                  <StatCard label="WAU (7d)" value={stats.wau} />
                  <StatCard label="MAU (30d)" value={stats.mau} />
                  <StatCard label="YAU (365d)" value={stats.yau} />
                </div>

                <div className="admin-section-title" style={{ marginTop: 20 }}>Crescimento</div>
                <div className="admin-stat-grid">
                  <StatCard label="Novos hoje" value={stats.newLast24h} />
                  <StatCard label="Novos (7d)" value={stats.newLast7d} />
                  <StatCard label="Novos (30d)" value={stats.newLast30d} />
                  <StatCard label="Total usuários" value={stats.totalUsers} sub={`${stats.bannedUsers} banidos`} />
                </div>

                <div className="admin-section-title" style={{ marginTop: 20 }}>Engajamento</div>
                <div className="admin-stat-grid">
                  <StatCard label="Reações" value={stats.totalReactions} />
                  <StatCard label="Matches" value={stats.totalMatches} />
                  <StatCard label="Mensagens" value={stats.totalMessages} />
                  <StatCard label="Check-ins ativos" value={stats.activeCheckins} />
                </div>

                <div className="admin-stat-grid" style={{ marginTop: 12 }}>
                  <StatCard label="Eventos" value={stats.totalEvents} />
                  <StatCard label="Denúncias" value={stats.openReports} />
                </div>

                <button
                  className="chip"
                  style={{ marginTop: 16 }}
                  onClick={loadStats}
                  disabled={statsLoading}
                >
                  ↻ Atualizar
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Denúncias ── */}
        {tab === 'reports' && (
          <div>
            {reportsLoading && <p className="muted">Carregando…</p>}
            {!reportsLoading && reports.length === 0 && (
              <div className="empty"><div className="big">✅</div><p>Nenhuma denúncia pendente.</p></div>
            )}
            {reports.map((r) => (
              <div key={r.id} className="admin-report-card">
                <div className="admin-report-top">
                  <div>
                    <strong>{r.reported.nickname || '(sem apelido)'}</strong>
                    <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>{r.reported.phone}</span>
                    {r.reported.isBanned && <span className="admin-badge banned">BANIDO</span>}
                  </div>
                  <button
                    className={`chip${r.reported.isBanned ? '' : ' admin-ban-btn'}`}
                    onClick={() => banUser(r.reported.id, r.reported.isBanned)}
                  >
                    {r.reported.isBanned ? 'Desbanir' : '🚫 Banir'}
                  </button>
                </div>
                <div className="admin-report-meta">
                  <span>Motivo: <strong>{r.reason || '—'}</strong></span>
                  <span>Por: {r.reporter.nickname || r.reporter.phone}</span>
                  <span>{fmtDate(r.createdAt)}</span>
                </div>
              </div>
            ))}
            {reportsTotal > 50 && (
              <div className="admin-pagination">
                <button className="chip" disabled={reportsOffset === 0} onClick={() => loadReports(reportsOffset - 50)}>← Anterior</button>
                <span className="muted" style={{ fontSize: 12 }}>{reportsOffset + 1}–{Math.min(reportsOffset + 50, reportsTotal)} de {reportsTotal}</span>
                <button className="chip" disabled={reportsOffset + 50 >= reportsTotal} onClick={() => loadReports(reportsOffset + 50)}>Próximo →</button>
              </div>
            )}
          </div>
        )}

        {/* ── Eventos ── */}
        {tab === 'events' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button className="btn" style={{ maxWidth: 180, fontSize: 14 }} onClick={() => setShowCreateEvent((v) => !v)}>
                {showCreateEvent ? '✕ Cancelar' : '+ Criar evento'}
              </button>
            </div>

            {showCreateEvent && (
              <form onSubmit={createEvent} className="admin-form">
                <p className="field-label" style={{ marginBottom: 4 }}>Novo evento</p>
                {eventError && <p className="auth-error">{eventError}</p>}
                <input placeholder="Nome do evento *" value={eventForm.name} onChange={(e) => setEventForm((f) => ({ ...f, name: e.target.value }))} required />
                <input placeholder="Local / Venue *" value={eventForm.venue} onChange={(e) => setEventForm((f) => ({ ...f, venue: e.target.value }))} required />
                <input placeholder="Endereço" value={eventForm.address} onChange={(e) => setEventForm((f) => ({ ...f, address: e.target.value }))} />
                <input placeholder="Cidade" value={eventForm.city} onChange={(e) => setEventForm((f) => ({ ...f, city: e.target.value }))} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input placeholder="Latitude *" type="number" step="any" value={eventForm.lat} onChange={(e) => setEventForm((f) => ({ ...f, lat: e.target.value }))} required />
                  <input placeholder="Longitude *" type="number" step="any" value={eventForm.lng} onChange={(e) => setEventForm((f) => ({ ...f, lng: e.target.value }))} required />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>Início *</label>
                    <input type="datetime-local" value={eventForm.startsAt} onChange={(e) => setEventForm((f) => ({ ...f, startsAt: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="muted" style={{ fontSize: 12 }}>Fim *</label>
                    <input type="datetime-local" value={eventForm.endsAt} onChange={(e) => setEventForm((f) => ({ ...f, endsAt: e.target.value }))} required />
                  </div>
                </div>
                <input placeholder="Categoria (ex: samba, eletrônico)" value={eventForm.category} onChange={(e) => setEventForm((f) => ({ ...f, category: e.target.value }))} />
                <button type="submit" className="btn btn-ready" disabled={eventSaving} style={{ marginTop: 8 }}>
                  {eventSaving ? 'Criando…' : 'Criar evento'}
                </button>
              </form>
            )}

            {eventsLoading && <p className="muted">Carregando…</p>}
            {!eventsLoading && events.length === 0 && (
              <div className="empty"><div className="big">🎉</div><p>Nenhum evento cadastrado.</p></div>
            )}
            {events.map((ev) => (
              <div key={ev.id} className="admin-event-card">
                <div className="admin-event-top">
                  <div>
                    <strong>{ev.name}</strong>
                    <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{ev.venue}</span>
                  </div>
                  <button
                    className="chip"
                    style={{ color: 'var(--red, #e74c3c)', borderColor: 'var(--red, #e74c3c)' }}
                    onClick={() => deleteEvent(ev.id, ev.name)}
                  >
                    Deletar
                  </button>
                </div>
                <div className="admin-event-meta muted">
                  <span>{fmtDateTime(ev.startsAt)} → {fmtDateTime(ev.endsAt)}</span>
                  <span>{ev.checkinCount} check-in{ev.checkinCount !== 1 ? 's' : ''}</span>
                  {ev.city && <span>{ev.city}</span>}
                  {ev.category && <span>{ev.category}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Usuários ── */}
        {tab === 'users' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                placeholder="Buscar por nome ou telefone…"
                value={usersQ}
                onChange={(e) => setUsersQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadUsers(usersQ, 0)}
                style={{ flex: 1 }}
              />
              <button className="chip" onClick={() => loadUsers(usersQ, 0)}>Buscar</button>
            </div>

            {usersLoading && <p className="muted">Carregando…</p>}
            {!usersLoading && users.length === 0 && (
              <div className="empty"><div className="big">👥</div><p>Nenhum usuário encontrado.</p></div>
            )}
            {users.map((u) => (
              <div key={u.id} className={`admin-user-row${u.isBanned ? ' banned-row' : ''}`}>
                <div className="admin-user-avatar">
                  {u.photoUrl
                    ? <img src={u.photoUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                    : <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>👤</div>
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>
                    {u.nickname || '(sem apelido)'}
                    {u.isAdmin && <span className="admin-badge admin">ADMIN</span>}
                    {u.isBanned && <span className="admin-badge banned">BANIDO</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>{u.phone}</div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    Entrou {fmtDate(u.createdAt)} · Ativo {fmtDate(u.lastActive)}
                  </div>
                </div>
                <button
                  className={`chip${u.isBanned ? '' : ' admin-ban-btn'}`}
                  onClick={() => banUser(u.id, u.isBanned)}
                >
                  {u.isBanned ? 'Desbanir' : '🚫 Banir'}
                </button>
              </div>
            ))}

            {usersTotal > 50 && (
              <div className="admin-pagination">
                <button className="chip" disabled={usersOffset === 0} onClick={() => loadUsers(usersQ, usersOffset - 50)}>← Anterior</button>
                <span className="muted" style={{ fontSize: 12 }}>{usersOffset + 1}–{Math.min(usersOffset + 50, usersTotal)} de {usersTotal}</span>
                <button className="chip" disabled={usersOffset + 50 >= usersTotal} onClick={() => loadUsers(usersQ, usersOffset + 50)}>Próximo →</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
