import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, type ReactionKind } from '../../lib/supabase';

const REACTION_EMOJI: Record<ReactionKind, string> = { kiss: '💋', heart: '❤️', fire: '🔥' };

interface MatchRow {
  matchId: string;
  otherId: string;
  otherName: string | null;
  otherPhotoUrl: string | null;
  createdAt: string;
  lastMessage: { content: string; createdAt: string; senderIsMe: boolean } | null;
  unread: number;
  isStale: boolean;
  isArchived: boolean;
  reactionPair: { mine: ReactionKind; theirs: ReactionKind | null } | null;
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'agora';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function MatchesList() {
  const nav = useNavigate();
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id;
      if (!me) {
        nav('/signin', { replace: true });
        return;
      }

      const { data: matches, error: mErr } = await supabase
        .from('matches')
        .select('id, user1_id, user2_id, created_at, last_message_at, is_stale, is_archived, user1_reaction, user2_reaction')
        .or(`user1_id.eq.${me},user2_id.eq.${me}`)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (mErr) throw mErr;
      if (!matches || matches.length === 0) {
        setRows([]);
        return;
      }

      const otherIds = matches.map((m) => (m.user1_id === me ? m.user2_id : m.user1_id));
      const matchIds = matches.map((m) => m.id);

      const [{ data: profiles }, { data: photos }, { data: lastMessages }, { data: unreadCounts }] =
        await Promise.all([
          supabase.from('profiles').select('id, name').in('id', otherIds),
          supabase
            .from('photos')
            .select('user_id, url')
            .in('user_id', otherIds),
          // last message per match — fetch newest for each match (small list, fine to over-fetch)
          supabase
            .from('messages')
            .select('match_id, sender_id, content, created_at')
            .in('match_id', matchIds)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(matches.length * 5),
          // unread = messages received by me, not yet read
          supabase
            .from('messages')
            .select('match_id')
            .in('match_id', matchIds)
            .neq('sender_id', me)
            .is('read_at', null)
            .is('deleted_at', null),
        ]);

      const nameById = new Map<string, string | null>(
        (profiles ?? []).map((p) => [p.id, p.name ?? null]),
      );
      const photoById = new Map<string, string>(
        (photos ?? []).map((p) => [p.user_id, p.url]),
      );

      const lastByMatch = new Map<
        string,
        { content: string; createdAt: string; senderIsMe: boolean }
      >();
      for (const msg of lastMessages ?? []) {
        if (!lastByMatch.has(msg.match_id)) {
          lastByMatch.set(msg.match_id, {
            content: msg.content,
            createdAt: msg.created_at,
            senderIsMe: msg.sender_id === me,
          });
        }
      }

      const unreadByMatch = new Map<string, number>();
      for (const row of unreadCounts ?? []) {
        unreadByMatch.set(row.match_id, (unreadByMatch.get(row.match_id) ?? 0) + 1);
      }

      const built: MatchRow[] = matches.map((m) => {
        const otherId = m.user1_id === me ? m.user2_id : m.user1_id;
        const mine = (m.user1_id === me ? m.user1_reaction : m.user2_reaction) as ReactionKind | null;
        const theirs = (m.user1_id === me ? m.user2_reaction : m.user1_reaction) as ReactionKind | null;
        return {
          matchId: m.id,
          otherId,
          otherName: nameById.get(otherId) ?? null,
          otherPhotoUrl: photoById.get(otherId) ?? null,
          createdAt: m.created_at,
          lastMessage: lastByMatch.get(m.id) ?? null,
          unread: unreadByMatch.get(m.id) ?? 0,
          isStale: !!m.is_stale,
          isArchived: !!m.is_archived,
          reactionPair: mine ? { mine, theirs } : null,
        };
      });
      setRows(built);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load_failed');
    } finally {
      setLoading(false);
    }
  }, [nav]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="screen">
        <div className="header"><h2>Matches</h2></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="card row center"
              style={{ gap: 12, padding: 12 }}
              aria-hidden
            >
              <div className="skeleton circle" style={{ width: 56, height: 56 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="skeleton" style={{ height: 14, width: '40%' }} />
                <div className="skeleton" style={{ height: 12, width: '70%' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="screen">
        <div className="header"><h2>Matches</h2></div>
        <p className="muted">Não conseguimos carregar agora.</p>
        <button className="btn" style={{ marginTop: 12, maxWidth: 240 }} onClick={() => void load()}>
          Tentar de novo
        </button>
      </div>
    );
  }

  const archivedCount = rows.filter((r) => r.isArchived).length;
  const visibleRows = showArchived ? rows : rows.filter((r) => !r.isArchived);

  if (rows.length === 0) {
    return (
      <div className="screen">
        <div className="header"><h2>Matches</h2></div>
        <div className="empty">
          <div className="big">💋</div>
          <p>Você ainda não tem matches. Volta pro swipe!</p>
          <button
            className="btn"
            style={{ marginTop: 16, maxWidth: 240 }}
            onClick={() => nav('/discover')}
          >
            Ir pro swipe
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="header"><h2>Matches</h2></div>
      {archivedCount > 0 && (
        <button
          type="button"
          className="chip"
          style={{ alignSelf: 'flex-start', marginBottom: 8 }}
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? 'Esconder arquivados' : `Mostrar arquivados (${archivedCount})`}
        </button>
      )}
      {visibleRows.length === 0 ? (
        <div className="empty">
          <p className="muted">Sem matches ativos. Toque acima pra ver arquivados.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visibleRows.map((r) => (
          <button
            key={r.matchId}
            className="card row center"
            style={{ textAlign: 'left', gap: 12, width: '100%' }}
            onClick={() => nav(`/chat/${r.matchId}`)}
          >
            <div
              className="avatar matched"
              style={r.otherPhotoUrl ? { backgroundImage: `url("${r.otherPhotoUrl}")` } : undefined}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.otherName ?? 'Match'}
                  </span>
                  {r.reactionPair && (
                    <span style={{ flexShrink: 0, fontSize: 13 }} aria-hidden>
                      {REACTION_EMOJI[r.reactionPair.mine]}
                      {r.reactionPair.theirs ? REACTION_EMOJI[r.reactionPair.theirs] : ''}
                    </span>
                  )}
                </strong>
                <span className="muted" style={{ fontSize: 12, flexShrink: 0 }}>
                  {relTime(r.lastMessage?.createdAt ?? r.createdAt)}
                </span>
              </div>
              <div
                className="muted"
                style={{
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.lastMessage
                    ? `${r.lastMessage.senderIsMe ? 'Você: ' : ''}${r.lastMessage.content}`
                    : 'Match novo ✨'}
                </span>
                {r.unread > 0 && (
                  <span
                    className="unread-badge"
                    style={{
                      background: 'var(--pink)',
                      color: '#fff',
                      borderRadius: 'var(--radius-pill)',
                      minWidth: 20,
                      height: 20,
                      padding: '0 6px',
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 0 12px var(--pink-glow)',
                    }}
                  >
                    {r.unread > 99 ? '99+' : r.unread}
                  </span>
                )}
              </div>
            </div>
          </button>
          ))}
        </div>
      )}
    </div>
  );
}
