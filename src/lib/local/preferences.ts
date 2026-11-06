// Account preferences about the local data (stored in perfiles.preferencias).
import type { Profile } from '../../domain/models.ts';

export type StorageMode = 'nube' | 'local';

type Preferences = Pick<Profile, 'preferencias'> | null | undefined;

/** Where new projects are created; the cloud unless the user chose this browser. */
export function storageMode(source: Preferences): StorageMode {
  return source?.preferencias?.almacenamiento === 'local' ? 'local' : 'nube';
}

/** Days after which an unsaved backup is reminded (0: never); 7 by default. */
export function backupReminderDays(source: Preferences): number {
  const value = source?.preferencias?.aviso_copia_dias;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 365
    ? value
    : 7;
}
