import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUnread } from '../state/UnreadContext';

const tabs = [
  { to: '/discover', icon: '🔥', key: 'discover' as const },
  { to: '/matches', icon: '💋', key: 'matches' as const },
  { to: '/profile', icon: '👤', key: 'profile' as const },
  { to: '/settings', icon: '⚙', key: 'settings' as const },
];

export function BottomNav() {
  const { unreadMatches } = useUnread();
  const { t } = useTranslation('common');

  return (
    <nav className="bottom-nav" aria-label={t('nav.discover')}>
      {tabs.map((tab) => {
        const showBadge = tab.to === '/matches' && unreadMatches > 0;
        const label = t(`nav.${tab.key}` as const);
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
