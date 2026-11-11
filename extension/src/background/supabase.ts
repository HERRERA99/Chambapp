import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../src/lib/supabase/database.types';
import type { CommandAction, Json } from '../../../src/domain/models';
import {
  isRetryableStatus,
  isValidCommandResponse,
  rpcForAction,
} from '../../../src/lib/supabase/commandValidation';
import { DataError, readableError } from '../../../src/lib/supabase/errors';
import { GENERATION_HEADER, LOCAL_USER_ID } from '../../../src/lib/localUser';
import { accountKey, sameAccount } from '../shared/backend';
import { getSettings } from './settings';

import { cloudAvailable, cloudKey as key, cloudUrl as url } from '../shared/cloud';

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
 * Cloud client. Only the service worker talks to Supabase, so a single client
 * refreshes the session. No timers: the worker sleeps; `getSession()` refreshes when needed.
 */
export const cloud = createClient<Database>(url, key, {
  auth: {
    flowType: 'pkce',
    storage,
    storageKey: 'chambapp-extension-auth',
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

type Client = SupabaseClient<Database>;
type LocalClient = {
  origin: string;
  client: Client;
  state: { installation: string; generation: string; at: number } | null;
  /** Last state seen, kept while the installation does not answer. */
  last?: { installation: string; generation: string; at: number } | null;
  error: string | null;
};
let local: LocalClient | null = null;
/** Changes whenever the backend or the local address changes (see resetLocalClient). */
let epoch = 0;
export const connectionEpoch = () => epoch;

type AccountListener = (account: string) => void;
let onLocalAccountChange: AccountListener | null = null;
/** Called when a local installation reports another installation or data generation. */
export function onLocalAccountChanged(listener: AccountListener) {
  onLocalAccountChange = listener;
}

/** Client of a local installation; no accounts, so no session (nginx strips the key). */
function localClient(origin: string): LocalClient {
  if (local?.origin === origin) return local;
  local = {
    origin,
    client: createClient<Database>(origin, 'chambapp-local', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
    state: null,
    error: null,
  };
  return local;
}

/** Forgets the local client (backend or address changed). */
export function resetLocalClient() {
  local = null;
  epoch += 1;
}

const STATE_TTL = 3_000;

/** Installation and data generation of the local database (cached for a few seconds). */
async function localState(target: LocalClient) {
  if (target.state && Date.now() - target.state.at < STATE_TTL) return target.state;
  const { data, error } = await target.client
    .rpc('chambapp_copia_estado')
    .abortSignal(AbortSignal.timeout(5_000));
  const value = data as { instalacion?: unknown; generacion?: unknown } | null;
  if (error || typeof value?.instalacion !== 'string' || typeof value.generacion !== 'string') {
    target.state = null;
    target.error = `No se puede conectar con Chambapp local en ${target.origin}. Comprueba que Docker está en marcha y que la dirección es correcta.`;
    return null;
  }
  target.error = null;
  const previous = target.state ?? target.last;
  target.state = { installation: value.instalacion, generation: value.generacion, at: Date.now() };
  target.last = target.state;
  // A restore (new generation) or another installation at this address: same protocol
  // as changing account (index.ts).
  if (
    previous &&
    (previous.installation !== value.instalacion || previous.generation !== value.generacion)
  )
    onLocalAccountChange?.(
      accountKey({
        backend: 'local',
        origin: target.origin,
        installation: value.instalacion,
        generation: value.generacion,
      }),
    );
  return target.state;
}

/** The database the extension talks to now. */
export async function db(): Promise<Client> {
  const settings = await getSettings();
  return settings.backend === 'local' ? localClient(settings.localOrigin).client : cloud;
}

export type ExtSession = {
  backend: 'nube' | 'local';
  /** The client of this session's connection: use it for the whole operation. */
  client: Client;
  /** connectionEpoch() when the session was resolved. */
  epoch: number;
  user: { id: string; email: string | null };
  /** Cloud only: the access token checked for this session. */
  accessToken: string | null;
  /** Local only: the data generation every write must carry. */
  generation: string | null;
  /** Identity of the account (see shared/backend.ts). */
  account: string;
};

/** Signed-in cloud session, or the local installation when it answers. */
export async function currentSession(): Promise<ExtSession | null> {
  const at = epoch;
  const settings = await getSettings();
  if (settings.backend === 'local') {
    const target = localClient(settings.localOrigin);
    const state = await localState(target).catch(() => null);
    if (!state) return null;
    return {
      backend: 'local',
      client: target.client,
      epoch: at,
      user: { id: LOCAL_USER_ID, email: `Local · ${new URL(target.origin).host}` },
      accessToken: null,
      generation: state.generation,
      account: accountKey({
        backend: 'local',
        origin: target.origin,
        installation: state.installation,
        generation: state.generation,
      }),
    };
  }
  if (!cloudAvailable) return null;
  const { data, error } = await cloud.auth.getSession();
  if (error || !data.session) return null;
  return {
    backend: 'nube',
    client: cloud,
    epoch: at,
    user: { id: data.session.user.id, email: data.session.user.email ?? null },
    accessToken: data.session.access_token,
    generation: null,
    account: accountKey({ backend: 'nube', userId: data.session.user.id }),
  };
}

/** Why a local installation is unreachable (null in the cloud or when it answers). */
export async function localProblem(): Promise<string | null> {
  const settings = await getSettings();
  if (settings.backend !== 'local') return null;
  const target = localClient(settings.localOrigin);
  await localState(target).catch(() => null);
  return target.error;
}

export const ACCOUNT_CHANGED =
  'La extensión ha cambiado de cuenta o de instalación (o se han restaurado los datos). Vuelve a intentarlo.';

/** Current session; with `expected` (an account key, or a cloud user id), it must still be that account. */
export async function requireSession(expected?: string) {
  const session = await currentSession();
  if (!session) {
    const problem = await localProblem();
    throw new Error(problem ?? 'Inicia sesión en la extensión.');
  }
  if (expected && !sameAccount(expected, session.account)) throw new Error(ACCOUNT_CHANGED);
  if (session.epoch !== epoch) throw new Error(ACCOUNT_CHANGED);
  return session;
}

export async function requireUser(expected?: string) {
  return (await requireSession(expected)).user;
}

/** Same RPC routing and response checks as the web app. */
export async function command<T = unknown>(
  action: CommandAction,
  payload: Record<string, Json | undefined>,
  expected?: string,
): Promise<T> {
  const session = await requireSession(expected);
  // The checked session's own client: a backend switch meanwhile never redirects the
  // write (a local operation can never reach the cloud, or the other way round).
  if (session.epoch !== epoch) throw new Error(ACCOUNT_CHANGED);
  const request = session.client
    .rpc(rpcForAction(action), { p_accion: action, p_datos: payload })
    .abortSignal(AbortSignal.timeout(20_000));
  // Pin what was checked above: a later account switch (cloud) or restore (local)
  // cannot retarget this write; the local server rejects an older generation.
  if (session.accessToken) request.setHeader('Authorization', `Bearer ${session.accessToken}`);
  if (session.generation) request.setHeader(GENERATION_HEADER, session.generation);
  if (session.epoch !== epoch) throw new Error(ACCOUNT_CHANGED);
  const { data, error, status } = await request;
  if (error)
    throw new DataError(readableError(error), isRetryableStatus(status), error.code, error.message);
  if (!isValidCommandResponse(action, payload, data))
    throw new DataError(
      'El servidor no ha devuelto una confirmación completa. Reintenta para comprobar el resultado.',
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
