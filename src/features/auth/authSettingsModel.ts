import type { Provider } from '@supabase/supabase-js';

export type AuthSettings = {
  external: Partial<Record<Provider, boolean>> & { email: boolean };
  disableSignup: boolean;
  emailConfirmationRequired: boolean;
};

/** Only public boolean flags are retained; credentials and unknown values are ignored. */
export function parseAuthSettings(value: unknown): AuthSettings {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !('external' in value) ||
    !value.external ||
    typeof value.external !== 'object' ||
    Array.isArray(value.external)
  )
    throw new Error('La configuración pública de acceso no tiene el formato esperado.');
  const external: AuthSettings['external'] = { email: false };
  for (const [key, enabled] of Object.entries(value.external)) {
    if (enabled === true && /^[a-z][a-z0-9_]*$/.test(key))
      Object.defineProperty(external, key, { value: true, enumerable: true });
  }
  return {
    external,
    disableSignup: 'disable_signup' in value && value.disable_signup === true,
    emailConfirmationRequired: !(
      'mailer_autoconfirm' in value && value.mailer_autoconfirm === true
    ),
  };
}
