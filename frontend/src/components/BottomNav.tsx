import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/events', icon: '🎶', label: 'Eventos' },
  { to: '/matches', icon: '💋', label: 'Matches' },
  { to: '/me', icon: '👤', label: 'Perfil' },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Navegação principal">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="icon" aria-hidden>{t.icon}</span>
          <span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
