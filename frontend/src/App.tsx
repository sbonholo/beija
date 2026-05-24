import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from './state/AuthContext';
import { ToastProvider } from './components/Toast';
import { SignInScreen } from './components/Auth/SignInScreen';
import { OnboardingFlow } from './components/Auth/OnboardingFlow';
import { ProfileSetup } from './components/Auth/ProfileSetup';
import { StackDeck } from './components/Discovery/StackDeck';
import { ChatScreen } from './components/Chat/ChatScreen';
import { MatchesList } from './components/Chat/MatchesList';
import { DeleteAccountFlow } from './components/Settings/DeleteAccountFlow';
import { BottomNav } from './components/BottomNav';
import { MarkdownPage } from './components/MarkdownPage';
import privacyContent from './pages/PrivacyPolicy.md?raw';
import termsContent from './pages/TermsOfService.md?raw';

const SPLASH_MS = 1500;

function Splash() {
  return (
    <div className="splash-screen">
      <h1 className="brand-title" style={{ fontSize: 64 }}>Beija</h1>
      <div className="splash-dot" aria-label="Carregando" />
    </div>
  );
}

function RootRedirect() {
  const { session, loading, hasProfile, profile } = useAuth();
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setSplashDone(true), SPLASH_MS);
    return () => window.clearTimeout(t);
  }, []);

  if (!splashDone || loading) return <Splash />;
  if (!session) return <Navigate to="/signin" replace />;
  if (!hasProfile) {
    // No profile yet OR partial profile (missing photo / name / gender)
    return <Navigate to={profile ? '/onboarding' : '/onboarding'} replace />;
  }
  return <Navigate to="/discover" replace />;
}

function Protected() {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!session) return <Navigate to="/signin" replace state={{ from: location }} />;
  return <Outlet />;
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
      <div className="app">
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/signin" element={<SignInScreen />} />
          <Route path="/privacy" element={<MarkdownPage content={privacyContent} />} />
          <Route path="/terms" element={<MarkdownPage content={termsContent} />} />

          <Route element={<Protected />}>
            <Route path="/onboarding" element={<OnboardingFlow />} />
            <Route path="/settings/delete" element={<DeleteAccountFlow />} />

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
