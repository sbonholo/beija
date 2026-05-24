import { memo, useEffect, useRef, useState } from 'react';
import type { Profile } from '../../lib/supabase';
import {
  LONG_PRESS_MS,
  MAX_PHOTO_SLOTS,
  SWIPE_EXIT_MS,
  SWIPE_THRESHOLD_PCT,
  SWIPE_UP_THRESHOLD_PX,
  TAP_TOLERANCE_PX,
} from '../../lib/constants';
import { ageFromBirthdate, formatDistanceKm, formatLastActive, isOnline } from '../../lib/labels';

export type SwipeDirection = 'left' | 'right' | 'super';

/** Profile fields needed by the card — accepts the base Profile plus the
 *  extra distance_km computed by find_potential_matches. */
export type SwipeCardProfile = Profile & { distance_km?: number | null };

interface Props {
  profile: SwipeCardProfile;
  photos: string[];
  interests?: string[];
  stackIndex: number;
  onSwipe: (direction: SwipeDirection) => void;
}

function SwipeCardImpl({ profile, photos, interests = [], stackIndex, onSwipe }: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const [delta, setDelta] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState<SwipeDirection | null>(null);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const visiblePhotos = photos.slice(0, MAX_PHOTO_SLOTS);
  const isTop = stackIndex === 0;
  const age = ageFromBirthdate(profile.birthdate);

  function cancelLongPress() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!isTop || exiting) return;
    startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    longPressTimerRef.current = window.setTimeout(() => {
      setRevealed(true);
    }, LONG_PRESS_MS);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || !startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (Math.abs(dx) > TAP_TOLERANCE_PX || Math.abs(dy) > TAP_TOLERANCE_PX) {
      cancelLongPress();
    }
    setDelta({ x: dx, y: dy });
  }

  function onPointerUp(e: React.PointerEvent) {
    cancelLongPress();
    if (!startRef.current) return;
    const start = startRef.current;
    startRef.current = null;
    setDragging(false);

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const dt = Date.now() - start.t;
    const width = cardRef.current?.offsetWidth ?? 300;
    const threshold = width * SWIPE_THRESHOLD_PCT;

    if (Math.abs(dx) < TAP_TOLERANCE_PX && Math.abs(dy) < TAP_TOLERANCE_PX && dt < 250) {
      onTap(e.clientX);
      setDelta({ x: 0, y: 0 });
      return;
    }

    if (dy < -SWIPE_UP_THRESHOLD_PX && Math.abs(dy) > Math.abs(dx)) {
      setRevealed(true);
      setDelta({ x: 0, y: 0 });
      return;
    }

    if (dx > threshold) {
      triggerExit('right');
      return;
    }
    if (dx < -threshold) {
      triggerExit('left');
      return;
    }
    setDelta({ x: 0, y: 0 });
  }

  function triggerExit(direction: SwipeDirection) {
    setExiting(direction);
    const width = (cardRef.current?.offsetWidth ?? 300) * 1.6;
    setDelta({
      x: direction === 'left' ? -width : direction === 'right' ? width : 0,
      y: direction === 'super' ? -window.innerHeight : 0,
    });
    window.setTimeout(() => onSwipe(direction), SWIPE_EXIT_MS);
  }

  function onTap(clientX: number) {
    if (revealed) {
      setRevealed(false);
      return;
    }
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relX = clientX - rect.left;
    if (relX < rect.width * 0.33) {
      setPhotoIdx((i) => Math.max(0, i - 1));
    } else if (relX > rect.width * 0.66) {
      setPhotoIdx((i) => Math.min(visiblePhotos.length - 1, i + 1));
    }
  }

  useEffect(() => () => cancelLongPress(), []);

  const rotate = isTop ? Math.max(-15, Math.min(15, delta.x / 12)) : 0;
  const nopeOpacity = isTop ? Math.min(1, Math.max(0, -delta.x / 100)) : 0;
  const likeOpacity = isTop ? Math.min(1, Math.max(0, delta.x / 100)) : 0;

  const baseTransform = (() => {
    if (!isTop) {
      const offset = stackIndex * 12;
      const scale = 1 - stackIndex * 0.05;
      return `translate3d(0, ${offset}px, 0) scale(${scale})`;
    }
    return `translate3d(${delta.x}px, ${delta.y}px, 0) rotate(${rotate}deg)`;
  })();

  const currentPhoto = visiblePhotos[photoIdx];

  return (
    <div
      ref={cardRef}
      className="swipe-card"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
        backgroundColor: '#1c0a2b',
        backgroundImage: currentPhoto ? `url("${currentPhoto}")` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        transform: baseTransform,
        transition: dragging ? 'none' : 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
        touchAction: 'none',
        cursor: isTop ? (dragging ? 'grabbing' : 'grab') : 'default',
        pointerEvents: isTop && !exiting ? 'auto' : 'none',
        zIndex: 100 - stackIndex,
      }}
    >
      {/* Photo progress segments */}
      {visiblePhotos.length > 1 && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            right: 12,
            display: 'flex',
            gap: 4,
            zIndex: 3,
          }}
          aria-hidden
        >
          {visiblePhotos.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                background: i === photoIdx ? '#fff' : 'rgba(255, 255, 255, 0.35)',
                transition: 'background 0.15s ease',
              }}
            />
          ))}
        </div>
      )}

      {/* NOPE / LIKE overlays */}
      <div
        style={{
          position: 'absolute',
          top: 28,
          left: 18,
          padding: '6px 12px',
          border: '3px solid #ff5b5b',
          borderRadius: 8,
          color: '#ff5b5b',
          fontWeight: 900,
          fontSize: 22,
          letterSpacing: '0.1em',
          transform: 'rotate(-14deg)',
          opacity: nopeOpacity,
          zIndex: 4,
          pointerEvents: 'none',
        }}
        aria-hidden
      >
        NOPE
      </div>
      <div
        style={{
          position: 'absolute',
          top: 28,
          right: 18,
          padding: '6px 12px',
          border: '3px solid #4ade80',
          borderRadius: 8,
          color: '#4ade80',
          fontWeight: 900,
          fontSize: 22,
          letterSpacing: '0.1em',
          transform: 'rotate(14deg)',
          opacity: likeOpacity,
          zIndex: 4,
          pointerEvents: 'none',
        }}
        aria-hidden
      >
        LIKE
      </div>

      {/* Bottom gradient + info */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '60px 18px 22px',
          background:
            'linear-gradient(to top, rgba(10, 0, 20, 0.92), rgba(10, 0, 20, 0.5) 50%, transparent)',
          color: '#fff',
          zIndex: 2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <strong style={{ fontSize: 26 }}>{profile.name ?? '—'}</strong>
          {age != null && (
            <span style={{ fontSize: 22, fontWeight: 400, opacity: 0.9 }}>{age}</span>
          )}
          {isOnline(profile.last_active_at) && (
            <span
              aria-label="online agora"
              title="online agora"
              style={{
                marginLeft: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: '#4ade80',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#4ade80',
                  boxShadow: '0 0 8px rgba(74, 222, 128, 0.8)',
                  display: 'inline-block',
                }}
              />
              online
            </span>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 10,
            fontSize: 13,
            opacity: 0.85,
            marginTop: 4,
            flexWrap: 'wrap',
          }}
        >
          {profile.city && <span>📍 {profile.city}</span>}
          {formatDistanceKm(profile.distance_km) && (
            <span>· {formatDistanceKm(profile.distance_km)}</span>
          )}
          {!isOnline(profile.last_active_at) && formatLastActive(profile.last_active_at) && (
            <span style={{ opacity: 0.75 }}>· {formatLastActive(profile.last_active_at)}</span>
          )}
        </div>
      </div>

      {/* Revealed bio overlay (swipe-up or long-press) */}
      {revealed && (
        <div
          onPointerDown={(e) => {
            e.stopPropagation();
            setRevealed(false);
          }}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 5,
            background: 'rgba(10, 0, 20, 0.92)',
            backdropFilter: 'blur(8px)',
            padding: '24px 22px',
            color: '#fff',
            overflowY: 'auto',
            animation: 'sheetUp 0.22s ease',
          }}
          role="dialog"
          aria-label={`Detalhes de ${profile.name ?? 'perfil'}`}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
            <strong style={{ fontSize: 24 }}>{profile.name ?? '—'}</strong>
            {age != null && (
              <span style={{ fontSize: 20, fontWeight: 400, opacity: 0.85 }}>{age}</span>
            )}
          </div>
          {profile.bio && <p style={{ lineHeight: 1.45 }}>{profile.bio}</p>}
          {interests.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>Interesses</div>
              <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                {interests.map((i) => (
                  <span key={i} className="chip" style={{ pointerEvents: 'none', minHeight: 32, padding: '6px 12px' }}>
                    {i}
                  </span>
                ))}
              </div>
            </div>
          )}
          <p className="muted" style={{ fontSize: 12, marginTop: 18 }}>
            Toque pra voltar
          </p>
        </div>
      )}

      {/* Accessibility alternative buttons (visually hidden, focusable) */}
      {isTop && (
        <div
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            margin: -1,
            padding: 0,
            overflow: 'hidden',
            border: 0,
            clipPath: 'inset(50%)',
            whiteSpace: 'nowrap',
          }}
        >
          <button type="button" onClick={() => triggerExit('left')} aria-label={`Recusar ${profile.name ?? 'perfil'}`}>
            Recusar
          </button>
          <button type="button" onClick={() => triggerExit('right')} aria-label={`Curtir ${profile.name ?? 'perfil'}`}>
            Curtir
          </button>
        </div>
      )}
    </div>
  );
}

export const SwipeCard = memo(SwipeCardImpl, (prev, next) => {
  return (
    prev.profile.id === next.profile.id &&
    prev.stackIndex === next.stackIndex &&
    prev.photos === next.photos
  );
});
