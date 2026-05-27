import { NavLink } from 'react-router-dom';
import { useUnread } from '../state/UnreadContext';

export function BottomNav() {
  const { unreadLikes, unreadMatches, unreadChats } = useUnread();

  const tabs = [
    { to: '/events',  icon: '🎶', label: 'Eventos',  badge: 0 },
    { to: '/likes',   icon: '💌', label: 'Curtidas', badge: unreadLikes },
    { to: '/matches', icon: '✨', label: 'Matches',  badge: unreadMatches },
    { to: '/chats',   icon: '💬', label: 'Chats',    badge: unreadChats },
    { to: '/profile', icon: '👤', label: 'Perfil',   badge: 0 },
  ];

  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="icon" aria-hidden style={{ position: 'relative' }}>
            {t.icon}
            {t.badge > 0 && <span className="unread-dot" aria-label={`${t.badge} novos`} />}
          </span>
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
