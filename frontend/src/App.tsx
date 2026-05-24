import { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from './state/AuthContext';
import { ToastProvider } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SignInScreen } from './components/Auth/SignInScreen';
import { StackDeck } from './components/Discovery/StackDeck';
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
const PrivacyPage = lazy(() => import('./components/pages/PrivacyPage'));
const TermsPage = lazy(() => import('./components/pages/TermsPage'));

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
const VALID_RESUME_ROUTES = new Set(['/discover', '/matches', '/profile']);

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
  const { session, loading, hasProfile } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setSplashDone(true), SPLASH_MS);
    return () => window.clearTimeout(t);
  }, []);

  if (!splashDone || loading) return <Splash />;
  if (!session) return <Navigate to="/signin" replace />;
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
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!session) return <Navigate to="/signin" replace state={{ from: location }} />;
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
  return (
    <ToastProvider>
      <RouteMemory />
      <div className="app">
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/signin" element={<SignInScreen />} />
          <Route path="/privacy" element={<Suspense fallback={<Splash />}><PrivacyPage /></Suspense>} />
          <Route path="/terms" element={<Suspense fallback={<Splash />}><TermsPage /></Suspense>} />

          <Route element={<Protected />}>
            <Route
              path="/onboarding"
              element={<Suspense fallback={<Splash />}><OnboardingFlow /></Suspense>}
            />
            <Route
              path="/settings/delete"
              element={<Suspense fallback={<Splash />}><DeleteAccountFlow /></Suspense>}
            />

            <Route element={<NeedsProfile />}>
              <Route path="/chat/:id" element={<ChatScreen />} />
              <Route element={<TabLayout />}>
                <Route path="/discover" element={<StackDeck />} />
                <Route path="/matches" element={<MatchesList />} />
                <Route path="/profile" element={<ProfileSetup />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </ToastProvider>
  );
}
