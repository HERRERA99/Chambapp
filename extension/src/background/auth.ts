import type { Provider } from '@supabase/supabase-js';
import { oauthProviders } from '../../../src/features/auth/oauth';
import { readableError } from '../../../src/lib/supabase/errors';
import { cloud as supabase, currentSession } from './supabase';

const LAST_USER_KEY = 'chambapp_last_user';
/** Account key (shared/backend.ts) of the last account seen; replaces LAST_USER_KEY. */
const LAST_ACCOUNT_KEY = 'chambapp_last_account';

export async function signInWithPassword(email: string, password: string) {
  if (!email.trim() || !password) throw new Error('Escribe tu correo y tu contraseña.');
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(readableError(error));
}

/**
 * OAuth in a browser window owned by Chrome. Runs in the worker: the popup
 * closes as soon as that window takes the focus.
 */
export async function signInWithProvider(providerId: string) {
  const provider = oauthProviders.find((item) => item.id === providerId);
  if (!provider) throw new Error('Proveedor de acceso no disponible.');
  const redirectTo = chrome.identity.getRedirectURL('auth');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider.id as Provider,
    options: { redirectTo, skipBrowserRedirect: true, scopes: provider.scopes },
  });
  if (error || !data.url) throw new Error(readableError(error ?? 'No se pudo iniciar el acceso.'));
  let result: string | undefined;
  try {
    result = await chrome.identity.launchWebAuthFlow({ url: data.url, interactive: true });
  } catch (cause) {
    const text = cause instanceof Error ? cause.message : String(cause);
    if (/did not approve|cancel/i.test(text))
      throw new Error('Has cancelado el acceso.', { cause });
    throw new Error(
      `No se pudo completar el acceso. Comprueba que ${redirectTo}** está en las Redirect URLs de Supabase.`,
      { cause },
    );
  }
  if (!result) throw new Error('Has cancelado el acceso.');
  const returned = new URL(result);
  const params = new URLSearchParams(returned.search);
  const hash = new URLSearchParams(returned.hash.replace(/^#/, ''));
  const problem = params.get('error_description') ?? hash.get('error_description');
  if (problem) throw new Error(problem);
  const code = params.get('code');
  if (!code) throw new Error('El proveedor no devolvió un código de acceso.');
  const exchange = await supabase.auth.exchangeCodeForSession(code);
  if (exchange.error) throw new Error(readableError(exchange.error));
}

export async function signOut() {
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
}

/**
 * Previous and current account. The caller clears what belonged to a
 * different account (vault key, pending sends).
 */
export async function accountChange() {
  const session = await currentSession();
  const account = session?.account ?? null;
  const stored = await chrome.storage.local.get([LAST_ACCOUNT_KEY, LAST_USER_KEY]);
  const legacyUser = stored[LAST_USER_KEY] as string | undefined;
  const previous =
    (stored[LAST_ACCOUNT_KEY] as string | undefined) ?? (legacyUser ? `nube:${legacyUser}` : null);
  if (account && account !== previous)
    await chrome.storage.local.set({ [LAST_ACCOUNT_KEY]: account });
  return {
    previous,
    account,
    userId: session?.user.id ?? null,
    email: session?.user.email ?? null,
    changed: !!account && account !== previous,
  };
}
