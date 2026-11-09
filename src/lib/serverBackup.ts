// Backup files of the local edition (Plan 12): everything in the local database,
// as exported by chambapp_copia_exportar, optionally encrypted with a password
// chosen when downloading (PBKDF2-SHA-256 + AES-GCM, the same scheme as the browser
// backups). Independent of the vault: notes and passwords stay encrypted inside.
import {
  decryptJson,
  derivePasswordKey,
  encryptJson,
  newSalt,
  UnreadableEnvelopeError,
  VAULT_ITERATIONS,
} from './crypto/vault.ts';

export const SERVER_BACKUP_FORMAT = 'chambapp-servidor';
export const SERVER_ENCRYPTED_FORMAT = 'chambapp-servidor-cifrado';
export const SERVER_DATA_FORMAT = 'chambapp-servidor-datos';
export const SERVER_BACKUP_VERSION = 1;
/**
 * Largest database payload (the JSON sent to chambapp_copia_importar). nginx accepts
 * 64 MiB per request (docker/web/default.conf.template): the payload plus its wrapper
 * must fit. Downloads larger than this are refused, so every saved backup is importable.
 */
export const MAX_SERVER_DATA_BYTES = 55 * 1024 * 1024;
/** Largest backup file: an encrypted file is base64 (4/3) plus a small envelope. */
export const MAX_SERVER_BACKUP_BYTES = Math.ceil((MAX_SERVER_DATA_BYTES * 4) / 3) + 8 * 1024 * 1024;

const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
/** Whether this payload is within the import limit. */
export const fitsImportLimit = (datos: ServerData) => byteLength(datos) <= MAX_SERVER_DATA_BYTES;

export const serverBackupAad = (userId: string) => `chambapp:copia-servidor:v1:${userId}`;

/** What chambapp_copia_exportar returns (and chambapp_copia_importar accepts). */
export type ServerData = {
  formato: typeof SERVER_DATA_FORMAT;
  version: 1;
  usuario_id: string;
  tablas: Record<string, Record<string, unknown>[]>;
  [key: string]: unknown;
};
export type ServerBackup = {
  formato: typeof SERVER_BACKUP_FORMAT;
  version: 1;
  exportado_en: string;
  usuario_id: string;
  datos: ServerData;
};
export type EncryptedServerBackup = {
  formato: typeof SERVER_ENCRYPTED_FORMAT;
  version: 1;
  usuario_id: string;
  kdf: { nombre: 'PBKDF2-SHA256'; sal: string; iteraciones: number };
  sobre: string;
};

/** Errors carry the codes readableError knows. */
export type BackupErrorCode =
  'COPIA_INVALIDA' | 'COPIA_OTRA_CUENTA' | 'COPIA_CONTRASENA' | 'COPIA_DEMASIADO_GRANDE';
export class BackupError extends Error {
  readonly code: BackupErrorCode;
  constructor(code: BackupErrorCode) {
    super(code);
    this.code = code;
    this.name = 'BackupError';
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const isInstant = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

export function isServerData(value: unknown, userId: string): value is ServerData {
  return (
    record(value) &&
    value.formato === SERVER_DATA_FORMAT &&
    value.version === 1 &&
    value.usuario_id === userId &&
    record(value.tablas) &&
    Object.values(value.tablas).every(
      (rows) => Array.isArray(rows) && rows.every((row) => record(row)),
    )
  );
}

export function buildServerBackup(datos: ServerData, now: Date): ServerBackup {
  return {
    formato: SERVER_BACKUP_FORMAT,
    version: SERVER_BACKUP_VERSION,
    exportado_en: now.toISOString(),
    usuario_id: datos.usuario_id,
    datos,
  };
}

export async function encryptServerBackup(
  backup: ServerBackup,
  password: string,
  iterations = VAULT_ITERATIONS,
): Promise<EncryptedServerBackup> {
  const sal = newSalt();
  const key = await derivePasswordKey(password, sal, iterations);
  return {
    formato: SERVER_ENCRYPTED_FORMAT,
    version: SERVER_BACKUP_VERSION,
    usuario_id: backup.usuario_id,
    kdf: { nombre: 'PBKDF2-SHA256', sal, iteraciones: iterations },
    sobre: await encryptJson(key, serverBackupAad(backup.usuario_id), backup),
  };
}

export type ServerReadResult =
  { kind: 'needs-password' } | { kind: 'ok'; data: ServerData; exportadoEn: string };

/** Reads a backup file; encrypted files need `password`. Throws BackupError. */
export async function readServerBackup(
  text: string,
  userId: string,
  password?: string,
): Promise<ServerReadResult> {
  if (text.length > MAX_SERVER_BACKUP_BYTES) throw new BackupError('COPIA_DEMASIADO_GRANDE');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError('COPIA_INVALIDA');
  }
  if (!record(parsed) || parsed.version !== SERVER_BACKUP_VERSION)
    throw new BackupError('COPIA_INVALIDA');
  if (parsed.usuario_id !== userId) throw new BackupError('COPIA_OTRA_CUENTA');
  if (parsed.formato === SERVER_ENCRYPTED_FORMAT) {
    const kdf = parsed.kdf;
    if (
      !record(kdf) ||
      kdf.nombre !== 'PBKDF2-SHA256' ||
      typeof kdf.sal !== 'string' ||
      typeof kdf.iteraciones !== 'number' ||
      typeof parsed.sobre !== 'string'
    )
      throw new BackupError('COPIA_INVALIDA');
    if (password === undefined) return { kind: 'needs-password' };
    let inner: unknown;
    try {
      const key = await derivePasswordKey(password, kdf.sal, kdf.iteraciones);
      inner = await decryptJson(key, serverBackupAad(userId), parsed.sobre);
    } catch (cause) {
      if (cause instanceof UnreadableEnvelopeError) throw new BackupError('COPIA_CONTRASENA');
      throw cause;
    }
    return readPlain(inner, userId);
  }
  return readPlain(parsed, userId);
}

function readPlain(value: unknown, userId: string): ServerReadResult {
  if (
    !record(value) ||
    value.formato !== SERVER_BACKUP_FORMAT ||
    value.version !== SERVER_BACKUP_VERSION ||
    !isInstant(value.exportado_en)
  )
    throw new BackupError('COPIA_INVALIDA');
  if (value.usuario_id !== userId) throw new BackupError('COPIA_OTRA_CUENTA');
  if (!isServerData(value.datos, userId)) throw new BackupError('COPIA_INVALIDA');
  if (!fitsImportLimit(value.datos)) throw new BackupError('COPIA_DEMASIADO_GRANDE');
  return { kind: 'ok', data: value.datos, exportadoEn: value.exportado_en };
}

/** Counts shown before replacing everything. */
export function summarize(data: ServerData) {
  const live = (table: string) =>
    (data.tablas[table] ?? []).filter(
      (row) => !('eliminado_en' in row) || row.eliminado_en === null,
    ).length;
  return {
    proyectos: live('public.proyectos'),
    tareas: live('public.tareas'),
    partes: live('public.partes_horas'),
    fichajes: live('public.fichajes'),
    notas: (data.tablas['public.notas'] ?? []).length,
    contrasenas: (data.tablas['public.credenciales'] ?? []).length,
    ausencias: (data.tablas['public.ausencias'] ?? []).length,
  };
}
