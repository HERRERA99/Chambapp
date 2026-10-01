import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/useAuth';
import { useWorkspace } from '../features/workspace/useWorkspace';
import { Button } from '../shared/ui/Button';
import { Notice } from '../shared/ui/Panel';
import { paths } from './paths';
import { safeReturnTo } from '../features/auth/returnTo';

export function RequireAuth({ onboarding = false }: { onboarding?: boolean }) {
  const auth = useAuth();
  const workspace = useWorkspace();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  if (auth.loading)
    return (
      <div className="route-loading" role="status">
        Comprobando tu sesión…
      </div>
    );
  if (!auth.user)
    return <Navigate to={`${paths.login}?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  if (auth.isPasswordRecovery) return <Navigate to={paths.recovery} replace />;
  if (workspace.isLoading)
    return (
      <div className="route-loading" role="status">
        Cargando tu espacio de trabajo…
      </div>
    );
  if (!workspace.data)
    return (
      <main className="onboarding-container page-stack">
        <div role="alert">
          <Notice title="No se pudo cargar tu espacio">
            {workspace.error?.message ?? 'Tu perfil todavía no está disponible.'}
          </Notice>
        </div>
        <Button onClick={() => void workspace.reload()}>Volver a intentar</Button>
      </main>
    );
  if (!onboarding && !workspace.data.profile.onboarding_completado)
    return <Navigate to={`${paths.onboarding}?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  if (onboarding && workspace.data.profile.onboarding_completado) {
    const destination = safeReturnTo(new URLSearchParams(location.search).get('returnTo'));
    return (
      <Navigate to={destination === paths.onboarding ? paths.dashboard : destination} replace />
    );
  }
  return <Outlet />;
}
