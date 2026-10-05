import { Navigate, useLocation } from 'react-router-dom';
import { Brand } from '../../shared/brand/Brand';
import { ButtonLink } from '../../shared/ui/Button';
import { Panel, Notice } from '../../shared/ui/Panel';
import { paths } from '../../app/paths';
import { useAuth } from './useAuth';
import { safeReturnTo } from './returnTo';
import { oauthCallbackError } from './errors';
import './auth.css';

export default function OAuthCallbackPage() {
  const { user, loading, error, isPasswordRecovery } = useAuth();
  const location = useLocation();
  const returnTo = safeReturnTo(new URLSearchParams(location.search).get('returnTo'));
  const callbackError = oauthCallbackError(location.search, location.hash) ?? error;

  // The singleton Supabase client exchanges the PKCE code during initialization.
  // Waiting for AuthProvider avoids exchanging the single-use code twice in StrictMode.
  if (loading)
    return (
      <div className="route-loading" role="status">
        Completando el inicio de sesión…
      </div>
    );
  const unexchangedCode = new URLSearchParams(window.location.search).has('code');
  if (!callbackError && !unexchangedCode && user)
    return <Navigate to={isPasswordRecovery ? paths.recovery : returnTo} replace />;

  return (
    <main className="auth-callback">
      <Brand />
      <Panel title="No se ha completado el acceso">
        <div role="alert">
          <Notice title="Vuelve a iniciar sesión">
            {callbackError ??
              'El enlace ha caducado o se abrió en otro navegador. Inicia el acceso de nuevo desde este navegador.'}
          </Notice>
        </div>
        <ButtonLink
          variant="primary"
          to={`${paths.login}?returnTo=${encodeURIComponent(returnTo)}`}
          icon="left"
        >
          Volver al acceso
        </ButtonLink>
      </Panel>
    </main>
  );
}
