import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './state/AuthContext';
import { ToastProvider, useToast } from './components/Toast';
import { Login } from './pages/Login';
import { VerifyOtp } from './pages/VerifyOtp';
import { Onboarding } from './pages/Onboarding';
import { Events } from './pages/Events';
import { EventRoom } from './pages/EventRoom';
import { Matches } from './pages/Matches';
import { Chat } from './pages/Chat';
import { Profile } from './pages/Profile';
import { getSocket, closeSocket } from './lib/socket';
import type { ReactionType, User } from './types';
import { hapticSuccess } from './platform/haptics';

const ICON: Record<ReactionType, string> = { kiss: '💋', heart: '❤️', fire: '🔥' };
const LABEL: Record<ReactionType, string> = { kiss: 'beijo', heart: 'curtida', fire: 'fogo' };

function GlobalSocketListeners() {
  const toast = useToast();
  const { user } = useAuth();
  const location = useLocation();
  const nav = useNavigate();

  useEffect(() => {
    if (!user) return;
    const sock = getSocket();

    const onReaction = (payload: { fromUser: User; type: ReactionType; eventId: string }) => {
      if (location.pathname.startsWith(`/events/${payload.eventId}`)) return;
      toast({ kind: payload.type, text: `${payload.fromUser.nickname || 'Alguém'} mandou um ${LABEL[payload.type]} ${ICON[payload.type]}` });
    };
    const onMatch = (payload: { otherUser: User; matchId: string }) => {
      if (location.pathname.startsWith(`/chat/${payload.matchId}`)) return;
      hapticSuccess();
      toast({ kind: 'match', text: `Match com ${payload.otherUser.nickname || 'alguém'} ✨` });
    };
    const onMessage = (payload: { fromUserId: string; matchId: string; text: string }) => {
      if (payload.fromUserId === user.id) return;
      if (location.pathname.startsWith(`/chat/${payload.matchId}`)) return;
      toast({ kind: 'info', text: `Nova mensagem 💬` });
    };

    sock.on('reaction:incoming', onReaction);
    sock.on('match:new', onMatch);
    sock.on('message:new', onMessage);

    return () => {
      sock.off('reaction:incoming', onReaction);
      sock.off('match:new', onMatch);
      sock.off('message:new', onMessage);
    };
  }, [user, toast, location.pathname, nav]);

  useEffect(() => {
    if (!user) closeSocket();
  }, [user]);

  return null;
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="screen"><p className="muted">Carregando...</p></div>;
  if (!user) return <Navigate to="/" replace />;
  if (!user.nickname || !user.gender) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

export function App() {
  const { user, loading } = useAuth();

  return (
    <ToastProvider>
      <GlobalSocketListeners />
      <div className="app">
        <Routes>
          <Route path="/" element={user && !loading ? <Navigate to="/events" replace /> : <Login />} />
          <Route path="/verify" element={<VerifyOtp />} />
          <Route path="/onboarding" element={user ? <Onboarding /> : <Navigate to="/" replace />} />
          <Route path="/events" element={<Protected><Events /></Protected>} />
          <Route path="/events/:id" element={<Protected><EventRoom /></Protected>} />
          <Route path="/matches" element={<Protected><Matches /></Protected>} />
          <Route path="/chat/:matchId" element={<Protected><Chat /></Protected>} />
          <Route path="/me" element={<Protected><Profile /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </ToastProvider>
  );
}
