import { useId } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Brand } from '../../shared/brand/Brand';
import { IconButton } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { paths } from '../paths';
import { isNavItemActive, navigationGroups, settingsItem } from '../navigation';
import type { NavGroup, NavItem } from '../navigation';
import { useToolsGroupOpen } from './useSidebar';

type SidebarProps = {
  /** Icons only (desktop). Labels stay available to assistive technology and as tooltips. */
  rail: boolean;
  mobile: boolean;
  pendingTasks: number;
  name: string;
  email?: string;
  signingOut: boolean;
  onSignOut: () => void;
  onNavigate: () => void;
  onToggleRail: () => void;
  onClose: () => void;
};

function NavEntry({
  item,
  rail,
  badge,
  onNavigate,
}: {
  item: NavItem;
  rail: boolean;
  badge?: number;
  onNavigate: () => void;
}) {
  const { pathname } = useLocation();
  const active = isNavItemActive(item, pathname);
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={rail ? item.label : undefined}
      className={`nav-item ${active ? 'nav-item--active' : ''}`}
    >
      <Icon name={item.icon} size={18} />
      <span className="nav-item__label">{item.label}</span>
      {badge ? (
        <span className="nav-count">
          <span aria-hidden="true">{badge}</span>
          <span className="sr-only">({badge} abiertas)</span>
        </span>
      ) : null}
    </Link>
  );
}

function Group({
  group,
  rail,
  pendingTasks,
  onNavigate,
}: {
  group: NavGroup;
  rail: boolean;
  pendingTasks: number;
  onNavigate: () => void;
}) {
  const { pathname } = useLocation();
  const listId = useId();
  const containsActive = group.items.some((item) => isNavItemActive(item, pathname));
  const [open, toggle] = useToolsGroupOpen(containsActive);
  const collapsible = !!group.collapsible && !rail && !containsActive;
  const expanded = !group.collapsible || rail || open;
  return (
    <div className="nav-group">
      {collapsible ? (
        <button
          type="button"
          className="nav-group__toggle"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={toggle}
        >
          <Icon name="tools" size={16} />
          <span>{group.label}</span>
          <Icon name="chevron" size={16} className="nav-group__chevron" />
        </button>
      ) : (
        <p className="nav-group__label" id={`${listId}-label`}>
          {group.label}
        </p>
      )}
      {expanded ? (
        <ul id={listId} aria-labelledby={collapsible ? undefined : `${listId}-label`}>
          {group.items.map((item) => (
            <li key={item.to}>
              <NavEntry
                item={item}
                rail={rail}
                badge={item.to === paths.tasks ? pendingTasks : undefined}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function SidebarContent({
  rail,
  mobile,
  pendingTasks,
  name,
  email,
  signingOut,
  onSignOut,
  onNavigate,
  onToggleRail,
  onClose,
}: SidebarProps) {
  const initials = (name || 'Usuario')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
  return (
    <>
      <div className="sidebar__brand">
        <Brand compact iconOnly={rail} to={paths.dashboard} label="Chambapp · Ir a Hoy" />
        {mobile ? (
          <IconButton icon="close" label="Cerrar menú" onClick={onClose} data-autofocus />
        ) : null}
      </div>
      <nav className="sidebar__nav" aria-label="Navegación principal">
        {navigationGroups.map((group) => (
          <Group
            key={group.id}
            group={group}
            rail={rail}
            pendingTasks={pendingTasks}
            onNavigate={onNavigate}
          />
        ))}
      </nav>
      <div className="sidebar__bottom">
        <NavEntry item={settingsItem} rail={rail} onNavigate={onNavigate} />
        <div className="sidebar__profile">
          <span className="avatar" aria-hidden="true">
            {initials}
          </span>
          <div className="sidebar__identity">
            <strong>{name}</strong>
            <span title={email}>{email}</span>
          </div>
          <IconButton
            icon="logout"
            label="Cerrar sesión"
            disabled={signingOut}
            onClick={onSignOut}
          />
        </div>
        {!mobile ? (
          <button
            type="button"
            className="sidebar__collapse"
            onClick={onToggleRail}
            aria-label={rail ? 'Expandir menú' : 'Contraer menú a iconos'}
            title={rail ? 'Expandir menú' : 'Contraer menú a iconos'}
          >
            <Icon name={rail ? 'expand' : 'collapse'} size={16} />
            <span className="nav-item__label">Contraer menú</span>
          </button>
        ) : null}
      </div>
    </>
  );
}
