import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Profile } from '../../lib/supabase';
import {
  LONG_PRESS_MS,
  MAX_PHOTO_SLOTS,
  REWIND_ENTER_MS,
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
  onOpenDetail?: (profileId: string) => void;
  onOpenSafety?: (profileId: string, profileName: string | null) => void;
  /**
   * When set, the card animates in from this side (used by the rewind feature).
   * 'super' enters from the bottom.
   */
  enterFrom?: SwipeDirection | null;
  /**
   * When set by the parent (e.g. action button press), the top card plays its
   * exit animation as if the user had dragged past threshold.
   */
  exitTrigger?: SwipeDirection | null;
}

function SwipeCardImpl({
  profile,
  photos,
  stackIndex,
  onSwipe,
  onOpenDetail,
  onOpenSafety,
  enterFrom = null,
  exitTrigger = null,
}: Props) {
  const { t } = useTranslation('swipe');
  const cardRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const exitFiredRef = useRef<SwipeDirection | null>(null);
  const [delta, setDelta] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState<SwipeDirection | null>(null);
  const [entering, setEntering] = useState<SwipeDirection | null>(enterFrom);
  const [photoIdx, setPhotoIdx] = useState(0);

  const visiblePhotos = photos.slice(0, MAX_PHOTO_SLOTS);
  const isTop = stackIndex === 0;
  const showAge = profile.show_age !== false;
  const age = showAge ? ageFromBirthdate(profile.birthdate) : null;

  useEffect(() => {
    if (!entering) return;
    // double-rAF: paint the starting offset, then animate to (0,0)
    const id = window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => setEntering(null)),
    );
    return () => window.cancelAnimationFrame(id);
  }, [entering]);

  // Button-triggered exit: play the same card-fling animation as a drag swipe.
  // exitFiredRef prevents re-firing if the component re-renders while animating.
  useEffect(() => {
    if (!exitTrigger || exitTrigger === exitFiredRef.current) return;
    exitFiredRef.current = exitTrigger;
    if (isTop && !exiting) triggerExit(exitTrigger);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exitTrigger]);

  function cancelLongPress() {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function openDetail() {
    if (!onOpenDetail) return;
    onOpenDetail(profile.id);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!isTop || exiting) return;
    startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    longPressTimerRef.current = window.setTimeout(() => {
      openDetail();
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
      openDetail();
      setDelta({ x: 0, y: 0 });
      return;
    }

    // Velocity-based commit: a fast flick triggers the swipe even if the
    // positional threshold hasn't been crossed yet. 0.4 px/ms ≈ 400 px/s.
    const vx = dt > 10 ? Math.abs(dx) / dt : 0;
    const VELOCITY_THRESHOLD = 0.4;

    if (dx > threshold || (dx > 20 && vx > VELOCITY_THRESHOLD)) {
      triggerExit('right');
      return;
    }
    if (dx < -threshold || (dx < -20 && vx > VELOCITY_THRESHOLD)) {
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
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relX = clientX - rect.left;
    if (relX < rect.width * 0.33) {
      setPhotoIdx((i) => Math.max(0, i - 1));
    } else if (relX > rect.width * 0.66) {
      setPhotoIdx((i) => Math.min(visiblePhotos.length - 1, i + 1));
    } else {
      // middle tap → open detail (Tinder uses tap-to-cycle-photos only;
      // we differentiate by treating the center column as a "more info" tap)
      openDetail();
    }
  }

  useEffect(() => () => cancelLongPress(), []);

  const rotate = isTop ? Math.max(-15, Math.min(15, delta.x / 12)) : 0;
  const nopeOpacity = isTop ? Math.min(1, Math.max(0, -delta.x / 100)) : 0;
  const likeOpacity = isTop ? Math.min(1, Math.max(0, delta.x / 100)) : 0;
  const superOpacity = isTop && delta.y < 0 ? Math.min(1, Math.max(0, -delta.y / 80)) : 0;

  const baseTransform = (() => {
    if (!isTop) {
      const offset = stackIndex * 12;
      const scale = 1 - stackIndex * 0.05;
      return `translate3d(0, ${offset}px, 0) scale(${scale})`;
    }
    if (entering) {
      const w = (cardRef.current?.offsetWidth ?? 320) * 1.6;
      const startX = entering === 'left' ? -w : entering === 'right' ? w : 0;
      const startY = entering === 'super' ? window.innerHeight : 0;
      return `translate3d(${startX}px, ${startY}px, 0)`;
    }
    return `translate3d(${delta.x}px, ${delta.y}px, 0) rotate(${rotate}deg)`;
  })();

  const transitionStyle = (() => {
    if (dragging) return 'none';
    if (entering) {
      // Custom curve for rewind — spring overshoot reads as deliberate undo.
      return `transform ${REWIND_ENTER_MS}ms var(--ease-spring)`;
    }
    if (exiting) {
      // Fling off: fast ease-out so the card accelerates away quickly.
      return 'transform var(--dur-slow) var(--ease-out)';
    }
    // Spring-back: bounce back to center with overshoot so releasing near the
    // threshold feels satisfying rather than just snapping back.
    return 'transform var(--dur-spring) var(--ease-spring)';
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
        boxShadow: 'var(--shadow-lg)',
        backgroundColor: 'var(--card)',
        backgroundImage: currentPhoto ? `url("${currentPhoto}")` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        transform: baseTransform,
        transition: transitionStyle,
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
                background:
                  i === photoIdx
                    ? 'linear-gradient(90deg, var(--pink), var(--hot))'
                    : 'rgba(255, 255, 255, 0.32)',
                boxShadow: i === photoIdx ? '0 0 8px var(--pink-glow)' : undefined,
                transition:
                  'background var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)',
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
          border: '3px solid var(--danger)',
          borderRadius: 8,
          color: 'var(--danger)',
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
          border: '3px solid var(--pink-glow)',
          borderRadius: 8,
          color: 'var(--pink-glow)',
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
      <div
        style={{
          position: 'absolute',
          top: 28,
          left: 0,
          right: 0,
          textAlign: 'center',
          padding: '6px 12px',
          color: 'var(--aurora)',
          fontWeight: 900,
          fontSize: 22,
          letterSpacing: '0.1em',
          opacity: superOpacity,
          zIndex: 4,
          pointerEvents: 'none',
        }}
        aria-hidden
      >
        ⭐ SUPER
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
            'linear-gradient(to top, rgba(6, 0, 15, 0.94), rgba(6, 0, 15, 0.55) 50%, transparent)',
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
                color: 'var(--online)',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--online)',
                  boxShadow: '0 0 8px var(--online-glow)',
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
          {!profile.hide_distance && formatDistanceKm(profile.distance_km) && (
            <span>· {formatDistanceKm(profile.distance_km)}</span>
          )}
          {!isOnline(profile.last_active_at) && formatLastActive(profile.last_active_at) && (
            <span style={{ opacity: 0.75 }}>· {formatLastActive(profile.last_active_at)}</span>
          )}
        </div>
      </div>

      {/* Info button (top-right) — opens the full profile modal */}
      {isTop && onOpenDetail && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openDetail();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={t('actions.open_profile')}
          className="icon-btn"
          style={{
            position: 'absolute',
            top: 12,
            right: 14,
            width: 40,
            height: 40,
            borderRadius: 999,
            background: 'rgba(10, 0, 20, 0.55)',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            fontSize: 18,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 5,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          ⓘ
        </button>
      )}

      {/* Report / block button (top-right, left of info) */}
      {isTop && onOpenSafety && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenSafety(profile.id, profile.name ?? null);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={t('actions.report_block')}
          className="icon-btn"
          style={{
            position: 'absolute',
            top: 12,
            right: 62,
            width: 40,
            height: 40,
            borderRadius: 999,
            background: 'rgba(10, 0, 20, 0.55)',
            color: '#fff',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            fontSize: 18,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 5,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          ⋮
        </button>
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
          <button type="button" onClick={() => triggerExit('left')} aria-label={`${t('actions.pass')} ${profile.name ?? ''}`}>
            {t('actions.pass')}
          </button>
          <button type="button" onClick={() => triggerExit('right')} aria-label={`${t('actions.like')} ${profile.name ?? ''}`}>
            {t('actions.like')}
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
    prev.photos === next.photos &&
    prev.enterFrom === next.enterFrom &&
    prev.exitTrigger === next.exitTrigger &&
    prev.onOpenDetail === next.onOpenDetail &&
    prev.onOpenSafety === next.onOpenSafety
  );
});
