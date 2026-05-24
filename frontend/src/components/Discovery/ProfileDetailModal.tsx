import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, type Profile } from '../../lib/supabase';
import { ReportModal } from '../Moderation/ReportModal';
import { useToast } from '../Toast';
import { STR_PROFILE_DETAIL_BLOCK, STR_PROFILE_DETAIL_CLOSE, STR_PROFILE_DETAIL_MORE, STR_PROFILE_DETAIL_REPORT, STR_PASS, STR_LIKE } from '../../lib/constants';
import { formatDistanceKm } from '../../lib/labels';

interface ProfileDetail extends Profile {
  photos: string[];
  interests: string[];
  distance_km: number | null;
}

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
  const [me, setMe] = useState<{ id: string; lat: number | null; lng: number | null } | null>(
    null,
  );
  const [profile, setProfile] = useState<ProfileDetail | null>(null);
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

  // Load me + profile + photos in parallel
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const { data: auth } = await supabase.auth.getUser();
        const myId = auth.user?.id;
        if (!myId) {
          nav('/signin', { replace: true });
          return;
        }
        const [meProfileRes, theirProfileRes, photosRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, location')
            .eq('id', myId)
            .maybeSingle(),
          supabase
            .from('profiles')
            .select(
              'id, name, birthdate, gender, bio, city, interested_in, interests, ' +
                'hide_distance, show_age, deleted_at',
            )
            .eq('id', id)
            .maybeSingle(),
          supabase
            .from('photos')
            .select('slot, url')
            .eq('user_id', id)
            .order('slot', { ascending: true }),
        ]);

        if (cancelled) return;

        const theirData = theirProfileRes.data as Partial<Profile> | null;
        if (!theirData || theirData.deleted_at) {
          setError('not_found');
          return;
        }

        // Read my coords via geolocation update (best-effort).
        let myCoords: { lat: number | null; lng: number | null } = { lat: null, lng: null };
        const meLoc = (meProfileRes.data as { location?: unknown })?.location;
        if (meLoc && typeof meLoc === 'object' && 'coordinates' in meLoc) {
          const coords = (meLoc as { coordinates: [number, number] }).coordinates;
          myCoords = { lng: coords[0], lat: coords[1] };
        }
        setMe({ id: myId, ...myCoords });

        const photos = (photosRes.data ?? []).map((p) => p.url as string);
        const t = theirData;
        setProfile({
          id: t.id as string,
          name: t.name ?? null,
          birthdate: t.birthdate ?? null,
          gender: t.gender ?? null,
          bio: t.bio ?? null,
          location: null,
          city: t.city ?? null,
          interested_in: t.interested_in ?? null,
          interests: Array.isArray(t.interests) ? t.interests : [],
          min_age: null,
          max_age: null,
          max_distance_km: null,
          push_token: null,
          last_active_at: null,
          is_inactive: false,
          mute_notifications: false,
          hide_distance: !!t.hide_distance,
          show_age: t.show_age !== false,
          deleted_at: null,
          created_at: '',
          photos,
          distance_km: null,
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'load_failed');
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
    if (!profile || !me || acting) return;
    setActing(true);
    try {
      const { error: insErr } = await supabase.from('swipes').insert({
        swiper_id: me.id,
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
    if (!profile || !me) return;
    setMenuOpen(false);
    try {
      const { error: bErr } = await supabase
        .from('blocks')
        .insert({ blocker_id: me.id, blocked_id: profile.id });
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
      aria-label={`Perfil de ${profile?.name ?? 'usuário'}`}
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
          aria-label={STR_PROFILE_DETAIL_CLOSE}
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
              <DistanceSubtitle profile={profile} myCoords={me} />
            </>
          )}
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={STR_PROFILE_DETAIL_MORE}
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
              {STR_PROFILE_DETAIL_REPORT}
            </button>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => void doBlock()}
              style={{ ...menuItemStyle, color: '#ff8585' }}
            >
              {STR_PROFILE_DETAIL_BLOCK}
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
          <p className="muted">Perfil indisponível.</p>
        </div>
      )}

      {!loading && profile && (
        <>
          {/* Vertical scroll-stack of photos — Tinder uses a horizontal
              paginated carousel; we stack so the user just thumbs down the
              whole reel without paging gestures. */}
          <section style={{ padding: '8px 0 0 0', display: 'flex', flexDirection: 'column' }}>
            {profile.photos.length === 0 && (
              <div
                className="empty"
                style={{ aspectRatio: '3 / 4', display: 'grid', placeItems: 'center' }}
              >
                <p className="muted">Sem fotos</p>
              </div>
            )}
            {profile.photos.map((url, i) => (
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
              aria-label={STR_PASS}
              disabled={acting}
              style={{ ...actionBtnStyle, color: '#ff5b5b' }}
            >
              ✕
            </button>
            <button
              type="button"
              onClick={() => void doSwipe('right')}
              aria-label={STR_LIKE}
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

function DistanceSubtitle({
  profile,
  myCoords,
}: {
  profile: ProfileDetail;
  myCoords: { lat: number | null; lng: number | null } | null;
}) {
  if (profile.hide_distance) return null;
  // distance_meters isn't on this profile fetch — derive from city as a
  // fallback subtitle. Real distance shows up in the deck card; this is just
  // a placeholder secondary line.
  if (!myCoords || profile.distance_km == null) {
    return profile.city ? (
      <span className="muted" style={{ fontSize: 12 }}>{profile.city}</span>
    ) : null;
  }
  const label = formatDistanceKm(profile.distance_km);
  return <span className="muted" style={{ fontSize: 12 }}>{label}</span>;
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
