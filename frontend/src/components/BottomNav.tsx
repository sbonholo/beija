import { NavLink } from 'react-router-dom';
import { useUnread } from '../state/UnreadContext';

const tabs = [
  { to: '/events', icon: '🎶', label: 'Eventos' },
  { to: '/matches', icon: '💋', label: 'Matches' },
  { to: '/', icon: '👤', label: 'Perfil', end: true },
];

export function BottomNav() {
  const { unreadMatches } = useUnread();

  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      {tabs.map((t) => {
        const showBadge = t.to === '/matches' && unreadMatches > 0;
        return (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="icon" aria-hidden style={{ position: 'relative' }}>
              {t.icon}
              {showBadge && <span className="unread-dot" aria-label="mensagens não lidas" />}
            </span>
            <span>{t.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
