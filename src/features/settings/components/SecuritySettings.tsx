import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../shared/ui/Button';
import { Notice } from '../../../shared/ui/Panel';
import { getSupabase } from '../../../lib/supabase/client';
import { paths } from '../../../app/paths';
import { useAuth } from '../../auth/useAuth';
import { authErrorMessage } from '../../auth/errors';
import { SettingRow, SettingsSection } from './SettingRow';

export function SecuritySettings({
  disabled = false,
  hidden = false,
}: {
  disabled?: boolean;
  hidden?: boolean;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState<'password' | 'signout' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function requestPasswordChange() {
    if (pending || disabled || !user?.email) return;
    setPending('password');
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
      setPending(null);
    }
  }

  async function signOut() {
    if (pending || disabled) return;
    setPending('signout');
    setError(null);
    try {
      const { error: authError } = await getSupabase().auth.signOut({ scope: 'local' });
      if (authError) throw authError;
      navigate(paths.login, { replace: true });
    } catch (cause) {
      setError(authErrorMessage(cause));
      setPending(null);
    }
  }

  return (
    <SettingsSection
      id="seguridad"
      title="Seguridad"
      description={`Acceso a tu cuenta${user?.email ? ` (${user.email})` : ''}. Cada acción se ejecuta al momento.`}
      hidden={hidden}
    >
      <SettingRow
        label="Contraseña"
        description="Te enviaremos un enlace por correo para elegir una nueva."
      >
        <Button
          icon="shield"
          loading={pending === 'password'}
          disabled={!!pending || disabled || !user?.email}
          onClick={() => void requestPasswordChange()}
        >
          Enviar enlace de cambio
        </Button>
      </SettingRow>
      <SettingRow
        label="Sesión en este navegador"
        description="Cierra la sesión solo aquí; las demás sesiones siguen abiertas."
      >
        <Button
          icon="logout"
          loading={pending === 'signout'}
          disabled={!!pending || disabled}
          onClick={() => void signOut()}
        >
          Cerrar sesión
        </Button>
      </SettingRow>
      {error ? (
        <div role="alert">
          <Notice title="No se pudo completar la acción" tone="danger">
            {error}
          </Notice>
        </div>
      ) : null}
      {message ? (
        <div role="status">
          <Notice title="Revisa tu correo" tone="success">
            {message}
          </Notice>
        </div>
      ) : null}
    </SettingsSection>
  );
}
