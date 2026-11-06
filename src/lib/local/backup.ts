// Backup files of the local data: plain JSON or encrypted with a password chosen
// when downloading (independent of the vault, so a reset vault does not lose them).
import {
  decryptJson,
  derivePasswordKey,
  encryptJson,
  localBackupAad,
  newSalt,
  UnreadableEnvelopeError,
  VAULT_ITERATIONS,
} from '../crypto/vault.ts';
import { isOdooId, isOdooUrl } from '../../domain/odoo.ts';
import { roundingIntervals } from '../../domain/time.ts';
import { LocalCommandError } from './types.ts';
import type {
  LocalImputation,
  LocalPart,
  LocalProject,
  LocalSnapshot,
  LocalTask,
} from './types.ts';
import type { CloudInterval } from './engine.ts';

export const BACKUP_FORMAT = 'chambapp-local';
export const ENCRYPTED_BACKUP_FORMAT = 'chambapp-local-cifrado';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

export type BackupData = {
  proyectos: LocalProject[];
  tareas: LocalTask[];
  partes: LocalPart[];
  imputaciones: LocalImputation[];
  jornadas_locales: LocalSnapshot['jornadas_locales'];
};

export type PlainBackup = {
  formato: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportado_en: string;
  usuario_id: string;
  datos: BackupData;
};

export type EncryptedBackup = {
  formato: typeof ENCRYPTED_BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  usuario_id: string;
  kdf: { nombre: 'PBKDF2-SHA256'; sal: string; iteraciones: number };
  sobre: string;
};

const invalid = (): never => {
  throw new LocalCommandError('COPIA_INVALIDA');
};

export function buildBackup(snapshot: LocalSnapshot, now: Date): PlainBackup {
  return {
    formato: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportado_en: now.toISOString(),
    usuario_id: snapshot.usuario_id,
    datos: structuredClone({
      proyectos: snapshot.proyectos,
      tareas: snapshot.tareas,
      partes: snapshot.partes,
      imputaciones: snapshot.imputaciones,
      jornadas_locales: snapshot.jornadas_locales,
    }),
  };
}

export async function encryptBackup(
  backup: PlainBackup,
  password: string,
  iterations = VAULT_ITERATIONS,
): Promise<EncryptedBackup> {
  const sal = newSalt();
  const key = await derivePasswordKey(password, sal, iterations);
  return {
    formato: ENCRYPTED_BACKUP_FORMAT,
    version: BACKUP_VERSION,
    usuario_id: backup.usuario_id,
    kdf: { nombre: 'PBKDF2-SHA256', sal, iteraciones: iterations },
    sobre: await encryptJson(key, localBackupAad(backup.usuario_id), backup),
  };
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isId = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);
const isInstant = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
const isDay = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const optional = (value: unknown, check: (value: unknown) => boolean) =>
  value === null || check(value);
const isText = (value: unknown) => typeof value === 'string';
const length = (value: unknown, min: number, max: number) =>
  typeof value === 'string' && [...value.trim()].length >= min && [...value.trim()].length <= max;
const isCount = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isVersion = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;

function owned(row: Record<string, unknown>, userId: string) {
  return (
    isId(row.id) &&
    row.usuario_id === userId &&
    isInstant(row.creado_en) &&
    isInstant(row.actualizado_en) &&
    isVersion(row.version)
  );
}

function validProject(row: unknown, userId: string): row is LocalProject {
  return (
    record(row) &&
    owned(row, userId) &&
    length(row.nombre, 1, 200) &&
    optional(row.descripcion, isText) &&
    optional(row.cliente, (value) => length(value, 1, 200)) &&
    optional(row.presupuesto_minutos, isCount) &&
    optional(row.archivado_en, isInstant) &&
    optional(row.eliminado_en, isInstant)
  );
}

function validTask(row: unknown, userId: string): row is LocalTask {
  return (
    record(row) &&
    owned(row, userId) &&
    isId(row.proyecto_id) &&
    length(row.titulo, 1, 300) &&
    optional(row.descripcion, isText) &&
    ['pendiente', 'en_curso', 'completada'].includes(row.estado as string) &&
    optional(row.estimacion_minutos, isCount) &&
    optional(row.odoo_id, isOdooId) &&
    optional(row.odoo_url, isOdooUrl) &&
    optional(row.archivado_en, isInstant) &&
    optional(row.eliminado_en, isInstant)
  );
}

function validPart(row: unknown, userId: string): row is LocalPart {
  return (
    record(row) &&
    owned(row, userId) &&
    isId(row.tarea_id) &&
    isId(row.jornada_id) &&
    isDay(row.fecha) &&
    typeof row.zona_horaria === 'string' &&
    row.zona_horaria.length > 0 &&
    isInstant(row.inicio_en) &&
    optional(
      row.fin_en,
      (value) => isInstant(value) && Date.parse(value) > Date.parse(row.inicio_en as string),
    ) &&
    (roundingIntervals as readonly unknown[]).includes(row.intervalo_redondeo_minutos) &&
    row.modo_redondeo === 'superior' &&
    optional(row.descripcion, isText) &&
    typeof row.imputado_en_odoo === 'boolean' &&
    optional(row.imputacion_odoo_id, isId) &&
    row.imputado_en_odoo === (row.imputacion_odoo_id !== null) &&
    optional(row.eliminado_en, isInstant)
  );
}

function validImputation(row: unknown, userId: string): row is LocalImputation {
  return (
    record(row) &&
    isId(row.id) &&
    row.usuario_id === userId &&
    isId(row.tarea_id) &&
    isId(row.jornada_id) &&
    isDay(row.fecha) &&
    row.estado === 'manual' &&
    isInstant(row.creado_en)
  );
}

/** Rows, ownership and references of a data set; throws COPIA_INVALIDA. */
export function validateData(value: unknown, userId: string): BackupData {
  if (!record(value)) return invalid();
  const { proyectos, tareas, partes, imputaciones, jornadas_locales } = value;
  if (
    !Array.isArray(proyectos) ||
    !Array.isArray(tareas) ||
    !Array.isArray(partes) ||
    !Array.isArray(imputaciones) ||
    !record(jornadas_locales)
  )
    return invalid();
  if (
    !proyectos.every((row) => validProject(row, userId)) ||
    !tareas.every((row) => validTask(row, userId)) ||
    !partes.every((row) => validPart(row, userId)) ||
    !imputaciones.every((row) => validImputation(row, userId)) ||
    !Object.entries(jornadas_locales).every(
      ([day, entry]) =>
        isDay(day) && record(entry) && isId(entry.id) && typeof entry.zona_horaria === 'string',
    )
  )
    return invalid();
  const data = value as BackupData;
  checkIntegrity(data);
  return data;
}

/** Unique ids, every child has its parent, imputations group one task and day. */
function checkIntegrity(data: BackupData) {
  const ids = [
    ...data.proyectos.map((row) => row.id),
    ...data.tareas.map((row) => row.id),
    ...data.partes.map((row) => row.id),
    ...data.imputaciones.map((row) => row.id),
  ];
  if (new Set(ids).size !== ids.length) invalid();
  const projects = new Set(data.proyectos.map((row) => row.id));
  const tasks = new Map(data.tareas.map((row) => [row.id, row]));
  const imputations = new Map(data.imputaciones.map((row) => [row.id, row]));
  if (data.tareas.some((row) => !projects.has(row.proyecto_id))) invalid();
  for (const row of data.partes) {
    if (!tasks.has(row.tarea_id)) invalid();
    if (row.imputacion_odoo_id !== null) {
      const imputation = imputations.get(row.imputacion_odoo_id);
      if (!imputation || imputation.tarea_id !== row.tarea_id || imputation.fecha !== row.fecha)
        invalid();
    }
  }
}

export type ReadResult =
  { kind: 'needs-password' } | { kind: 'ok'; data: BackupData; exportadoEn: string };

/**
 * Reads a backup file. Encrypted files need `password` (without it: needs-password).
 * Throws LocalCommandError COPIA_INVALIDA, COPIA_OTRA_CUENTA or COPIA_CONTRASENA.
 */
export async function readBackup(
  textContent: string,
  userId: string,
  password?: string,
): Promise<ReadResult> {
  if (textContent.length > MAX_BACKUP_BYTES) return invalid();
  let parsed: unknown;
  try {
    parsed = JSON.parse(textContent);
  } catch {
    return invalid();
  }
  if (!record(parsed) || parsed.version !== BACKUP_VERSION) return invalid();
  if (parsed.usuario_id !== userId) {
    if (isId(parsed.usuario_id)) throw new LocalCommandError('COPIA_OTRA_CUENTA');
    return invalid();
  }
  if (parsed.formato === ENCRYPTED_BACKUP_FORMAT) {
    const kdf = parsed.kdf;
    if (
      !record(kdf) ||
      kdf.nombre !== 'PBKDF2-SHA256' ||
      typeof kdf.sal !== 'string' ||
      typeof kdf.iteraciones !== 'number' ||
      typeof parsed.sobre !== 'string'
    )
      return invalid();
    if (password === undefined) return { kind: 'needs-password' };
    let inner: unknown;
    try {
      const key = await derivePasswordKey(password, kdf.sal, kdf.iteraciones);
      inner = await decryptJson(key, localBackupAad(userId), parsed.sobre);
    } catch (cause) {
      if (cause instanceof UnreadableEnvelopeError) throw new LocalCommandError('COPIA_CONTRASENA');
      throw cause;
    }
    return readPlain(inner, userId);
  }
  return readPlain(parsed, userId);
}

function readPlain(value: unknown, userId: string): ReadResult {
  if (
    !record(value) ||
    value.formato !== BACKUP_FORMAT ||
    value.version !== BACKUP_VERSION ||
    !isInstant(value.exportado_en)
  )
    return invalid();
  if (value.usuario_id !== userId) throw new LocalCommandError('COPIA_OTRA_CUENTA');
  return { kind: 'ok', data: validateData(value.datos, userId), exportadoEn: value.exportado_en };
}

// ---------------------------------------------------------------- import

export type ImportPreview = {
  incoming: { proyectos: number; tareas: number; partes: number };
  /** Not here yet. */
  nuevos: number;
  /** Same id here, the file's copy is newer and wins when combining. */
  masRecientesEnArchivo: number;
  /** Same id here, the copy here is newer or equal and stays. */
  masRecientesAqui: number;
  /** Already in the cloud: skipped, a record lives in one place only. */
  enLaNube: number;
  eliminadosEnArchivo: number;
};

type Versioned = { id: string; version: number; actualizado_en: string };

/** True when `incoming` should replace `current` (higher version, then later update). */
export function newer(incoming: Versioned, current: Versioned) {
  return (
    incoming.version > current.version ||
    (incoming.version === current.version &&
      Date.parse(incoming.actualizado_en) > Date.parse(current.actualizado_en))
  );
}

/** Records (and their children) whose id is already in the cloud are dropped. */
function withoutCloud(data: BackupData, cloudIds: ReadonlySet<string>) {
  const projects = data.proyectos.filter((row) => !cloudIds.has(row.id));
  const projectIds = new Set(projects.map((row) => row.id));
  const tasks = data.tareas.filter(
    (row) => !cloudIds.has(row.id) && projectIds.has(row.proyecto_id),
  );
  const taskIds = new Set(tasks.map((row) => row.id));
  const parts = data.partes.filter((row) => !cloudIds.has(row.id) && taskIds.has(row.tarea_id));
  const used = new Set(parts.map((row) => row.imputacion_odoo_id));
  return {
    data: {
      proyectos: projects,
      tareas: tasks,
      partes: parts,
      imputaciones: data.imputaciones.filter((row) => used.has(row.id)),
      jornadas_locales: data.jornadas_locales,
    },
    skipped:
      data.proyectos.length -
      projects.length +
      data.tareas.length -
      tasks.length +
      data.partes.length -
      parts.length,
  };
}

export function previewImport(
  current: LocalSnapshot,
  incoming: BackupData,
  cloudIds: ReadonlySet<string>,
): ImportPreview {
  const { data, skipped } = withoutCloud(incoming, cloudIds);
  const here = new Map<string, Versioned>(
    [...current.proyectos, ...current.tareas, ...current.partes].map((row) => [row.id, row]),
  );
  const preview: ImportPreview = {
    incoming: {
      proyectos: incoming.proyectos.length,
      tareas: incoming.tareas.length,
      partes: incoming.partes.length,
    },
    nuevos: 0,
    masRecientesEnArchivo: 0,
    masRecientesAqui: 0,
    enLaNube: skipped,
    eliminadosEnArchivo: 0,
  };
  for (const row of [...data.proyectos, ...data.tareas, ...data.partes]) {
    if (row.eliminado_en !== null) preview.eliminadosEnArchivo += 1;
    const existing = here.get(row.id);
    if (!existing) preview.nuevos += 1;
    else if (newer(row, existing)) preview.masRecientesEnArchivo += 1;
    else preview.masRecientesAqui += 1;
  }
  return preview;
}

function mergeRows<T extends Versioned>(current: readonly T[], incoming: readonly T[]) {
  const rows = new Map(current.map((row) => [row.id, row]));
  for (const row of incoming) {
    const existing = rows.get(row.id);
    if (!existing || newer(row, existing)) rows.set(row.id, row);
  }
  return [...rows.values()];
}

/** The rules an import may not break: one open timer, no overlapping live entries. */
function checkTimeline(parts: readonly LocalPart[], cloudEntries: readonly CloudInterval[]) {
  const live = [...parts.filter((row) => row.eliminado_en === null), ...cloudEntries].sort(
    (a, b) => Date.parse(a.inicio_en) - Date.parse(b.inicio_en),
  );
  if (live.filter((row) => row.fin_en === null).length > 1)
    throw new LocalCommandError('CRONOMETRO_ACTIVO');
  for (let index = 1; index < live.length; index += 1) {
    const previous = live[index - 1]!;
    const previousEnd = previous.fin_en === null ? Infinity : Date.parse(previous.fin_en);
    if (Date.parse(live[index]!.inicio_en) < previousEnd)
      throw new LocalCommandError('PARTES_SOLAPADOS');
  }
}

/**
 * Snapshot after importing `incoming`. `combinar` keeps the newer copy of each record
 * (tombstones count); `reemplazar` keeps only the file's data. Throws when the result
 * would break the data rules.
 */
export function applyImport(
  current: LocalSnapshot,
  incoming: BackupData,
  mode: 'combinar' | 'reemplazar',
  cloudIds: ReadonlySet<string>,
  cloudEntries: readonly CloudInterval[],
  now: Date,
): LocalSnapshot {
  const { data } = withoutCloud(incoming, cloudIds);
  const next: LocalSnapshot = structuredClone(current);
  if (mode === 'reemplazar') {
    next.proyectos = structuredClone(data.proyectos);
    next.tareas = structuredClone(data.tareas);
    next.partes = structuredClone(data.partes);
    next.imputaciones = structuredClone(data.imputaciones);
    next.jornadas_locales = structuredClone(data.jornadas_locales);
    next.operaciones = {};
    next.traspasos = [];
  } else {
    next.proyectos = mergeRows(next.proyectos, data.proyectos);
    next.tareas = mergeRows(next.tareas, data.tareas);
    next.partes = mergeRows(next.partes, data.partes);
    const imputations = new Map(next.imputaciones.map((row) => [row.id, row]));
    for (const row of data.imputaciones) if (!imputations.has(row.id)) imputations.set(row.id, row);
    const used = new Set(next.partes.map((row) => row.imputacion_odoo_id));
    next.imputaciones = [...imputations.values()].filter((row) => used.has(row.id));
    next.jornadas_locales = { ...data.jornadas_locales, ...next.jornadas_locales };
  }
  // The merged set must still hold together on its own.
  checkIntegrity(next);
  checkTimeline(next.partes, cloudEntries);
  next.meta = { ...next.meta, actualizado_en: now.toISOString(), cambios_desde_copia: true };
  return next;
}
