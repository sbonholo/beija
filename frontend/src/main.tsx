const ROUTER_BASENAME = import.meta.env.PROD ? '/beija' : '/';

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
import './index.css';

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const swUrl = `${ROUTER_BASENAME.replace(/\/$/, '')}/sw.js`;
    navigator.serviceWorker.register(swUrl).catch((err) => {
      console.warn('[sw] register failed:', err);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={ROUTER_BASENAME}>
        <AuthProvider>
          <UnreadProvider>
            <App />
          </UnreadProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
