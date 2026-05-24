import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, type Match, type Message } from '../../lib/supabase';
import { MessageBubble } from './MessageBubble';
import { BlockButton } from '../Moderation/BlockButton';
import { ReportModal } from '../Moderation/ReportModal';

interface OtherInfo {
  id: string;
  name: string | null;
  photoUrl: string | null;
}

const TYPING_TIMEOUT_MS = 3000;

export function ChatScreen() {
  const { id: matchId } = useParams<{ id: string }>();
  const nav = useNavigate();

  const [meId, setMeId] = useState<string | null>(null);
  const [other, setOther] = useState<OtherInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef(0);

  const visibleMessages = useMemo(
    () => messages.filter((m) => !m.deleted_at),
    [messages],
  );

  const markRead = useCallback(async (uid: string, mid: string) => {
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('match_id', mid)
      .neq('sender_id', uid)
      .is('read_at', null);
  }, []);

  useEffect(() => {
    if (!matchId) {
      nav('/matches', { replace: true });
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) {
          nav('/signin', { replace: true });
          return;
        }
        if (cancelled) return;
        setMeId(uid);

        const { data: match, error: matchErr } = await supabase
          .from('matches')
          .select('id, user1_id, user2_id, created_at, last_message_at')
          .eq('id', matchId)
          .maybeSingle();
        if (matchErr) throw matchErr;
        if (!match) {
          setError('match_not_found');
          return;
        }
        const otherId = (match as Match).user1_id === uid
          ? (match as Match).user2_id
          : (match as Match).user1_id;

        const [{ data: profile }, { data: photoRow }, { data: msgs }] = await Promise.all([
          supabase.from('profiles').select('id, name').eq('id', otherId).maybeSingle(),
          supabase.from('photos').select('url').eq('user_id', otherId).eq('slot', 0).maybeSingle(),
          supabase
            .from('messages')
            .select('id, match_id, sender_id, content, read_at, created_at, deleted_at')
            .eq('match_id', matchId)
            .order('created_at', { ascending: true }),
        ]);
        if (cancelled) return;
        setOther({
          id: otherId,
          name: (profile as { name: string | null } | null)?.name ?? null,
          photoUrl: (photoRow as { url: string } | null)?.url ?? null,
        });
        setMessages((msgs ?? []) as Message[]);
        await markRead(uid, matchId);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'load_failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [matchId, nav, markRead]);

  // Realtime + presence
  useEffect(() => {
    if (!matchId || !meId) return;
    const channel = supabase.channel(`chat-${matchId}`, {
      config: { presence: { key: meId } },
    });
    channelRef.current = channel;

    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
          if (m.sender_id !== meId) {
            void markRead(meId, matchId);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((cur) => cur.map((x) => (x.id === m.id ? m : x)));
        },
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState() as Record<string, Array<{ userId?: string; typing?: boolean }>>;
        const others = Object.values(state).flat().filter((p) => p.userId && p.userId !== meId);
        setOtherTyping(others.some((p) => !!p.typing));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void channel.track({ userId: meId, typing: false });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [matchId, meId, markRead]);

  // Auto-scroll
  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [visibleMessages.length, otherTyping]);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [text]);

  function broadcastTyping(typing: boolean) {
    const ch = channelRef.current;
    if (!ch || !meId) return;
    const now = Date.now();
    if (typing && now - lastTypingSentRef.current < 800) return;
    lastTypingSentRef.current = now;
    void ch.track({ userId: meId, typing });
  }

  function onTextChange(v: string) {
    setText(v);
    broadcastTyping(true);
    if (typingTimerRef.current !== null) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => broadcastTyping(false), TYPING_TIMEOUT_MS);
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!matchId || !meId || !text.trim() || sending) return;
    setSending(true);
    const draft = text.trim();
    setText('');
    broadcastTyping(false);
    try {
      const { data: msg, error: insertErr } = await supabase
        .from('messages')
        .insert({ match_id: matchId, sender_id: meId, content: draft })
        .select('id, match_id, sender_id, content, read_at, created_at, deleted_at')
        .single();
      if (insertErr) throw insertErr;
      if (msg) {
        setMessages((cur) => (cur.some((x) => x.id === msg.id) ? cur : [...cur, msg as Message]));
      }
      // Best-effort push notification trigger (edge function placeholder).
      try {
        await supabase.functions.invoke('notify_new_message', {
          body: { match_id: matchId, sender_id: meId, preview: draft.slice(0, 80) },
        });
      } catch {
        /* swallow — push delivery is best-effort */
      }
    } catch {
      setText(draft);
    } finally {
      setSending(false);
    }
  }

  async function deleteMessage(id: string) {
    if (!confirm('Apagar essa mensagem?')) return;
    setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, deleted_at: new Date().toISOString() } : m)));
    await supabase
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
  }

  if (loading) {
    return (
      <div className="screen">
        <p className="muted">Carregando conversa...</p>
      </div>
    );
  }

  if (error || !other) {
    return (
      <div className="screen" style={{ textAlign: 'center', paddingTop: '20vh' }}>
        <div style={{ fontSize: 48 }}>😕</div>
        <h2 style={{ margin: '8px 0' }}>Conversa indisponível</h2>
        <p className="muted">{error === 'match_not_found' ? 'Esse match não existe mais.' : 'Tente de novo em uns instantes.'}</p>
        <button className="btn" style={{ marginTop: 16, maxWidth: 240 }} onClick={() => nav('/matches')}>
          Voltar pra matches
        </button>
      </div>
    );
  }

  return (
    <div
      className="screen"
      style={{ paddingBottom: 0, height: '100vh', display: 'flex', flexDirection: 'column' }}
    >
      <div className="header">
        <button className="chip" onClick={() => nav('/matches')} aria-label="Voltar">←</button>
        <div className="row center" style={{ gap: 10, flex: 1, justifyContent: 'center' }}>
          <div
            className="avatar matched"
            style={{
              width: 36,
              height: 36,
              backgroundImage: other.photoUrl ? `url("${other.photoUrl}")` : undefined,
            }}
          />
          <div>
            <div style={{ fontWeight: 700 }}>{other.name ?? 'Match'}</div>
            {otherTyping && (
              <div className="muted" style={{ fontSize: 11 }}>digitando…</div>
            )}
          </div>
        </div>
        <button className="chip" onClick={() => setMenuOpen((o) => !o)} aria-label="Mais opções">⋮</button>
      </div>

      {menuOpen && (
        <div
          onClick={() => setMenuOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 480,
              background: 'var(--card)',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: '14px 18px calc(20px + env(safe-area-inset-bottom))',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <button
              className="btn ghost"
              onClick={() => {
                setMenuOpen(false);
                setReportOpen(true);
              }}
            >
              🚩 Denunciar
            </button>
            <BlockButton
              targetUserId={other.id}
              targetName={other.name ?? undefined}
              variant="ghost"
              onBlocked={() => nav('/matches', { replace: true })}
            />
            <button className="btn ghost" onClick={() => setMenuOpen(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {reportOpen && (
        <ReportModal
          reportedUserId={other.id}
          reportedName={other.name ?? undefined}
          onClose={() => setReportOpen(false)}
          onReported={() => nav('/matches', { replace: true })}
        />
      )}

      <div ref={listRef} className="chat-list" style={{ padding: '8px 14px' }}>
        {visibleMessages.length === 0 && (
          <p
            className="muted"
            style={{ textAlign: 'center', marginTop: 'auto', marginBottom: 'auto' }}
          >
            É match! Manda a primeira 💋
          </p>
        )}
        {visibleMessages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            isOwn={m.sender_id === meId}
            onDelete={m.sender_id === meId ? () => deleteMessage(m.id) : undefined}
          />
        ))}
        {otherTyping && (
          <div
            className="chat-message theirs"
            aria-live="polite"
            style={{ opacity: 0.7, fontStyle: 'italic' }}
          >
            digitando…
          </div>
        )}
      </div>

      <form onSubmit={send} className="chat-input">
        <textarea
          ref={textareaRef}
          placeholder="Mensagem"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          maxLength={2000}
          rows={1}
          style={{ flex: 1, resize: 'none', maxHeight: 120, paddingTop: 12, paddingBottom: 12 }}
        />
        <button className="btn" disabled={!text.trim() || sending}>
          Enviar
        </button>
      </form>
    </div>
  );
}
