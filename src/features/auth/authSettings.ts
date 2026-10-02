import { configurationError } from '../../lib/supabase/client';
import { parseAuthSettings } from './authSettingsModel';
import type { AuthSettings } from './authSettingsModel';
export type { AuthSettings } from './authSettingsModel';

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
  return parseAuthSettings(await response.json());
}
