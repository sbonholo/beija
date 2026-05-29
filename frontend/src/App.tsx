import { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './state/AuthContext';
import { ToastProvider } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SignInScreen } from './components/Auth/SignInScreen';
import { ReactivationScreen } from './components/Auth/ReactivationScreen';
import { StackDeck } from './components/Discovery/StackDeck';
import { LikesYouScreen } from './components/Discovery/LikesYouScreen';
import { ChatScreen } from './components/Chat/ChatScreen';
import { MatchesList } from './components/Chat/MatchesList';
import { ProfileSetup } from './components/Auth/ProfileSetup';
import { BottomNav } from './components/BottomNav';

// Heavy / rarely-visited routes — code-split to keep the main bundle lean.
const OnboardingFlow = lazy(() =>
  import('./components/Auth/OnboardingFlow').then((m) => ({ default: m.OnboardingFlow })),
);
const DeleteAccountFlow = lazy(() =>
  import('./components/Settings/DeleteAccountFlow').then((m) => ({ default: m.DeleteAccountFlow })),
);
const BlockedUsersScreen = lazy(() =>
  import('./components/Settings/BlockedUsersScreen').then((m) => ({ default: m.BlockedUsersScreen })),
);
const EventsScreen = lazy(() =>
  import('./components/Events/EventsScreen').then((m) => ({ default: m.EventsScreen })),
);
const EventDetailScreen = lazy(() =>
  import('./components/Events/EventDetailScreen').then((m) => ({ default: m.EventDetailScreen })),
);
const AdminScreen = lazy(() =>
  import('./components/Admin/AdminScreen').then((m) => ({ default: m.AdminScreen })),
);
const PrivacyPage = lazy(() => import('./components/pages/PrivacyPage'));
const TermsPage = lazy(() => import('./components/pages/TermsPage'));
const CommunityGuidelinesPage = lazy(
  () => import('./components/pages/CommunityGuidelinesPage'),
);
const SettingsScreen = lazy(() => import('./components/Settings/SettingsScreen'));
const ProfileDetailModal = lazy(() => import('./components/Discovery/ProfileDetailModal'));

const SPLASH_MS = 1500;

function Splash() {
  return (
    <div className="splash-screen">
      <h1 className="brand-title" style={{ fontSize: 64 }}>Beija</h1>
      <div className="splash-dot" aria-label="Carregando" />
    </div>
  );
}

const LAST_ROUTE_KEY = 'beija_last_route';
const VALID_RESUME_ROUTES = new Set(['/discover', '/events', '/matches', '/profile', '/settings']);

function getLastRoute(): string {
  try {
    const r = localStorage.getItem(LAST_ROUTE_KEY);
    if (r && VALID_RESUME_ROUTES.has(r)) return r;
  } catch {
    /* private mode */
  }
  return '/discover';
}

function RootRedirect() {
  const { session, loading, hasProfile, needsReactivation } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setSplashDone(true), SPLASH_MS);
    return () => window.clearTimeout(t);
  }, []);

  if (!splashDone || loading) return <Splash />;
  if (!session) return <Navigate to="/signin" replace />;
  if (needsReactivation) return <Navigate to="/reactivate" replace />;
  if (!hasProfile) return <Navigate to="/onboarding" replace />;
  return <Navigate to={getLastRoute()} replace />;
}

/** Records the last tab route so cold start resumes where the user left off. */
function RouteMemory() {
  const location = useLocation();
  useEffect(() => {
    if (VALID_RESUME_ROUTES.has(location.pathname)) {
      try {
        localStorage.setItem(LAST_ROUTE_KEY, location.pathname);
      } catch {
        /* private mode */
      }
    }
  }, [location.pathname]);
  return null;
}

function Protected() {
  const { session, loading, needsReactivation } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!session) return <Navigate to="/signin" replace state={{ from: location }} />;
  // Soft-deleted but inside the 30-day window — force the reactivation prompt
  // before allowing access to any other authenticated route.
  if (needsReactivation && location.pathname !== '/reactivate') {
    return <Navigate to="/reactivate" replace />;
  }
  // Per-route ErrorBoundary: a screen-level crash doesn't take down the auth shell
  // or any sibling tab — user can still navigate via the bottom nav.
  return (
    <ErrorBoundary>
      <Outlet />
    </ErrorBoundary>
  );
}

function NeedsProfile() {
  const { hasProfile, loading } = useAuth();
  if (loading) return <Splash />;
  if (!hasProfile) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

/** Gate for the hidden admin route. Server RLS/RPCs are the real boundary;
 *  this only hides the UI and redirects non-admins. */
function AdminGuard() {
  const { isAdmin, loading } = useAuth();
  if (loading) return <Splash />;
  if (!isAdmin) return <Navigate to="/discover" replace />;
  return <Outlet />;
}

/**
 * Layout for the 3 main tabs (discover / matches / profile): adds bottom nav.
 */
function TabLayout() {
  return (
    <>
      <Outlet />
      <BottomNav />
    </>
  );
}

export function App() {
  const { t } = useTranslation('common');
  return (
    <ToastProvider>
      <RouteMemory />
      <a href="#beija-main" className="skip-link">
        {t('nav.skip_to_main')}
      </a>
      <div className="app" id="beija-main">
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/signin" element={<SignInScreen />} />
          <Route path="/privacy" element={<Suspense fallback={<Splash />}><PrivacyPage /></Suspense>} />
          <Route path="/terms" element={<Suspense fallback={<Splash />}><TermsPage /></Suspense>} />
          <Route
            path="/community-guidelines"
            element={<Suspense fallback={<Splash />}><CommunityGuidelinesPage /></Suspense>}
          />

          <Route element={<Protected />}>
            <Route path="/reactivate" element={<ReactivationScreen />} />
            <Route
              path="/onboarding"
              element={<Suspense fallback={<Splash />}><OnboardingFlow /></Suspense>}
            />
            <Route
              path="/settings/delete"
              element={<Suspense fallback={<Splash />}><DeleteAccountFlow /></Suspense>}
            />
            <Route
              path="/settings/blocked"
              element={<Suspense fallback={<Splash />}><BlockedUsersScreen /></Suspense>}
            />
            <Route
              path="/profile/:id"
              element={<Suspense fallback={<Splash />}><ProfileDetailModal /></Suspense>}
            />

            <Route element={<AdminGuard />}>
              <Route
                path="/painel-9f3a"
                element={<Suspense fallback={<Splash />}><AdminScreen /></Suspense>}
              />
            </Route>

            <Route element={<NeedsProfile />}>
              <Route path="/chat/:id" element={<ChatScreen />} />
              <Route path="/likes-you" element={<LikesYouScreen />} />
              <Route
                path="/events/:id"
                element={<Suspense fallback={<Splash />}><EventDetailScreen /></Suspense>}
              />
              <Route element={<TabLayout />}>
                <Route path="/discover" element={<StackDeck />} />
                <Route
                  path="/events"
                  element={<Suspense fallback={<Splash />}><EventsScreen /></Suspense>}
                />
                <Route path="/matches" element={<MatchesList />} />
                <Route path="/profile" element={<ProfileSetup />} />
                <Route
                  path="/settings"
                  element={<Suspense fallback={<Splash />}><SettingsScreen /></Suspense>}
                />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </ToastProvider>
  );
}
