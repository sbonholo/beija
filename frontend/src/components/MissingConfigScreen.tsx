/**
 * Rendered when the build doesn't have Supabase env vars (VITE_SUPABASE_URL +
 * VITE_SUPABASE_ANON_KEY). Without these, every DB call would 401/timeout
 * with no useful UX — so we surface a clear setup-required screen instead
 * of letting the user stare at a blank white page.
 */
export function MissingConfigScreen() {
  return (
    <div
      role="alert"
      style={{
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        textAlign: 'center',
        gap: 16,
      }}
    >
      <div style={{ fontSize: 56 }} aria-hidden>⚙️</div>
      <h1 style={{ margin: 0, fontSize: 24 }}>Beija — setup pendente</h1>
      <p className="muted" style={{ margin: 0, maxWidth: 460, lineHeight: 1.5 }}>
        Este build não tem credenciais do Supabase configuradas. Para o app
        funcionar, defina <code>VITE_SUPABASE_URL</code> e{' '}
        <code>VITE_SUPABASE_ANON_KEY</code> no host (Vercel/Pages) e re-deploy.
      </p>
      <details
        style={{
          maxWidth: 500,
          textAlign: 'left',
          marginTop: 8,
          fontSize: 14,
          opacity: 0.85,
        }}
      >
        <summary style={{ cursor: 'pointer' }}>Onde achar essas chaves?</summary>
        <ol style={{ paddingLeft: 22, lineHeight: 1.6 }}>
          <li>
            Vá em{' '}
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--pink)' }}
            >
              supabase.com/dashboard
            </a>{' '}
            → seu projeto → Settings → API.
          </li>
          <li>
            Copie <code>Project URL</code> → <code>VITE_SUPABASE_URL</code>.
          </li>
          <li>
            Copie <code>anon public</code> → <code>VITE_SUPABASE_ANON_KEY</code>.
          </li>
          <li>
            Cole no painel do host (Vercel: Settings → Environment Variables)
            e dispare um novo deploy.
          </li>
        </ol>
        <p style={{ marginTop: 12 }}>
          Detalhes em{' '}
          <a
            href="https://github.com/sbonholo/beija/blob/main/docs/DEPLOY.md"
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--pink)' }}
          >
            docs/DEPLOY.md
          </a>
          .
        </p>
      </details>
    </div>
  );
}
