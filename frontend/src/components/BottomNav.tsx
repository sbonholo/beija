import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUnread } from '../state/UnreadContext';

// `fallback` doubles as a defaultValue for t() — if i18n is somehow still
// initialising on first paint (mobile cold starts, slow CPU), the user
// sees the proper PT-BR word instead of the raw "nav.discover" key.
const tabs = [
  { to: '/discover', icon: '🔥', key: 'discover' as const, fallback: 'Descobrir' },
  { to: '/events',   icon: '🎪', key: 'events'   as const, fallback: 'Eventos' },
  { to: '/matches',  icon: '💋', key: 'matches'  as const, fallback: 'Matches' },
  { to: '/profile',  icon: '👤', key: 'profile'  as const, fallback: 'Perfil' },
  { to: '/settings', icon: '⚙️', key: 'settings' as const, fallback: 'Ajustes' },
];

export function BottomNav() {
  const { unreadMatches } = useUnread();
  const { t } = useTranslation('common');

  return (
    <nav className="bottom-nav" aria-label={t('nav.bottom_aria', { defaultValue: 'Navegação principal' })}>
      {tabs.map((tab) => {
        const showBadge = tab.to === '/matches' && unreadMatches > 0;
        const label = t(`nav.${tab.key}` as const, { defaultValue: tab.fallback });
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => (isActive ? 'active' : '')}
            aria-label={label}
            end
          >
            <span className="icon" aria-hidden style={{ position: 'relative' }}>
              {tab.icon}
              {showBadge && <span className="unread-dot" aria-label="mensagens não lidas" />}
            </span>
            <span>{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
