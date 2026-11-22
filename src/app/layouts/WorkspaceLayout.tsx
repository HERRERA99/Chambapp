import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Brand } from '../../shared/brand/Brand';
import { Button, IconButton } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { Badge, Notice } from '../../shared/ui/Panel';
import { paths } from '../paths';
import { navigationItems, resolveNavigation, settingsItem } from '../navigation';
import type { NavigationEntry } from '../navigation';
import { SectionTabs } from './SectionTabs';
import { TimerDisplay } from '../../features/tracker/TimerDisplay';
import { useWorkspace } from '../../features/workspace/useWorkspace';
import { useTracker } from '../../features/tracker/useTracker';
import { AttendanceControls } from '../../features/attendance/AttendanceControls';
import { useAttendance } from '../../features/attendance/useAttendance';
import { useAuth } from '../../features/auth/useAuth';
import { getSupabase } from '../../lib/supabase/client';
import { readableError } from '../../lib/supabase/errors';
import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { VaultProvider } from '../../features/vault/VaultProvider';
import { isLocalEdition } from '../../lib/edition';
import { LocalBanners } from '../../features/local/LocalBanners';
import { ExtensionProvider } from '../../features/extension/ExtensionProvider';
import { ExtensionDownloadButton } from '../../features/extension/ExtensionDownloadButton';
import { ExtensionStatusChip } from '../../features/extension/ExtensionStatusChip';

const collapsedKey = 'chambapp:sidebar-collapsed';

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode); the menu still works for this visit.
  }
}

export function WorkspaceLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => readStored<unknown>(collapsedKey, false) === true,
  );
  const [signingOut, setSigningOut] = useState(false);
  const { pathname } = useLocation();
  const { data, error, reload } = useWorkspace();
  const { user } = useAuth();
  const tracker = useTracker();
  const attendance = useAttendance();
  const notify = useFeedback();
  const { entry, tabs, title } = resolveNavigation(pathname);
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
  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    writeStored(collapsedKey, next);
  }
  function renderItem(item: NavigationEntry): ReactNode {
    const isActive = entry === item;
    return (
      <Link
        key={item.to}
        to={item.to}
        title={collapsed ? item.label : undefined}
        aria-current={isActive ? 'location' : undefined}
        onClick={() => setMenuOpen(false)}
        className={`nav-item${isActive ? ' nav-item--active' : ''}`}
      >
        <Icon name={item.icon} />
        <span className="nav-item__label">{item.label}</span>
        {item.to === paths.tasks && pendingTasks ? (
          <span className="nav-count">
            {pendingTasks}
            <span className="sr-only"> pendientes</span>
          </span>
        ) : null}
      </Link>
    );
  }
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
    // Keyed by account: the extension status and its queue belong to one user.
    <ExtensionProvider key={user?.id}>
      <div className={`workspace ${collapsed ? 'workspace--collapsed' : ''}`}>
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
            <Brand compact to={paths.dashboard} label="Chambapp · Hoy" />
            <Link to={paths.dashboard} className="sidebar__mark" aria-label="Chambapp · Hoy">
              <img src="/brand/favicon.svg" alt="" width="34" height="34" />
            </Link>
            <IconButton
              className="sidebar__close"
              icon="close"
              label="Cerrar menú"
              onClick={() => setMenuOpen(false)}
            />
            <IconButton
              className="sidebar__collapse"
              icon={collapsed ? 'sidebarOpen' : 'sidebarClose'}
              label={collapsed ? 'Mostrar menú' : 'Ocultar menú'}
              aria-expanded={!collapsed}
              onClick={toggleCollapsed}
            />
            <div className="sidebar__metadata">
              <Badge tone="accent">
                <span className="status-dot" /> Mi espacio
              </Badge>
              <span className="mono dim">0.1</span>
            </div>
          </div>
          <nav aria-label="Navegación principal">{navigationItems.map(renderItem)}</nav>
          <div className="sidebar__bottom">
            <div className="sidebar__settings">{renderItem(settingsItem)}</div>
            <div className="preview-note">
              <Icon name="globe" size={15} />
              <span>
                Zona horaria
                <br />
                <span className="dim">{profile?.zona_horaria}</span>
              </span>
            </div>
            <ExtensionDownloadButton onClick={() => setMenuOpen(false)} />
            <div className="sidebar__profile">
              <span className="avatar">{initials}</span>
              <div>
                <strong>{profile?.nombre}</strong>
                <span className="dim" title={isLocalEdition ? undefined : user?.email}>
                  {isLocalEdition ? 'Chambapp local · datos en este PC' : user?.email}
                </span>
              </div>
              {isLocalEdition ? null : (
                <IconButton
                  icon="logout"
                  label="Cerrar sesión"
                  disabled={signingOut}
                  onClick={() => void signOut()}
                />
              )}
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
              <AttendanceControls compact />
              <div className="header-tracker">
                <TimerDisplay compact />
              </div>
              <ExtensionStatusChip />
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
            {attendance.error ? (
              <div role="alert" className="form-error">
                {attendance.error}
                {attendance.pending
                  ? ' Reintenta el fichaje pendiente para confirmar el resultado.'
                  : ''}
              </div>
            ) : null}
            {attendance.pending && !attendance.error ? (
              <Notice title="Fichaje pendiente de confirmar">
                Usa Reintentar fichaje para comprobar el resultado. Se conservan los instantes del
                intento original.
              </Notice>
            ) : null}
            {/* Keyed by account: switching users drops any key held in memory. */}
            <VaultProvider key={user?.id}>
              {isLocalEdition ? null : <LocalBanners />}
              {entry && tabs.length > 0 ? <SectionTabs label={entry.label} tabs={tabs} /> : null}
              <Outlet />
            </VaultProvider>
          </main>
          <footer className="workspace-footer">
            <span>Chambapp</span>
            <span>Tiempos exactos · Duración imputada configurable</span>
          </footer>
        </div>
      </div>
    </ExtensionProvider>
  );
}
