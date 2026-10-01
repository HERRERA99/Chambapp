import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Brand } from '../../shared/brand/Brand';
import { ButtonLink, IconButton } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import type { IconName } from '../../shared/ui/Icon';
import { Badge } from '../../shared/ui/Panel';
import { paths } from '../paths';
import { TimerDisplay } from '../../features/tracker/TimerDisplay';
import { Modal } from '../../shared/ui/Modal';

const navigation: readonly { to: string; label: string; icon: IconName }[] = [
  { to: paths.dashboard, label: 'Resumen', icon: 'grid' },
  { to: paths.projects, label: 'Proyectos & CRM', icon: 'folder' },
  { to: paths.tasks, label: 'Tareas', icon: 'tasks' },
  { to: paths.entries, label: 'Partes de horas', icon: 'clock' },
  { to: paths.week, label: 'Mi semana', icon: 'calendar' },
  { to: paths.settings, label: 'Ajustes', icon: 'settings' },
];

export function WorkspaceLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { pathname } = useLocation();
  const title = navigation.find(item => item.to === pathname)?.label ?? 'Workspace';
  return <div className="workspace"><a href="#workspace-content" className="skip-link">Saltar al contenido</a>{menuOpen ? <button className="sidebar-backdrop" aria-label="Cerrar navegación" onClick={() => setMenuOpen(false)} /> : null}<aside className={`sidebar ${menuOpen ? 'sidebar--open' : ''}`} aria-label="Panel de navegación"><div className="sidebar__brand"><Brand compact /><IconButton className="sidebar__close" icon="close" label="Cerrar menú" onClick={() => setMenuOpen(false)} /><div className="sidebar__metadata"><Badge tone="accent"><span className="status-dot" /> Pro Workspace</Badge><span className="mono dim">UI 0.1</span></div></div><p className="eyebrow sidebar__label">Navegación</p><nav aria-label="Navegación principal">{navigation.map(item => <NavLink key={item.to} to={item.to} onClick={() => setMenuOpen(false)} className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`}><Icon name={item.icon} /><span>{item.label}</span>{item.to === paths.tasks ? <span className="nav-count">12</span> : null}</NavLink>)}</nav><div className="sidebar__bottom"><div className="preview-note"><Icon name="info" size={15} /><span>Vista previa<br /><span className="dim">Datos de demostración</span></span></div><div className="sidebar__profile"><span className="avatar"><Icon name="user" /></span><div><strong>Alexandre M.</strong><span className="dim">Lead Product Eng.</span></div><ButtonLink to={paths.login} variant="ghost" icon="logout"><span className="sr-only">Ir a acceso</span></ButtonLink></div></div></aside><div className="workspace__body"><header className="workspace-header"><div className="workspace-header__breadcrumb"><IconButton className="mobile-menu" icon="menu" label="Abrir navegación" onClick={() => setMenuOpen(true)} /><span className="eyebrow">Workspace</span><span className="dim">/</span><strong>{title}</strong><Badge>Vista previa</Badge></div><div className="workspace-header__actions"><div className="header-tracker"><TimerDisplay compact /></div><Badge>R15</Badge><IconButton icon="bell" label="Ver notificaciones" onClick={() => setNotificationsOpen(true)} /><NavLink to={paths.settings} className="avatar avatar--accent" aria-label="Mi perfil">AM</NavLink></div></header><main id="workspace-content" tabIndex={-1} className="workspace-content"><Outlet /></main><footer className="workspace-footer"><span>Chambapp Operations</span><span>Vista previa de UI · Sin conexión a servicios</span></footer></div><Modal open={notificationsOpen} onClose={() => setNotificationsOpen(false)} title="Centro de notificaciones"><div className="empty-state"><Icon name="bell" size={32} /><h3>Todo en orden</h3><p className="muted">Las notificaciones estarán disponibles cuando se conecten los servicios.</p></div></Modal></div>;
}
