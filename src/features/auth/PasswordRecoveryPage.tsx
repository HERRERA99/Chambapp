import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Brand } from '../../shared/brand/Brand';
import { Button } from '../../shared/ui/Button';
import { InputField } from '../../shared/ui/FormField';
import { Notice } from '../../shared/ui/Panel';
import { getSupabase } from '../../lib/supabase/client';
import { paths } from '../../app/paths';
import { useAuth } from './useAuth';
import { authErrorMessage } from './errors';
import './auth.css';

export default function PasswordRecoveryPage() {
  const { user, loading, completePasswordRecovery } = useAuth();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    return query.get('error_description') ?? hash.get('error_description');
  });
  const [updated, setUpdated] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password'));
    if (password !== String(form.get('confirmation'))) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const { error: authError } = await getSupabase().auth.updateUser({ password });
      if (authError) throw authError;
      completePasswordRecovery();
      setUpdated(true);
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  if (loading)
    return (
      <div className="route-loading" role="status">
        Verificando el enlace…
      </div>
    );
  return (
    <div className="auth-page">
      <header className="auth-header">
        <Brand />
        <Link className="text-link" to={paths.login}>
          Volver a iniciar sesión
        </Link>
      </header>
      <main className="auth-grid">
        <section className="auth-showcase">
          <p className="eyebrow">Acceso a tu cuenta</p>
          <h1>
            Una nueva contraseña.
            <br />
            <span>Tu espacio sigue contigo.</span>
          </h1>
          <p className="auth-lead muted">Usa una contraseña que no utilices en otros servicios.</p>
        </section>
        <section className="auth-console">
          <div className="auth-console__body">
            <h2>Restablecer contraseña</h2>
            {error ? (
              <p className="accent" role="alert">
                {error}
              </p>
            ) : null}
            {updated ? (
              <div className="form-stack">
                <div role="status">
                  <Notice title="Contraseña actualizada">
                    Ya puedes volver a tu espacio de trabajo.
                  </Notice>
                </div>
                <Link className="button button--primary" to={paths.dashboard}>
                  Abrir Workspace
                </Link>
              </div>
            ) : user ? (
              <form className="form-stack" onSubmit={submit} aria-busy={pending}>
                <InputField
                  label="Nueva contraseña"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  disabled={pending}
                  hint="Utiliza al menos 8 caracteres."
                />
                <InputField
                  label="Repetir contraseña"
                  name="confirmation"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  disabled={pending}
                />
                <Button type="submit" variant="primary" disabled={pending}>
                  {pending ? 'Guardando…' : 'Guardar contraseña'}
                </Button>
              </form>
            ) : (
              <div className="form-stack">
                <Notice title="Abre tu enlace de recuperación">
                  Solicita un nuevo enlace desde «¿Olvidaste la clave?» en la pantalla de acceso. El
                  enlace anterior puede haber caducado.
                </Notice>
                <Link className="text-link" to={paths.login}>
                  Ir a iniciar sesión
                </Link>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
