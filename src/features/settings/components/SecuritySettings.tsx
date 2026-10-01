import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../shared/ui/Button';
import { Panel, Notice } from '../../../shared/ui/Panel';
import { getSupabase } from '../../../lib/supabase/client';
import { paths } from '../../../app/paths';
import { useAuth } from '../../auth/useAuth';
import { authErrorMessage } from '../../auth/errors';

export function SecuritySettings({ disabled = false }: { disabled?: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function requestPasswordChange() {
    if (pending || disabled || !user?.email) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const { error: authError } = await getSupabase().auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}${paths.recovery}`,
      });
      if (authError) throw authError;
      setMessage(
        'Hemos solicitado un enlace de cambio de contraseña. Revisa el correo asociado a tu cuenta.',
      );
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  async function signOut() {
    if (pending || disabled) return;
    setPending(true);
    setError(null);
    try {
      const { error: authError } = await getSupabase().auth.signOut({ scope: 'local' });
      if (authError) throw authError;
      navigate(paths.login, { replace: true });
    } catch (cause) {
      setError(authErrorMessage(cause));
      setPending(false);
    }
  }

  return (
    <Panel id="seguridad" title="Seguridad & Accesos" icon="lock">
      <p className="section-intro muted">Sesión asociada a {user?.email ?? 'tu cuenta'}.</p>
      <div className="page-actions">
        <Button
          icon="shield"
          disabled={pending || disabled || !user?.email}
          onClick={() => void requestPasswordChange()}
        >
          Cambiar contraseña por correo
        </Button>
        <Button icon="logout" disabled={pending || disabled} onClick={() => void signOut()}>
          Cerrar sesión en este navegador
        </Button>
      </div>
      {pending ? (
        <p role="status" className="field__hint">
          Conectando…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="accent">
          {error}
        </p>
      ) : null}
      {message ? (
        <div role="status">
          <Notice title="Revisa tu correo">{message}</Notice>
        </div>
      ) : null}
    </Panel>
  );
}
