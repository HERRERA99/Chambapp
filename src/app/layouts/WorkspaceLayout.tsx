import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Button, IconButton } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Panel';
import { useFocusTrap } from '../../shared/ui/useFocusTrap';
import { paths } from '../paths';
import { pageTitle } from '../navigation';
import { useWorkspace } from '../../features/workspace/useWorkspace';
import { useTracker } from '../../features/tracker/useTracker';
import { useAttendance } from '../../features/attendance/useAttendance';
import { useAuth } from '../../features/auth/useAuth';
import { getSupabase } from '../../lib/supabase/client';
import { readableError } from '../../lib/supabase/errors';
import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { SidebarContent } from './Sidebar';
import { HeaderStatus } from './HeaderStatus';
import { useIsMobile, useSidebarPreference } from './useSidebar';
import './shell.css';

const drawerTransition = { type: 'tween', duration: 0.22, ease: [0.22, 1, 0.36, 1] } as const;

export function WorkspaceLayout() {
  // The drawer belongs to the page where it was opened: navigating closes it.
  const [drawer, setDrawer] = useState<{ open: boolean; path: string }>({ open: false, path: '' });
  const [signingOut, setSigningOut] = useState(false);
  const [preference, updatePreference] = useSidebarPreference();
  const mobile = useIsMobile();
  const { pathname } = useLocation();
  const { data, error, reload } = useWorkspace();
  const { user } = useAuth();
  const tracker = useTracker();
  const attendance = useAttendance();
  const notify = useFeedback();
  const drawerRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const drawerOpen = mobile && drawer.open && drawer.path === pathname;
  const closeDrawer = useCallback(() => setDrawer((current) => ({ ...current, open: false })), []);
  useFocusTrap(drawerRef, drawerOpen, closeDrawer);
  // After choosing a destination in the drawer, focus moves to the new page content.
  // This effect runs after the focus trap has restored focus to the menu button.
  const focusAfterNavigation = useRef(false);
  const focusContent = useCallback(() => {
    if (mobile) focusAfterNavigation.current = true;
  }, [mobile]);
  useEffect(() => {
    if (!focusAfterNavigation.current) return;
    focusAfterNavigation.current = false;
    contentRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  const title = pageTitle(pathname);
  const pendingTasks =
    data?.tasks.filter(
      (task) => !task.archivado_en && !task.eliminado_en && task.estado !== 'completada',
    ).length ?? 0;
  const desktopHidden = !mobile && preference.hidden;
  const rail = !mobile && preference.rail;
  const menuVisible = mobile ? drawerOpen : !preference.hidden;

  async function signOut() {
    setSigningOut(true);
    try {
      const { error: cause } = await getSupabase().auth.signOut();
      if (cause) throw cause;
    } catch (cause) {
      notify(readableError(cause), 'error');
    } finally {
      setSigningOut(false);
    }
  }

  const sidebar = (
    <SidebarContent
      rail={rail}
      mobile={mobile}
      pendingTasks={pendingTasks}
      name={data?.profile.nombre ?? ''}
      email={user?.email}
      signingOut={signingOut}
      onSignOut={() => void signOut()}
      onNavigate={focusContent}
      onToggleRail={() => updatePreference({ rail: !preference.rail })}
      onClose={closeDrawer}
    />
  );

  return (
    <div
      className={`workspace ${desktopHidden ? 'workspace--menu-hidden' : ''} ${rail ? 'workspace--rail' : ''}`}
    >
      <a href="#workspace-content" className="skip-link">
        Saltar al contenido
      </a>
      {mobile ? (
        <AnimatePresence>
          {drawerOpen ? (
            <>
              <motion.div
                key="backdrop"
                className="sidebar-backdrop"
                aria-hidden="true"
                onClick={closeDrawer}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              />
              <motion.aside
                key="drawer"
                ref={drawerRef}
                id="workspace-navigation"
                className="sidebar sidebar--drawer"
                role="dialog"
                aria-modal="true"
                aria-label="Menú de navegación"
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={drawerTransition}
              >
                {sidebar}
              </motion.aside>
            </>
          ) : null}
        </AnimatePresence>
      ) : !preference.hidden ? (
        <aside
          id="workspace-navigation"
          className={`sidebar ${rail ? 'sidebar--rail' : ''}`}
          aria-label="Menú de navegación"
        >
          {sidebar}
        </aside>
      ) : null}
      <div className="workspace__body" inert={mobile && drawerOpen ? true : undefined}>
        <header className="workspace-header">
          <div className="workspace-header__title">
            <IconButton
              className="menu-toggle"
              icon={menuVisible ? 'sidebarClose' : 'sidebarOpen'}
              label={menuVisible ? 'Ocultar menú' : 'Mostrar menú'}
              aria-expanded={menuVisible}
              aria-controls={menuVisible ? 'workspace-navigation' : undefined}
              onClick={() =>
                mobile
                  ? setDrawer({ open: true, path: pathname })
                  : updatePreference({ hidden: !preference.hidden })
              }
            />
            <span className="workspace-header__page">{title}</span>
          </div>
          {pathname !== paths.dashboard ? (
            // Hoy and Fichajes already show these controls in the page.
            <HeaderStatus showAttendance={pathname !== paths.attendance} />
          ) : null}
        </header>
        <main id="workspace-content" ref={contentRef} tabIndex={-1} className="workspace-content">
          {error ? (
            <Notice title="No se pudieron actualizar los datos" tone="warning">
              {readableError(error)} Se muestran los últimos datos cargados.{' '}
              <Button size="sm" icon="refresh" onClick={() => void reload()}>
                Actualizar
              </Button>
            </Notice>
          ) : null}
          {tracker.error ? (
            <div role="alert">
              <Notice title="El cronómetro necesita tu atención" tone="danger">
                {tracker.error}
                {tracker.pending
                  ? ' Usa Reintentar en el cronómetro para confirmar la operación.'
                  : ''}
              </Notice>
            </div>
          ) : null}
          {attendance.error ? (
            <div role="alert">
              <Notice title="El fichaje necesita tu atención" tone="danger">
                {attendance.error}
                {attendance.pending
                  ? ' Reintenta el fichaje pendiente para confirmar el resultado.'
                  : ''}
              </Notice>
            </div>
          ) : null}
          {attendance.pending && !attendance.error ? (
            <Notice title="Fichaje pendiente de confirmar" tone="warning">
              Usa Reintentar fichaje para comprobar el resultado. Se conservan los instantes del
              intento original.
            </Notice>
          ) : null}
          <motion.div
            key={pathname}
            className="workspace-page"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
