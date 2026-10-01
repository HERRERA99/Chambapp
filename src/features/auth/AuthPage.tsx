import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, NavLink, useLocation } from 'react-router-dom';
import { Brand } from '../../shared/brand/Brand';
import { Button, ButtonLink, IconButton } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { InputField } from '../../shared/ui/FormField';
import { Panel, Badge, Progress, Notice } from '../../shared/ui/Panel';
import { Modal } from '../../shared/ui/Modal';
import { configurationError, getSupabase } from '../../lib/supabase/client';
import { paths } from '../../app/paths';
import { useAuth } from './useAuth';
import { safeReturnTo } from './returnTo';
import { authErrorMessage } from './errors';
import { useAuthSettings } from './useAuthSettings';
import './auth.css';

function RecoveryRequest({ onClose }: { onClose: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const { error: authError } = await getSupabase().auth.resetPasswordForEmail(
        String(form.get('email')).trim(),
        {
          redirectTo: `${window.location.origin}${paths.recovery}`,
        },
      );
      if (authError) throw authError;
      setSent(true);
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  if (sent)
    return (
      <div className="form-stack">
        <div role="status">
          <Notice title="Revisa tu correo">
            Si existe una cuenta con esa dirección, recibirás un enlace para restablecer la
            contraseña.
          </Notice>
        </div>
        <Button variant="primary" onClick={onClose}>
          Entendido
        </Button>
      </div>
    );
  return (
    <form className="form-stack" onSubmit={submit} aria-busy={pending}>
      <InputField
        label="Correo electrónico"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="nombre@empresa.com"
        required
        disabled={pending}
      />
      {error ? (
        <p role="alert" className="accent">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" disabled={pending || !!configurationError}>
        {pending ? 'Enviando…' : 'Enviar enlace de recuperación'}
      </Button>
    </form>
  );
}

function AuthConsole({
  register,
  returnTo,
  callbackError,
}: {
  register: boolean;
  returnTo: string;
  callbackError: string | null;
}) {
  const { error: sessionError } = useAuth();
  const { data: settings } = useAuthSettings();
  const [showPassword, setShowPassword] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(callbackError);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const suffix = `?returnTo=${encodeURIComponent(returnTo)}`;
  const emailConfigurationError =
    register && settings?.disableSignup
      ? 'La creación de cuentas está deshabilitada. Puedes acceder con una cuenta existente.'
      : settings && !settings.external.email
        ? 'El acceso por correo está deshabilitado en este espacio.'
        : null;
  const showOAuth =
    (!register || !settings?.disableSignup) &&
    (settings?.external.google || settings?.external.github);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || emailConfigurationError) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email')).trim();
    const password = String(form.get('password'));
    const nombre = String(form.get('name') ?? '').trim();
    if (register && !nombre) {
      setError('Escribe tu nombre para crear el perfil.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      const client = getSupabase();
      if (register) {
        const { data, error: authError } = await client.auth.signUp({
          email,
          password,
          options: {
            data: { nombre },
            emailRedirectTo: `${window.location.origin}${paths.login}${suffix}`,
          },
        });
        if (authError) throw authError;
        if (!data.session) setVerificationEmail(email);
      } else {
        const { error: authError } = await client.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
      }
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  async function signInWithProvider(provider: 'google' | 'github') {
    if (pending || !settings?.external[provider]) return;
    setPending(true);
    setError(null);
    try {
      const { error: authError } = await getSupabase().auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}${paths.login}${suffix}` },
      });
      if (authError) throw authError;
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  const visibleError = emailConfigurationError ?? error ?? sessionError;
  return (
    <>
      <nav className="auth-tabs" aria-label="Modo de acceso">
        <NavLink
          to={`${paths.login}${suffix}`}
          className={({ isActive }) => (isActive ? 'active' : '')}
        >
          Iniciar sesión
        </NavLink>
        <NavLink
          to={`${paths.register}${suffix}`}
          className={({ isActive }) => (isActive ? 'active' : '')}
        >
          Crear cuenta
        </NavLink>
      </nav>
      <div className="auth-console__body">
        <p className="eyebrow">{register ? 'Configuración inicial' : 'Acceso profesional'}</p>
        <h2>{register ? 'Crea tu Workspace' : 'Acceso al Workspace'}</h2>
        <p className="muted">
          {register
            ? 'Diseña una jornada que tenga sentido para ti.'
            : 'Tu consola de trabajo, lista para una nueva jornada.'}
        </p>
        {visibleError ? (
          <p className="accent" role="alert">
            {visibleError}
          </p>
        ) : null}
        {verificationEmail ? (
          <div role="status" className="form-stack">
            <Notice title="Confirma tu correo">
              Hemos solicitado el alta de {verificationEmail}. Abre el enlace de confirmación que
              recibirás para acceder a tu espacio.
            </Notice>
            <Link className="text-link" to={`${paths.login}${suffix}`}>
              Volver a iniciar sesión
            </Link>
          </div>
        ) : (
          <>
            {showOAuth ? (
              <>
                <div className="auth-sso">
                  {settings?.external.github ? (
                    <Button
                      icon="github"
                      disabled={pending || !!configurationError}
                      onClick={() => void signInWithProvider('github')}
                    >
                      GitHub
                    </Button>
                  ) : null}
                  {settings?.external.google ? (
                    <Button
                      icon="globe"
                      disabled={pending || !!configurationError}
                      onClick={() => void signInWithProvider('google')}
                    >
                      Google
                    </Button>
                  ) : null}
                </div>
                <div className="auth-divider">
                  <span>o credenciales directas</span>
                </div>
              </>
            ) : null}
            <form className="form-stack" onSubmit={submit} aria-busy={pending}>
              {register ? (
                <InputField
                  label="Nombre completo"
                  name="name"
                  autoComplete="name"
                  placeholder="Tu nombre y apellidos"
                  maxLength={200}
                  required
                  disabled={pending}
                />
              ) : null}
              <InputField
                label="Correo electrónico"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="nombre@empresa.com"
                required
                disabled={pending}
              />
              <div className="password-field">
                <InputField
                  label="Contraseña"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  placeholder="Introduce tu contraseña"
                  minLength={register ? 8 : undefined}
                  required
                  disabled={pending}
                />
                <IconButton
                  icon={showPassword ? 'eyeOff' : 'eye'}
                  label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setShowPassword((value) => !value)}
                />
              </div>
              {register ? (
                <p className="field__hint">Utiliza al menos 8 caracteres.</p>
              ) : (
                <div className="split-label">
                  <span className="field__hint">Tu sesión se mantiene en este navegador.</span>
                  <button
                    type="button"
                    className="text-button"
                    disabled={!!emailConfigurationError}
                    onClick={() => setRecoveryOpen(true)}
                  >
                    ¿Olvidaste la clave?
                  </button>
                </div>
              )}
              <Button
                variant="primary"
                type="submit"
                icon="arrow"
                className="full-width"
                disabled={pending || !!configurationError || !!emailConfigurationError}
              >
                {pending ? 'Conectando…' : register ? 'Crear cuenta' : 'Entrar al Workspace'}
              </Button>
            </form>
          </>
        )}
        <p className="auth-footer-copy muted">
          Tu espacio personal para organizar proyectos, tareas y jornadas.
        </p>
      </div>
      <Modal
        open={recoveryOpen}
        onClose={() => setRecoveryOpen(false)}
        title="Recuperar acceso"
        description="Introduce tu correo para recibir un enlace de recuperación."
      >
        {recoveryOpen ? <RecoveryRequest onClose={() => setRecoveryOpen(false)} /> : null}
      </Modal>
    </>
  );
}

export default function AuthPage() {
  const location = useLocation();
  const { user, loading, isPasswordRecovery } = useAuth();
  const register = location.pathname === paths.register;
  const query = new URLSearchParams(location.search);
  const fragment = new URLSearchParams(location.hash.slice(1));
  const returnTo = safeReturnTo(query.get('returnTo'));
  const callbackError = query.get('error_description') ?? fragment.get('error_description');

  if (loading)
    return (
      <div className="route-loading" role="status">
        Comprobando tu sesión…
      </div>
    );
  if (user) return <Navigate to={isPasswordRecovery ? paths.recovery : returnTo} replace />;

  return (
    <div className="auth-page">
      <a href="#auth-form" className="skip-link">
        Saltar al formulario
      </a>
      <header className="auth-header">
        <Brand />
        <ButtonLink to={paths.home} variant="ghost" icon="left">
          Volver al inicio
        </ButtonLink>
      </header>
      <main className="auth-grid">
        <section className="auth-showcase">
          <p className="eyebrow">
            <span className="status-dot" /> Tu espacio de trabajo
          </p>
          <h1>
            Control de tiempo de precisión.
            <br />
            <span>Cero fricción, cero control punitivo.</span>
          </h1>
          <p className="muted auth-lead">
            Una jornada transparente, redondeo inteligente y una semana diseñada para consultores,
            ingenieros y equipos técnicos.
          </p>
          <Panel className="auth-telemetry">
            <div className="split-label">
              <div>
                <p className="eyebrow">Tiempo real · Ejemplo</p>
                <strong>Desarrollo del proyecto</strong>
              </div>
              <Badge tone="accent">R15</Badge>
            </div>
            <div className="auth-chrono mono">
              04:08:00<span>Real</span>
            </div>
            <div className="split-label">
              <Badge tone="accent">Imputado: 4h 15min</Badge>
              <span className="mono muted">+7min</span>
            </div>
            <svg className="telemetry-line" viewBox="0 0 500 65" fill="none" aria-hidden="true">
              <path
                d="M0 56h42l22-17 35 6 21-16 29 12 22-7 27 9 31-33 26 15 27-8 30 14 24-22 23 9 35-17 31 3"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path d="M0 60h500" stroke="currentColor" opacity="0.15" />
            </svg>
            <Progress value={52} label="Ejemplo de progreso de jornada" />
            <p className="mono dim">Inicio y fin exactos · Duración redondeada hacia arriba</p>
          </Panel>
          <div className="auth-trust">
            <Icon name="shield" />
            <p>
              Conserva una vista clara del tiempo real y del tiempo imputado.{' '}
              <span className="dim">
                Tus registros y preferencias permanecen asociados a tu cuenta.
              </span>
            </p>
          </div>
        </section>
        <section id="auth-form" className="auth-console">
          <AuthConsole
            key={location.pathname}
            register={register}
            returnTo={returnTo}
            callbackError={callbackError}
          />
        </section>
      </main>
      <footer className="auth-page-footer">
        <span>© Chambapp · Operations</span>
        <span>Español (ES)</span>
        <Link to={paths.home}>Volver al inicio</Link>
      </footer>
    </div>
  );
}
