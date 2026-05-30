import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, type Profile } from '../../lib/supabase';

const CONFETTI_PIECES = 32;
// Brand celebration palette only — pink, hot, pink-glow, gold, aurora.
// Aqua (--online) is reserved for the online-status dot semantic; off-brand
// in a match celebration. Tokens kept inline because hex is what the
// inline style consumes.
const CONFETTI_COLORS = ['#e01070', '#ff6530', '#ff3b9a', '#ffd040', '#8b5cf6'];

interface Props {
  matchId: string;
  other: Profile & { photos?: string[] };
  onClose: () => void;
}

export function MatchModal({ matchId, other, onClose }: Props) {
  const nav = useNavigate();
  const [text, setText] = useState(`Oi ${other.name ?? ''}!`.trim());
  const [sending, setSending] = useState(false);
  const [mePhoto, setMePhoto] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from('photos')
        .select('url')
        .eq('user_id', auth.user.id)
        .eq('slot', 0)
        .maybeSingle();
      if (!cancelled) setMePhoto(data?.url ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const otherPhoto = other.photos?.[0] ?? null;

  async function send() {
    if (sending) return;
    // If the user cleared the textarea, fall back to the pre-filled greeting
    // so "Enviar mensagem" stays a true 1-tap path.
    const content = text.trim() || `Oi ${other.name ?? ''}!`.trim();
    setSending(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const senderId = auth.user?.id;
      if (!senderId) throw new Error('not_authenticated');
      const { error } = await supabase.from('messages').insert({
        match_id: matchId,
        sender_id: senderId,
        content,
      });
      if (error) throw error;
      onClose();
      nav(`/chat/${matchId}`);
    } catch (e) {
      console.warn('[MatchModal] send failed:', e);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="match-modal-bg"
      role="dialog"
      aria-modal="true"
      style={{ overflow: 'hidden' }}
    >
      {/* Confetti */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        {Array.from({ length: CONFETTI_PIECES }).map((_, i) => {
          const left = (i / CONFETTI_PIECES) * 100 + Math.random() * 4 - 2;
          const delay = Math.random() * 0.6;
          const duration = 3 + Math.random() * 1.8;
          const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
          const size = 8 + Math.random() * 6;
          return (
            <span
              key={i}
              className="confetti-piece"
              style={{
                left: `${left}%`,
                width: size,
                height: size * 0.4,
                background: color,
                animationDelay: `${delay}s`,
                animationDuration: `${duration}s`,
              }}
            />
          );
        })}
      </div>

      <div className="match-modal" onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
        <h1 className="title">Vocês deram match!</h1>
        <p className="muted">É beijo na boca!</p>

        <div className="photos">
          <div className="ph-wrap">
            <div
              className="ph"
              style={mePhoto ? { backgroundImage: `url("${mePhoto}")` } : undefined}
            />
          </div>
          <div className="ph-wrap">
            <div
              className="ph"
              style={otherPhoto ? { backgroundImage: `url("${otherPhoto}")` } : undefined}
            />
          </div>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={200}
          placeholder={`Oi ${other.name ?? ''}!`}
          style={{ marginBottom: 12 }}
          aria-label="Primeira mensagem"
        />

        <button
          className="btn"
          disabled={sending}
          onClick={send}
        >
          {sending ? 'Enviando...' : 'Enviar mensagem 💬'}
        </button>
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={onClose}>
          Continuar swipe
        </button>
      </div>
    </div>
  );
}
