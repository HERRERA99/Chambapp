// Backups of the local edition (Plan 12): download everything in the local database,
// and replace everything with a backup file.
import { DateTime } from 'luxon';
import { getSupabase } from '../../lib/supabase/client';
import { DataError, readableError } from '../../lib/supabase/errors';
import { isRetryableStatus } from '../../lib/supabase/commandValidation';
import { dataGeneration, reloadForNewData, storageScope } from '../../lib/localGeneration';
import {
  BackupError,
  buildServerBackup,
  encryptServerBackup,
  fitsImportLimit,
  isServerData,
  readServerBackup,
  summarize,
} from '../../lib/serverBackup';
import type { ServerData } from '../../lib/serverBackup';
import type { Json } from '../../domain/models';
import { trackerStorageKey } from '../tracker/pendingOperation';
import { attendanceStorageKey } from '../attendance/pendingAttendance';

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportData(userId: string): Promise<ServerData> {
  const { data, error, status } = await getSupabase()
    .rpc('chambapp_copia_exportar')
    .abortSignal(AbortSignal.timeout(120_000));
  if (error)
    throw new DataError(readableError(error), isRetryableStatus(status), error.code, error.message);
  if (!isServerData(data, userId))
    throw new DataError('La base de datos local no ha devuelto una copia completa.', true);
  return data;
}

/** Downloads a backup of everything; with a password, encrypted. */
export async function downloadServerBackup(userId: string, password?: string, label = '') {
  const now = new Date();
  const datos = await exportData(userId);
  // Never save a backup that could not be imported again.
  if (!fitsImportLimit(datos)) throw new DataError(readableError('COPIA_DEMASIADO_GRANDE'));
  const plain = buildServerBackup(datos, now);
  const file = password ? await encryptServerBackup(plain, password) : plain;
  const stamp = DateTime.fromJSDate(now).toFormat('yyyy-LL-dd-HHmm');
  downloadText(
    `chambapp-copia-${stamp}${label}${password ? '-cifrada' : ''}.json`,
    `${JSON.stringify(file, null, 2)}\n`,
  );
}

export type InspectedServerBackup =
  | { kind: 'needs-password' }
  | { kind: 'ok'; data: ServerData; exportadoEn: string; counts: ReturnType<typeof summarize> };

export async function inspectServerBackup(
  file: File,
  userId: string,
  password?: string,
): Promise<InspectedServerBackup> {
  try {
    const result = await readServerBackup(await file.text(), userId, password);
    if (result.kind === 'needs-password') return result;
    return { ...result, counts: summarize(result.data) };
  } catch (cause) {
    if (cause instanceof BackupError)
      throw new DataError(readableError(cause.code), false, cause.code);
    throw cause;
  }
}

/**
 * Replaces everything with the backup. Downloads a copy of the current data first.
 * Afterwards this tab drops what belonged to the previous data and every tab reloads.
 */
export async function replaceWithBackup(userId: string, data: ServerData) {
  const previous = dataGeneration();
  if (!previous) throw new DataError('Espera a que terminen de cargarse tus datos.', true);
  await downloadServerBackup(userId, undefined, '-antes-de-restaurar');
  const { error, status } = await getSupabase()
    .rpc('chambapp_copia_importar', {
      p_datos: { generacion_esperada: previous, datos: data as unknown as Json },
    })
    .abortSignal(AbortSignal.timeout(180_000));
  if (error)
    throw new DataError(readableError(error), isRetryableStatus(status), error.code, error.message);
  const scope = storageScope(userId, previous);
  try {
    if (scope) {
      localStorage.removeItem(trackerStorageKey(scope));
      localStorage.removeItem(`${trackerStorageKey(scope)}:paused`);
      localStorage.removeItem(attendanceStorageKey(scope));
      sessionStorage.removeItem(`chambapp:notes-draft:${scope}`);
    }
  } catch {
    // Storage unavailable: those keys belong to the old generation and are never read again.
  }
  reloadForNewData();
}
