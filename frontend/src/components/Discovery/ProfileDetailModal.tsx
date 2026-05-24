import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { fetchProfileSafe, type SafeProfile } from '../../lib/profiles';
import { ReportModal } from '../Moderation/ReportModal';
import { useToast } from '../Toast';
import { formatDistanceKm } from '../../lib/labels';
import { track } from '../../lib/analytics';
import { captureSentryException } from '../../lib/sentry';

function ageFromBirthdate(birthdate: string | null): number | null {
  if (!birthdate) return null;
  const d = new Date(birthdate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
}

export default function ProfileDetailModal() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const toast = useToast();
  const { t } = useTranslation('profile');
  const { t: tSwipe } = useTranslation('swipe');
  const [meId, setMeId] = useState<string | null>(null);
  const [profile, setProfile] = useState<SafeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    nav(-1);
  }, [nav]);

  // Fetch via privacy-sanitizing RPC — server has already applied show_age /
  // hide_distance / block / report / deleted filters by the time we get data.
  useEffect(() => {
    if (!id) return;
    track('profile_detail_opened', { source: 'direct_url' });
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const { data: authData } = await supabase.auth.getUser();
        const myId = authData.user?.id;
        if (!myId) {
          nav('/signin', { replace: true });
          return;
        }
        if (cancelled) return;
        setMeId(myId);

        const safe = await fetchProfileSafe(id);
        if (cancelled) return;
        if (!safe) {
          setError('not_found');
          return;
        }
        setProfile(safe);
      } catch (e) {
        if (!cancelled) {
          captureSentryException(e, { component: 'ProfileDetailModal', targetId: id });
          setError(e instanceof Error ? e.message : 'load_failed');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, nav]);

  // ESC closes + focus the close button on mount
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKey);
    closeBtnRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  // Focus trap inside the modal
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !node) return;
      const focusable = node.querySelectorAll<HTMLElement>(
        'a, button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    node.addEventListener('keydown', onKey);
    return () => node.removeEventListener('keydown', onKey);
  }, []);

  async function doSwipe(direction: 'left' | 'right') {
    if (!profile || !meId || acting) return;
    setActing(true);
    try {
      const { error: insErr } = await supabase.from('swipes').insert({
        swiper_id: meId,
        swipee_id: profile.id,
        direction,
      });
      if (insErr) throw insErr;
      toast({ kind: 'info', text: direction === 'right' ? 'Curtido 💋' : 'Passado' });
      close();
    } catch (e) {
      toast({ kind: 'info', text: e instanceof Error ? e.message : 'Erro' });
    } finally {
      setActing(false);
    }
  }

  async function doBlock() {
    if (!profile || !meId) return;
    setMenuOpen(false);
    try {
      const { error: bErr } = await supabase
        .from('blocks')
        .insert({ blocker_id: meId, blocked_id: profile.id });
      if (bErr) throw bErr;
      toast({ kind: 'info', text: 'Usuário bloqueado.' });
      close();
    } catch (e) {
      toast({ kind: 'info', text: e instanceof Error ? e.message : 'Erro ao bloquear' });
    }
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={profile?.name ? `${t('title')}: ${profile.name}` : t('title')}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg, #0a0014)',
        zIndex: 200,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {/* Header (fixed at top) */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding:
            'calc(env(safe-area-inset-top) + 12px) 16px 12px 16px',
          background: 'rgba(10, 0, 20, 0.7)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <button
          type="button"
          ref={closeBtnRef}
          onClick={close}
          aria-label={t('detail.close')}
          className="icon-btn"
          style={iconBtnStyle}
        >
          ✕
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          {profile && (
            <>
              <strong style={{ display: 'block', fontSize: 18 }}>
                {profile.name ?? '—'}
                {profile.show_age && (
                  <AgeSpan birthdate={profile.birthdate} />
                )}
              </strong>
              <DistanceSubtitle profile={profile} />
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={t('detail.more')}
          aria-expanded={menuOpen}
          className="icon-btn"
          style={iconBtnStyle}
        >
          ⋯
        </button>
        {menuOpen && profile && (
          <div
            role="menu"
            style={{
              position: 'absolute',
              top: 'calc(env(safe-area-inset-top) + 56px)',
              right: 12,
              background: 'var(--card)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              padding: 6,
              minWidth: 200,
              boxShadow: '0 12px 28px rgba(0,0,0,0.45)',
            }}
          >
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                setMenuOpen(false);
                setReportOpen(true);
              }}
              style={menuItemStyle}
            >
              {t('detail.report')}
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => void doBlock()}
              style={{ ...menuItemStyle, color: '#ff8585' }}
            >
              {t('detail.block')}
            </button>
          </div>
        )}
      </header>

      {loading && (
        <div style={{ padding: 16 }}>
          <div className="skeleton" style={{ aspectRatio: '3 / 4', marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 16, marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 14, width: '70%' }} />
        </div>
      )}

      {!loading && error && (
        <div className="empty" style={{ padding: 32 }}>
          <p className="muted">{t('detail.not_available')}</p>
        </div>
      )}

      {!loading && profile && (
        <>
          {/* Vertical scroll-stack of photos — Tinder uses a horizontal
              paginated carousel; we stack so the user just thumbs down the
              whole reel without paging gestures. */}
          <section style={{ padding: '8px 0 0 0', display: 'flex', flexDirection: 'column' }}>
            {profile.photo_urls.length === 0 && (
              <div
                className="empty"
                style={{ aspectRatio: '3 / 4', display: 'grid', placeItems: 'center' }}
              >
                <p className="muted">{t('detail.no_photos')}</p>
              </div>
            )}
            {profile.photo_urls.map((url, i) => (
              <img
                key={url + i}
                src={url}
                alt={`Foto ${i + 1} de ${profile.name ?? 'perfil'}`}
                loading={i === 0 ? 'eager' : 'lazy'}
                style={{
                  width: '100%',
                  display: 'block',
                  aspectRatio: '3 / 4',
                  objectFit: 'cover',
                }}
              />
            ))}
          </section>

          <section style={{ padding: '16px 18px 12px' }}>
            {profile.bio && (
              <p style={{ lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{profile.bio}</p>
            )}
            {profile.interests.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div
                  className="muted"
                  style={{
                    fontSize: 12,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    marginBottom: 8,
                  }}
                >
                  Interesses
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                  }}
                >
                  {profile.interests.map((tag) => (
                    <span
                      key={tag}
                      className="chip"
                      style={{ pointerEvents: 'none', minHeight: 32 }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {profile.city && !profile.hide_distance && (
              <div className="muted" style={{ marginTop: 16, fontSize: 13 }}>
                📍 {profile.city}
              </div>
            )}
          </section>

          {/* Spacer so action buttons don't overlay the bottom of the content */}
          <div style={{ height: 120 }} aria-hidden />

          {/* Bottom action buttons (sticky) */}
          <div
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 'calc(env(safe-area-inset-bottom) + 18px)',
              display: 'flex',
              justifyContent: 'center',
              gap: 32,
              zIndex: 5,
            }}
          >
            <button
              type="button"
              onClick={() => void doSwipe('left')}
              aria-label={tSwipe('actions.pass')}
              disabled={acting}
              style={{ ...actionBtnStyle, color: '#ff5b5b' }}
            >
              ✕
            </button>
            <button
              type="button"
              onClick={() => void doSwipe('right')}
              aria-label={tSwipe('actions.like')}
              disabled={acting}
              style={{ ...actionBtnStyle, color: '#4ade80' }}
            >
              ♥
            </button>
          </div>

          {reportOpen && (
            <ReportModal
              reportedUserId={profile.id}
              reportedName={profile.name ?? undefined}
              onClose={() => setReportOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
}

function AgeSpan({ birthdate }: { birthdate: string | null }) {
  const age = ageFromBirthdate(birthdate);
  if (age == null) return null;
  return <span style={{ fontWeight: 400, opacity: 0.8 }}> · {age}</span>;
}

function DistanceSubtitle({ profile }: { profile: SafeProfile }) {
  // The RPC already nulled out distance_km when hide_distance was true OR
  // either side has no location; we just render whatever came back.
  if (profile.distance_km != null) {
    const label = formatDistanceKm(profile.distance_km);
    return <span className="muted" style={{ fontSize: 12 }}>{label}</span>;
  }
  return profile.city ? (
    <span className="muted" style={{ fontSize: 12 }}>{profile.city}</span>
  ) : null;
}

const iconBtnStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: '50%',
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: '#fff',
  fontSize: 18,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  padding: 0,
};

const menuItemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '10px 12px',
  background: 'transparent',
  border: 0,
  color: '#fff',
  fontSize: 14,
  cursor: 'pointer',
  borderRadius: 6,
};

const actionBtnStyle: React.CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: '50%',
  background: 'var(--card)',
  border: '1px solid rgba(255,255,255,0.08)',
  fontSize: 26,
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
  cursor: 'pointer',
};
