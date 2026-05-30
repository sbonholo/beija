import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast';

interface Liker {
  swiper_id: string;
  swiper_name: string | null;
  swiper_age: number | null;
  swiper_bio: string | null;
  swiper_photo_url: string | null;
  direction: 'right' | 'super';
  swiped_at: string;
}

export function LikesYouScreen() {
  const nav = useNavigate();
  const toast = useToast();
  const [meId, setMeId] = useState<string | null>(null);
  const [likers, setLikers] = useState<Liker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        nav('/signin', { replace: true });
        return;
      }
      setMeId(uid);
      const { data, error: rpcErr } = await supabase.rpc('who_liked_me');
      if (rpcErr) throw rpcErr;
      setLikers((data as Liker[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load_failed');
    } finally {
      setLoading(false);
    }
  }, [nav]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(liker: Liker, action: 'like' | 'pass') {
    if (!meId || busyId) return;
    setBusyId(liker.swiper_id);
    try {
      // Insert my swipe back. If I'm liking back, the trigger creates the match.
      const direction = action === 'like' ? 'right' : 'left';
      const { error: swipeErr } = await supabase.from('swipes').insert({
        swiper_id: meId,
        swipee_id: liker.swiper_id,
        direction,
      });
      if (swipeErr) throw swipeErr;

      if (action === 'like') {
        const lo = meId < liker.swiper_id ? meId : liker.swiper_id;
        const hi = meId < liker.swiper_id ? liker.swiper_id : meId;
        const { data: matchRow } = await supabase
          .from('matches')
          .select('id')
          .eq('user1_id', lo)
          .eq('user2_id', hi)
          .maybeSingle();
        if (matchRow) {
          // Fire push to both sides (best-effort) and jump straight into chat.
          try {
            await supabase.functions.invoke('notify_match', {
              body: { match_id: matchRow.id },
            });
          } catch {
            /* best-effort */
          }
          nav(`/chat/${matchRow.id}`);
          return;
        }
      } else {
        toast({ kind: 'info', text: 'Tudo bem, próximo.' });
      }
      setLikers((cur) => cur.filter((l) => l.swiper_id !== liker.swiper_id));
    } catch (e) {
      toast({ kind: 'info', text: e instanceof Error ? e.message : 'Erro.' });
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="screen">
        <div className="header">
          <button className="chip" onClick={() => nav(-1)} aria-label="Voltar">←</button>
          <h2 style={{ margin: 0 }}>Curtiram você</h2>
          <div style={{ width: 40 }} />
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 12,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="skeleton card"
              style={{ aspectRatio: '3 / 4' }}
              aria-hidden
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="screen" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginTop: '20vh' }}>⚠️</div>
        <h2 style={{ marginTop: 10 }}>Não rolou carregar</h2>
        <p className="muted">{error}</p>
        <button className="btn" style={{ marginTop: 16, maxWidth: 260 }} onClick={() => void load()}>
          Tentar de novo
        </button>
      </div>
    );
  }

  if (likers.length === 0) {
    return (
      <div className="screen">
        <div className="header">
          <button className="chip" onClick={() => nav(-1)} aria-label="Voltar">←</button>
          <h2 style={{ margin: 0 }}>Curtiram você</h2>
          <div style={{ width: 40 }} />
        </div>
        <div className="empty">
          <div className="big">💋</div>
          <p>Ninguém curtiu você ainda. Vai swipando que logo aparece!</p>
          <button
            className="btn"
            style={{ marginTop: 16, maxWidth: 240 }}
            onClick={() => nav('/discover')}
          >
            Voltar pro deck
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen" style={{ paddingBottom: 40 }}>
      <div className="header">
        <button className="chip" onClick={() => nav(-1)} aria-label="Voltar">←</button>
        <h2 style={{ margin: 0 }}>
          Curtiram você{' '}
          <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>({likers.length})</span>
        </h2>
        <div style={{ width: 40 }} />
      </div>

      <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 16 }}>
        Curta de volta e o match acontece na hora.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12,
        }}
      >
        {likers.map((liker) => (
          <div
            key={liker.swiper_id}
            style={{
              position: 'relative',
              borderRadius: 'var(--radius)',
              overflow: 'hidden',
              aspectRatio: '3 / 4',
              backgroundColor: '#1c0a2b',
              backgroundImage: liker.swiper_photo_url ? `url("${liker.swiper_photo_url}")` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              boxShadow: '0 6px 20px rgba(0, 0, 0, 0.4)',
              opacity: busyId === liker.swiper_id ? 0.5 : 1,
              transition: 'opacity 0.2s ease',
            }}
          >
            {liker.direction === 'super' && (
              <span
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  background: 'var(--aurora)',
                  color: '#fff',
                  borderRadius: 'var(--radius-pill)',
                  padding: '3px 9px',
                  fontSize: 11,
                  fontWeight: 700,
                  zIndex: 2,
                  boxShadow: '0 0 12px var(--aurora-glow)',
                }}
              >
                ⭐ Super
              </span>
            )}
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                padding: '40px 12px 12px',
                background:
                  'linear-gradient(to top, rgba(10, 0, 20, 0.95), rgba(10, 0, 20, 0.3) 70%, transparent)',
                color: '#fff',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <strong style={{ fontSize: 16 }}>{liker.swiper_name ?? 'Alguém'}</strong>
                {liker.swiper_age != null && (
                  <span style={{ fontSize: 14, opacity: 0.85 }}>{liker.swiper_age}</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => void decide(liker, 'pass')}
                  disabled={busyId === liker.swiper_id}
                  aria-label={`Passar ${liker.swiper_name ?? 'perfil'}`}
                  style={{
                    flex: 1,
                    height: 36,
                    borderRadius: 999,
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: 'var(--danger)',
                    border: '1px solid rgba(255, 69, 69, 0.4)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
                <button
                  type="button"
                  onClick={() => void decide(liker, 'like')}
                  disabled={busyId === liker.swiper_id}
                  aria-label={`Curtir ${liker.swiper_name ?? 'perfil'}`}
                  style={{
                    flex: 1,
                    height: 36,
                    borderRadius: 999,
                    background: 'linear-gradient(120deg, var(--pink), var(--hot))',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ♥
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
