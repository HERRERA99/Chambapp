import { NavLink } from 'react-router-dom';
import type { NavigationTab } from '../navigation';

export function SectionTabs({ label, tabs }: { label: string; tabs: readonly NavigationTab[] }) {
  return (
    <nav className="section-tabs" aria-label={`Pestañas de ${label}`}>
      {tabs.map(({ to, label }) => (
        <NavLink key={to} to={to} className="section-tabs__link">
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
