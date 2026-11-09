import { originPattern } from '../shared/patterns';
import { AUTO_LOCK_OPTIONS } from '../shared/messages';
import type { AutoLock, Settings } from '../shared/messages';
import { DATE_FORMATS } from '../shared/automation';
import { DEFAULT_LOCAL_ORIGIN, normalizeLocalOrigin } from '../shared/backend';
import type { Backend } from '../shared/backend';
import type { DateFormat } from '../shared/automation';

const SETTINGS_KEY = 'chambapp_settings_v1';
const DETECTOR_ID = 'chambapp-odoo-detect';
const LOCAL_BRIDGE_ID = 'chambapp-app-bridge-local';

function storedLocalOrigin(value: unknown) {
  try {
    return typeof value === 'string' ? normalizeLocalOrigin(value) : DEFAULT_LOCAL_ORIGIN;
  } catch {
    return DEFAULT_LOCAL_ORIGIN;
  }
}

export async function getSettings(): Promise<Settings> {
  const stored = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] as
    Partial<Settings> | undefined;
  const autoLock = AUTO_LOCK_OPTIONS.includes(stored?.autoLockMinutes as AutoLock)
    ? (stored!.autoLockMinutes as AutoLock)
    : 15;
  return {
    backend: stored?.backend === 'local' ? 'local' : 'nube',
    localOrigin: storedLocalOrigin(stored?.localOrigin),
    odooOrigin: typeof stored?.odooOrigin === 'string' ? stored.odooOrigin : null,
    odooDateFormat: DATE_FORMATS.includes(stored?.odooDateFormat as DateFormat)
      ? (stored!.odooDateFormat as DateFormat)
      : 'dmy',
    autoLockMinutes: autoLock,
  };
}

async function saveSettings(settings: Settings) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function setAutoLock(minutes: AutoLock) {
  if (!AUTO_LOCK_OPTIONS.includes(minutes)) throw new Error('Opción de bloqueo no válida.');
  await saveSettings({ ...(await getSettings()), autoLockMinutes: minutes });
}

/** Origin (scheme://host[:port]) of an Odoo address typed by the user. */
export function normalizeOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Escribe la dirección completa de Odoo, por ejemplo https://empresa.odoo.com.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname)
    throw new Error(
      'La dirección de Odoo debe empezar por http:// o https:// y no llevar usuario.',
    );
  return url.origin;
}

export async function setDateFormat(format: DateFormat) {
  if (!DATE_FORMATS.includes(format)) throw new Error('Formato de fecha no válido.');
  await saveSettings({ ...(await getSettings()), odooDateFormat: format });
}

export { originPattern };

export async function hasOdooPermission(origin: string | null) {
  if (!origin) return false;
  return chrome.permissions.contains({ origins: [originPattern(origin)] });
}

/**
 * Saves the Odoo origin. The page asks for the host permission (it needs a
 * user gesture); here the previous permission is dropped and the detector is
 * registered only for the new origin.
 */
export async function setOdooOrigin(value: string | null) {
  const settings = await getSettings();
  const origin = value ? normalizeOrigin(value) : null;
  if (origin && !(await hasOdooPermission(origin)))
    throw new Error('Concede el permiso para acceder a tu Odoo y vuelve a intentarlo.');
  const next = { ...settings, odooOrigin: origin };
  await saveSettings(next);
  if (settings.odooOrigin) await dropUnusedPermission(settings.odooOrigin, next);
  await syncDetector();
}

/** Keeps the dynamic content script in line with the saved origin and its permission. */
export async function syncDetector() {
  const { odooOrigin } = await getSettings();
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [DETECTOR_ID] });
  if (registered.length)
    await chrome.scripting.unregisterContentScripts({ ids: [DETECTOR_ID] }).catch(() => undefined);
  if (!odooOrigin || !(await hasOdooPermission(odooOrigin))) return;
  await chrome.scripting.registerContentScripts([
    {
      id: DETECTOR_ID,
      matches: [originPattern(odooOrigin)],
      js: ['content/odoo-detect.js'],
      runAt: 'document_idle',
      allFrames: false,
      persistAcrossSessions: true,
    },
  ]);
}

export async function hasLocalPermission(origin: string) {
  return chrome.permissions.contains({ origins: [originPattern(origin)] });
}

/**
 * Chooses the cloud or a local installation. The options page asks for the host
 * permission of the local address first (it needs a user gesture). The caller applies
 * the account transition (lock, caches, queue) afterwards.
 */
export async function setBackend(backend: Backend, localOriginValue: string) {
  if (backend !== 'nube' && backend !== 'local') throw new Error('Modo de conexión no válido.');
  const settings = await getSettings();
  const localOrigin = normalizeLocalOrigin(localOriginValue || DEFAULT_LOCAL_ORIGIN);
  if (backend === 'local' && !(await hasLocalPermission(localOrigin)))
    throw new Error('Concede el permiso para acceder a Chambapp local y vuelve a intentarlo.');
  const next = { ...settings, backend, localOrigin };
  await saveSettings(next);
  await dropUnusedPermission(settings.localOrigin, next);
  await syncLocalBridge();
}

/** The app bridge also runs on the local installation's pages while in local mode. */
export async function syncLocalBridge() {
  const { backend, localOrigin } = await getSettings();
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [LOCAL_BRIDGE_ID] });
  if (registered.length)
    await chrome.scripting
      .unregisterContentScripts({ ids: [LOCAL_BRIDGE_ID] })
      .catch(() => undefined);
  if (backend !== 'local' || !(await hasLocalPermission(localOrigin))) return;
  await chrome.scripting.registerContentScripts([
    {
      id: LOCAL_BRIDGE_ID,
      matches: [originPattern(localOrigin)],
      js: ['content/app-bridge.js'],
      runAt: 'document_idle',
      allFrames: false,
      persistAcrossSessions: true,
    },
  ]);
}

/**
 * Removes the host permission of an address no longer used. Patterns ignore ports
 * (Firefox), so two addresses on different ports share one: it is kept while the
 * Odoo address or the local installation (in local mode) still needs it.
 */
async function dropUnusedPermission(previous: string, settings: Settings) {
  const pattern = originPattern(previous);
  const needed = [
    settings.odooOrigin,
    settings.backend === 'local' ? settings.localOrigin : null,
  ].filter((origin): origin is string => !!origin);
  if (needed.some((origin) => originPattern(origin) === pattern)) return;
  await chrome.permissions.remove({ origins: [pattern] }).catch(() => false);
}
