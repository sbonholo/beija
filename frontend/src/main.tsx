// Base path under which the app is served. Vercel root deploys use '/'
// (default). GitHub Pages serves at '/beija' — set VITE_BASE_PATH=/beija
// in the Pages workflow env. Trailing slash trimmed for consistency.
const RAW_BASE = (import.meta.env.VITE_BASE_PATH as string | undefined) ?? '/';
const ROUTER_BASENAME = RAW_BASE === '/' ? '/' : RAW_BASE.replace(/\/$/, '');

const spaRedirect = sessionStorage.getItem('beija_spa_redirect');
if (spaRedirect) {
  sessionStorage.removeItem('beija_spa_redirect');
  const base = ROUTER_BASENAME.replace(/\/$/, '');
  window.history.replaceState(null, '', base + spaRedirect);
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './state/AuthContext';
import { UnreadProvider } from './state/UnreadContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MissingConfigScreen } from './components/MissingConfigScreen';
import { SUPABASE_CONFIGURED } from './lib/supabase';
import { initSentry } from './lib/sentry';
import { initAnalytics, track } from './lib/analytics';
import { startWebVitals } from './lib/vitals';
import { defineCustomElements } from '@ionic/pwa-elements/loader';
import { i18nReady } from './i18n';
import './index.css';

// Boot observability before anything React-related so initial errors are
// caught and the app_opened funnel marker is the first event.
initSentry();
initAnalytics();
startWebVitals();
track('app_opened');

// Register @ionic/pwa-elements so @capacitor/camera has a web UI (camera +
// gallery) outside the native iOS/Android shells. No-op on native webviews.
defineCustomElements(window);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const swUrl = `${ROUTER_BASENAME.replace(/\/$/, '')}/sw.js`;
    navigator.serviceWorker.register(swUrl).catch((err) => {
      console.warn('[sw] register failed:', err);
    });
  });
}

// Wait for i18next to finish initialising before the first render. With
// bundled resources this resolves on the next microtask, so the splash
// stays for a single frame at most — but it guarantees that no component
// (BottomNav, skip-link, etc.) ever paints with a raw "namespace.key"
// string. i18nReady never rejects in practice; on the off-chance it
// does, we still render the tree so the app isn't bricked.
void i18nReady.finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        {SUPABASE_CONFIGURED ? (
          <BrowserRouter basename={ROUTER_BASENAME}>
            <AuthProvider>
              <UnreadProvider>
                <App />
              </UnreadProvider>
            </AuthProvider>
          </BrowserRouter>
        ) : (
          <MissingConfigScreen />
        )}
      </ErrorBoundary>
    </React.StrictMode>
  );
});
