import { configurationError } from '../../lib/supabase/client';

export type AuthSettings = {
  external: { email: boolean; google: boolean; github: boolean };
  disableSignup: boolean;
  emailConfirmationRequired: boolean;
};

/** The public Auth endpoint exposes enabled providers, never their credentials. */
export async function loadAuthSettings(signal?: AbortSignal): Promise<AuthSettings> {
  if (configurationError) throw new Error(configurationError);
  const url = String(import.meta.env.VITE_SUPABASE_URL).replace(/\/+$/, '');
  const key = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
  const response = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: key },
    signal,
  });
  if (!response.ok) throw new Error('No se pudieron consultar los métodos de acceso disponibles.');
  const settings: unknown = await response.json();
  if (
    !settings ||
    typeof settings !== 'object' ||
    !('external' in settings) ||
    !settings.external ||
    typeof settings.external !== 'object'
  ) {
    throw new Error('La configuración pública de acceso no tiene el formato esperado.');
  }
  const external = settings.external;
  return {
    external: {
      email: 'email' in external && external.email === true,
      google: 'google' in external && external.google === true,
      github: 'github' in external && external.github === true,
    },
    disableSignup: 'disable_signup' in settings && settings.disable_signup === true,
    emailConfirmationRequired: !(
      'mailer_autoconfirm' in settings && settings.mailer_autoconfirm === true
    ),
  };
}
