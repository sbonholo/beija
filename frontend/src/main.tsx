const ROUTER_BASENAME = import.meta.env.VITE_ROUTER_BASE || '/';

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
