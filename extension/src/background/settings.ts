import { originPattern } from '../shared/patterns';
import { AUTO_LOCK_OPTIONS } from '../shared/messages';
import type { AutoLock, Settings } from '../shared/messages';
import { DATE_FORMATS } from '../shared/automation';
import type { DateFormat } from '../shared/automation';

const SETTINGS_KEY = 'chambapp_settings_v1';
const DETECTOR_ID = 'chambapp-odoo-detect';

export async function getSettings(): Promise<Settings> {
  const stored = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] as
    Partial<Settings> | undefined;
  const autoLock = AUTO_LOCK_OPTIONS.includes(stored?.autoLockMinutes as AutoLock)
    ? (stored!.autoLockMinutes as AutoLock)
    : 15;
  return {
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
  if (settings.odooOrigin && settings.odooOrigin !== origin)
    await chrome.permissions
      .remove({ origins: [originPattern(settings.odooOrigin)] })
      .catch(() => false);
  await saveSettings({ ...settings, odooOrigin: origin });
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
