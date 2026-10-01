import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Brand } from '../../shared/brand/Brand';
import { Button, IconButton } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import type { IconName } from '../../shared/ui/Icon';
import { Badge, Notice } from '../../shared/ui/Panel';
import { paths } from '../paths';
import { TimerDisplay } from '../../features/tracker/TimerDisplay';
import { useWorkspace } from '../../features/workspace/useWorkspace';
import { useTracker } from '../../features/tracker/useTracker';
import { useAuth } from '../../features/auth/useAuth';
import { getSupabase } from '../../lib/supabase/client';
import { readableError } from '../../lib/supabase/errors';
import { useFeedback } from '../../shared/feedback/FeedbackContext';

const navigation: readonly { to: string; label: string; icon: IconName }[] = [
  { to: paths.dashboard, label: 'Resumen', icon: 'grid' },
  { to: paths.projects, label: 'Proyectos & clientes', icon: 'folder' },
  { to: paths.tasks, label: 'Tareas', icon: 'tasks' },
  { to: paths.entries, label: 'Partes de horas', icon: 'clock' },
  { to: paths.week, label: 'Mi semana', icon: 'calendar' },
  { to: paths.settings, label: 'Ajustes', icon: 'settings' },
];

export function WorkspaceLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { pathname } = useLocation();
  const { data, error, reload } = useWorkspace();
  const { user } = useAuth();
  const tracker = useTracker();
  const notify = useFeedback();
  const title = navigation.find((item) => item.to === pathname)?.label ?? 'Mi espacio';
  const profile = data?.profile;
  const initials = (profile?.nombre ?? 'Usuario')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
  const pendingTasks =
    data?.tasks.filter((task) => !task.archivado_en && task.estado !== 'completada').length ?? 0;
  async function signOut() {
    setSigningOut(true);
    try {
      const { error: cause } = await getSupabase().auth.signOut();
      if (cause) throw cause;
    } catch (cause) {
      notify(readableError(cause));
    } finally {
      setSigningOut(false);
    }
  }
  return (
    <div className="workspace">
      <a href="#workspace-content" className="skip-link">
        Saltar al contenido
      </a>
      {menuOpen ? (
        <button
          className="sidebar-backdrop"
          aria-label="Cerrar navegación"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
      <aside
        id="workspace-navigation"
        className={`sidebar ${menuOpen ? 'sidebar--open' : ''}`}
        aria-label="Panel de navegación"
      >
        <div className="sidebar__brand">
          <Brand compact />
          <IconButton
            className="sidebar__close"
            icon="close"
            label="Cerrar menú"
            onClick={() => setMenuOpen(false)}
          />
          <div className="sidebar__metadata">
            <Badge tone="accent">
              <span className="status-dot" /> Mi espacio
            </Badge>
            <span className="mono dim">0.1</span>
          </div>
        </div>
        <p className="eyebrow sidebar__label">Navegación</p>
        <nav aria-label="Navegación principal">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.to === paths.tasks && pendingTasks ? (
                <span className="nav-count">{pendingTasks}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__bottom">
          <div className="preview-note">
            <Icon name="globe" size={15} />
            <span>
              Zona horaria
              <br />
              <span className="dim">{profile?.zona_horaria}</span>
            </span>
          </div>
          <div className="sidebar__profile">
            <span className="avatar">{initials}</span>
            <div>
              <strong>{profile?.nombre}</strong>
              <span className="dim" title={user?.email}>
                {user?.email}
              </span>
            </div>
            <IconButton
              icon="logout"
              label="Cerrar sesión"
              disabled={signingOut}
              onClick={() => void signOut()}
            />
          </div>
        </div>
      </aside>
      <div className="workspace__body">
        <header className="workspace-header">
          <div className="workspace-header__breadcrumb">
            <IconButton
              className="mobile-menu"
              icon="menu"
              label="Abrir navegación"
              aria-expanded={menuOpen}
              aria-controls="workspace-navigation"
              onClick={() => setMenuOpen(true)}
            />
            <span className="eyebrow">Mi espacio</span>
            <span className="dim">/</span>
            <strong>{title}</strong>
          </div>
          <div className="workspace-header__actions">
            <div className="header-tracker">
              <TimerDisplay compact />
            </div>
            <Badge>
              {profile?.intervalo_redondeo_minutos
                ? `R${profile.intervalo_redondeo_minutos}`
                : 'Exacto'}
            </Badge>
            <NavLink to={paths.settings} className="avatar avatar--accent" aria-label="Mi perfil">
              {initials}
            </NavLink>
          </div>
        </header>
        <main id="workspace-content" tabIndex={-1} className="workspace-content">
          {error ? (
            <div className="page-stack">
              <Notice title="No se pudieron actualizar los datos">
                {readableError(error)} Se muestran los últimos datos cargados.
              </Notice>
              <Button onClick={() => void reload()}>Actualizar</Button>
            </div>
          ) : null}
          {tracker.error ? (
            <div role="alert" className="form-error">
              {tracker.error}
              {tracker.pending
                ? ' Usa Reintentar en el cronómetro para confirmar la operación.'
                : ''}
            </div>
          ) : null}
          <Outlet />
        </main>
        <footer className="workspace-footer">
          <span>Chambapp</span>
          <span>Tiempos exactos · Duración imputada configurable</span>
        </footer>
      </div>
    </div>
  );
}
