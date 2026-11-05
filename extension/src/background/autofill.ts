import { displayHost, matchSite } from '../shared/matching';
import { pickLoginFields } from '../shared/fields';
import type { AutofillResult } from '../shared/messages';
import { findCredential } from './credentials';
import { assertSameEpoch, vaultEpoch } from './vault';

/**
 * Fills the login form of a tab with an entry. Only an exact site served over
 * HTTPS is filled directly. Other hosts, and any page over plain HTTP, need
 * the confirmation the popup shows, bound to the tab's current origin
 * (scheme, host and port), which is checked again inside the page.
 */
export async function autofill(
  tabId: number,
  credentialId: string,
  confirmedOrigin: string | null,
): Promise<AutofillResult> {
  const since = vaultEpoch();
  const { secret } = await findCredential(credentialId);
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const pageUrl = tab?.url ?? '';
  const pageHost = displayHost(pageUrl);
  if (!pageHost) throw new Error('Esta pestaña no es una web http(s): no se puede rellenar.');
  const pageOrigin = new URL(pageUrl).origin;
  const insecure = new URL(pageUrl).protocol !== 'https:';
  const match = secret!.url ? matchSite(secret!.url, pageUrl) : null;
  if ((match !== 'exact' || insecure) && confirmedOrigin !== pageOrigin)
    return {
      kind: 'confirm',
      pageHost,
      pageOrigin,
      insecure,
      credentialHost: secret!.url ? displayHost(secret!.url) : null,
    };
  const { username, password } = pickLoginFields(secret!.campos);
  if (!username && !password) throw new Error('La entrada no tiene campos para rellenar.');
  await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    files: ['/content/autofill-page.js'],
  });
  assertSameEpoch(since);
  const [result] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    func: (user: string | null, pass: string | null, origin: string) =>
      location.origin === origin ? (globalThis.__chambappFill?.(user, pass) ?? null) : null,
    args: [username?.valor ?? null, password?.valor ?? null, pageOrigin],
  });
  const filled = result?.result as { username: boolean; password: boolean } | null;
  if (!filled || (!filled.username && !filled.password)) return { kind: 'not-found' };
  return { kind: 'filled', username: filled.username, password: filled.password };
}
