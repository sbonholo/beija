import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './state/AuthContext';
import { useUnread } from './state/UnreadContext';
import { ToastProvider, useToast } from './components/Toast';
import { BottomNav } from './components/BottomNav';
import { CreateProfile } from './pages/CreateProfile';
import { Login } from './pages/Login';
import { VerifyOtp } from './pages/VerifyOtp';
import { Events } from './pages/Events';
import { EventRoom } from './pages/EventRoom';
import { Matches } from './pages/Matches';
import { Chat } from './pages/Chat';
import { Profile } from './pages/Profile';
import { getSocket, closeSocket } from './lib/socket';
import { isMockMode } from './lib/api';
import type { ReactionType, User } from './types';
import { hapticSuccess } from './platform/haptics';

const ICON: Record<ReactionType, string> = { kiss: '💋', heart: '❤️', fire: '🔥' };
const LABEL: Record<ReactionType, string> = { kiss: 'beijo', heart: 'curtida', fire: 'fogo' };

function GlobalSocketListeners() {
  const toast = useToast();
  const { user } = useAuth();
  const { bump, clear } = useUnread();
  const location = useLocation();
  const [socketOffline, setSocketOffline] = useState(false);

  // Track current path in a ref so socket handlers always see the latest
  // pathname without needing to be re-registered on every navigation.
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  useEffect(() => {
    if (location.pathname === '/matches' || location.pathname.startsWith('/chat/')) {
      clear();
    }
  }, [location.pathname, clear]);

  useEffect(() => {
    if (!user) return;
    const sock = getSocket();
    if (!sock) return;

    const onReaction = (payload: { fromUser: User; type: ReactionType; eventId: string }) => {
      if (pathRef.current.startsWith(`/events/${payload.eventId}`)) return;
      toast({ kind: payload.type, text: `${payload.fromUser.nickname || 'Alguém'} mandou um ${LABEL[payload.type]} ${ICON[payload.type]}` });
    };
    const onMatch = (payload: { otherUser: User; matchId: string }) => {
      if (pathRef.current.startsWith(`/chat/${payload.matchId}`)) return;
      hapticSuccess();
      bump();
      toast({ kind: 'match', text: `Match com ${payload.otherUser.nickname || 'alguém'} ✨` });
    };
    const onMessage = (payload: { fromUserId: string; matchId: string; text: string }) => {
      if (payload.fromUserId === user.id) return;
      if (pathRef.current.startsWith(`/chat/${payload.matchId}`)) return;
      bump();
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
  }, [user, toast, bump]); // no location.pathname — pathRef stays current without re-registration

  useEffect(() => {
    if (!user) { closeSocket(); return; }
    if (isMockMode) return;
    const sock = getSocket();
    if (!sock) return;
    const onConnect = () => setSocketOffline(false);
    const onDisconnect = () => setSocketOffline(true);
    sock.on('connect', onConnect);
    sock.on('disconnect', onDisconnect);
    return () => {
      sock.off('connect', onConnect);
      sock.off('disconnect', onDisconnect);
    };
  }, [user]);

  if (socketOffline) {
    return (
      <div className="socket-offline-bar">
        ⚡ Reconectando em tempo real…
      </div>
    );
  }
  return null;
}

function Protected({ children, hideNav = false }: { children: React.ReactNode; hideNav?: boolean }) {
  const { user } = useAuth();
  if (!user) return <Navigate to={isMockMode ? '/' : '/login'} replace />;
  return (
    <>
      {children}
      {!hideNav && <BottomNav />}
    </>
  );
}

export function App() {
  const { user } = useAuth();

  return (
    <ToastProvider>
      <GlobalSocketListeners />
      {isMockMode && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: '#f59e0b', color: '#000', textAlign: 'center',
          padding: '4px 0', fontSize: '13px', fontWeight: 600,
        }}>
          ⚡ Modo Demo — dados fictícios
        </div>
      )}
      <div className="app" style={isMockMode ? { paddingTop: 30 } : undefined}>
        <Routes>
          <Route path="/" element={
            !user
              ? (isMockMode ? <CreateProfile /> : <Navigate to="/login" replace />)
              : (!user.nickname ? <CreateProfile /> : <Profile />)
          } />
          <Route path="/login" element={user ? <Navigate to="/events" replace /> : <Login />} />
          <Route path="/verify" element={user ? <Navigate to="/events" replace /> : <VerifyOtp />} />
          <Route path="/profile" element={<Protected><Profile /></Protected>} />
          <Route path="/events" element={<Protected><Events /></Protected>} />
          <Route path="/events/:id" element={<Protected><EventRoom /></Protected>} />
          <Route path="/matches" element={<Protected><Matches /></Protected>} />
          <Route path="/chat/:matchId" element={<Protected hideNav><Chat /></Protected>} />
          <Route path="*" element={<Navigate to={isMockMode ? '/' : '/login'} replace />} />
        </Routes>
      </div>
    </ToastProvider>
  );
}
