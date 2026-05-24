import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { signInWithApple, signInWithGoogle } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { track } from '../../lib/analytics';
import { useToast } from '../Toast';

type Provider = 'apple' | 'google';

export function SignInScreen() {
  const nav = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState<Provider | null>(null);

  async function handleSignIn(provider: Provider) {
    if (loading) return;
    track('signup_started', { provider });
    setLoading(provider);
    try {
      const result = provider === 'apple' ? await signInWithApple() : await signInWithGoogle();
      if (!result.success) {
        toast({ kind: 'info', text: friendlyError(result.error) });
        return;
      }
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId) {
        toast({ kind: 'info', text: 'Não foi possível confirmar a sessão.' });
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();
      nav(profile ? '/discover' : '/onboarding', { replace: true });
    } catch (e) {
      toast({ kind: 'info', text: friendlyError(e instanceof Error ? e.message : '') });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div
      style={{
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '60px 24px calc(32px + env(safe-area-inset-bottom))',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '8vh' }}>
        <h1 className="brand-title" style={{ fontSize: 56, marginBottom: 12 }}>Beija</h1>
        <p className="brand-sub" style={{ textAlign: 'center', maxWidth: 320 }}>
          Conexões reais. Sem joguinhos. Pessoas perto de você.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          className="btn"
          style={{
            background: '#000',
            boxShadow: '0 6px 24px rgba(0, 0, 0, 0.5)',
            color: '#fff',
          }}
          disabled={loading !== null}
          onClick={() => handleSignIn('apple')}
          aria-label="Continuar com Apple"
        >
          {loading === 'apple' ? 'Entrando...' : ' Continuar com Apple'}
        </button>

        <button
          className="btn"
          style={{
            background: '#fff',
            color: '#1c0a2b',
            boxShadow: '0 6px 24px rgba(0, 0, 0, 0.35)',
          }}
          disabled={loading !== null}
          onClick={() => handleSignIn('google')}
          aria-label="Continuar com Google"
        >
          {loading === 'google' ? 'Entrando...' : 'G  Continuar com Google'}
        </button>

        <p className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 18 }}>
          Ao continuar você concorda com os{' '}
          <Link to="/terms" style={{ color: 'var(--pink)', textDecoration: 'none' }}>Termos</Link>
          {' '}·{' '}
          <Link to="/privacy" style={{ color: 'var(--pink)', textDecoration: 'none' }}>Privacidade</Link>
        </p>
      </div>
    </div>
  );
}

function friendlyError(code: string): string {
  const map: Record<string, string> = {
    no_identity_token: 'Não conseguimos confirmar sua identidade. Tente de novo.',
    permission_denied: 'Você precisa permitir o acesso pra entrar.',
    not_native_platform: 'Login social só funciona no app instalado.',
  };
  return map[code] ?? 'Não foi possível entrar agora. Tenta de novo em uns instantes.';
}
