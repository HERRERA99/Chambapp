import { createClient } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';
import type { Database } from '../../../src/lib/supabase/database.types';
import type { CommandAction, Json } from '../../../src/domain/models';
import {
  isRetryableStatus,
  isValidCommandResponse,
  rpcForAction,
} from '../../../src/lib/supabase/commandValidation';
import { DataError, readableError } from '../../../src/lib/supabase/errors';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/** Session kept by the extension itself (never the web app's: refresh tokens rotate). */
const storage = {
  async getItem(name: string) {
    const value = (await chrome.storage.local.get(name))[name];
    return typeof value === 'string' ? value : null;
  },
  async setItem(name: string, value: string) {
    await chrome.storage.local.set({ [name]: value });
  },
  async removeItem(name: string) {
    await chrome.storage.local.remove(name);
  },
};

/**
 * Only the service worker talks to Supabase, so a single client refreshes the
 * session. No timers: the worker sleeps; `getSession()` refreshes when needed.
 */
export const supabase = createClient<Database>(url, key, {
  auth: {
    flowType: 'pkce',
    storage,
    storageKey: 'chambapp-extension-auth',
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

export async function currentSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session;
}

export const ACCOUNT_CHANGED =
  'La sesión de la extensión cambió de cuenta. Vuelve a intentarlo con la cuenta correcta.';

/** Signed-in session; with `expectedUserId`, it must still be that account. */
export async function requireSession(expectedUserId?: string) {
  const session = await currentSession();
  if (!session) throw new Error('Inicia sesión en la extensión.');
  if (expectedUserId && session.user.id !== expectedUserId) throw new Error(ACCOUNT_CHANGED);
  return session;
}

export async function requireUser(expectedUserId?: string) {
  return (await requireSession(expectedUserId)).user;
}

/** Same RPC routing and response checks as the web app. */
export async function command<T = unknown>(
  action: CommandAction,
  payload: Record<string, Json | undefined>,
  expectedUserId?: string,
): Promise<T> {
  const session = await requireSession(expectedUserId);
  const request = supabase
    .rpc(rpcForAction(action), { p_accion: action, p_datos: payload })
    .abortSignal(AbortSignal.timeout(20_000));
  // Pin the token checked above: a later account switch cannot retarget this write.
  request.setHeader('Authorization', `Bearer ${session.access_token}`);
  const { data, error, status } = await request;
  if (error)
    throw new DataError(readableError(error), isRetryableStatus(status), error.code, error.message);
  if (!isValidCommandResponse(action, payload, data))
    throw new DataError(
      'Supabase no ha devuelto una confirmación completa. Reintenta para comprobar el resultado.',
      true,
      'RESPUESTA_INCOMPLETA',
    );
  const result = data as unknown;
  if (
    result &&
    typeof result === 'object' &&
    !Array.isArray(result) &&
    'ok' in result &&
    result.ok === false
  )
    throw new DataError(readableError('codigo' in result ? result.codigo : 'Operación rechazada.'));
  return data as T;
}

export function fail(error: { message: string; code?: string }, status: number): never {
  throw new DataError(readableError(error), isRetryableStatus(status), error.code, error.message);
}

export function message(error: unknown) {
  return error instanceof Error ? error.message : readableError(error);
}
