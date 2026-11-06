/**
 * Messages between the Chambapp web app and the browser extension.
 *
 * The page talks to the extension through `window.postMessage` with its own
 * origin as target; the extension's bridge script relays to the service worker.
 * Both sides validate every message with the functions below.
 */

export const APP_SOURCE = 'chambapp-app';
export const EXTENSION_SOURCE = 'chambapp-extension';

/** Odoo only accepts whole minutes; anything above this needs an extra confirmation. */
export const LONG_ODOO_MINUTES = 5 * 60;
export const MAX_ODOO_MINUTES = 24 * 60;
export const MAX_ODOO_DESCRIPTION = 1000;
export const MAX_ODOO_ENTRIES = 1000;

export type OdooEntryRef = { id: string; version: number };

/** One timesheet line to create in Odoo for a group of entries of one task and day. */
export type OdooRequest = {
  requestId: string;
  userId: string;
  taskId: string;
  taskVersion: number;
  /** ISO date of the entries (YYYY-MM-DD). */
  fecha: string;
  odooUrl: string;
  descripcion: string;
  minutos: number;
  /** `minutos` as HH:MM, the format typed into Odoo. */
  horasFormato: string;
  confirmLong: boolean;
  partes: OdooEntryRef[];
  /** Where the task and its entries are stored; absent means the cloud (older apps). */
  origen?: 'nube' | 'local';
};

/**
 * What the extension may ask a Chambapp tab about the data kept in that browser
 * (Plan 11). Only a tab of the same account with its local data open answers.
 */
export type LocalOperation =
  | { kind: 'listar' }
  | {
      kind: 'crear-tarea';
      tarea: {
        proyecto_id: string;
        titulo: string;
        odoo_id: string | null;
        odoo_url: string | null;
      };
    }
  | { kind: 'crear-proyecto'; nombre: string }
  | { kind: 'cargar'; taskId: string; partIds: string[] }
  | { kind: 'imputar'; partes: OdooEntryRef[] };

export type QueueStatus =
  'pending' | 'processing' | 'success' | 'error' | 'uncertain' | 'sent-unmarked';

/** What the app sees of a queued request: never descriptions or URLs. */
export type QueueSummaryItem = {
  requestId: string;
  taskId: string;
  entryIds: string[];
  status: QueueStatus;
  error: string;
};

export type QueueAction = 'retry' | 'discard' | 'confirm-created' | 'confirm-not-created';

export type AppMessage =
  | { source: typeof APP_SOURCE; type: 'ping' }
  | {
      source: typeof APP_SOURCE;
      type: 'local-reply';
      requestId: string;
      ok: boolean;
      error: string;
      data?: unknown;
    }
  | { source: typeof APP_SOURCE; type: 'send-odoo'; request: OdooRequest }
  | { source: typeof APP_SOURCE; type: 'queue-action'; requestId: string; action: QueueAction };

export type ExtensionHello = {
  version: string;
  userId: string | null;
  odooOrigin: string | null;
};

export type ExtensionMessage =
  | ({ source: typeof EXTENSION_SOURCE; type: 'hello' } & ExtensionHello)
  | { source: typeof EXTENSION_SOURCE; type: 'queue'; items: QueueSummaryItem[] }
  | { source: typeof EXTENSION_SOURCE; type: 'workspace-changed' }
  | {
      source: typeof EXTENSION_SOURCE;
      type: 'local-request';
      requestId: string;
      userId: string;
      op: LocalOperation;
    }
  | {
      source: typeof EXTENSION_SOURCE;
      type: 'send-result';
      requestId: string;
      ok: boolean;
      error: string;
    };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const queueStatuses: readonly QueueStatus[] = [
  'pending',
  'processing',
  'success',
  'error',
  'uncertain',
  'sent-unmarked',
];
const queueActions: readonly QueueAction[] = [
  'retry',
  'discard',
  'confirm-created',
  'confirm-not-created',
];

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && uuidPattern.test(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isVersion = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !datePattern.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** Whole minutes as Odoo's "HH:MM" time widget expects them. */
export function formatHoursMinutes(minutes: number): string {
  const total = Math.max(0, Math.floor(minutes));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Seconds to send to Odoo: always rounded up to the next whole minute. */
export function odooMinutes(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  // Whole microseconds, the database precision (like groupRounding): float noise such as
  // 120.00000001 s stays two minutes, while 60.000001 s is a real extra microsecond.
  return Math.ceil(Math.round(seconds * 1e6) / 60e6);
}

/** First problem of a request, worded for the user; null when it is well formed. */
export function odooRequestProblem(value: unknown): string | null {
  if (!isRecord(value)) return 'La solicitud no es válida.';
  const request = value;
  if (!isUuid(request.requestId) || !isUuid(request.userId) || !isUuid(request.taskId))
    return 'La solicitud no identifica la cuenta o la tarea.';
  if (!isVersion(request.taskVersion)) return 'La versión de la tarea no es válida.';
  if (!isIsoDate(request.fecha)) return 'La fecha del parte no es válida.';
  if (typeof request.odooUrl !== 'string' || !request.odooUrl)
    return 'La tarea no tiene enlace de Odoo.';
  try {
    const url = new URL(request.odooUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      return 'El enlace de Odoo no es válido.';
  } catch {
    return 'El enlace de Odoo no es válido.';
  }
  if (typeof request.descripcion !== 'string' || !request.descripcion.trim())
    return 'Falta la descripción del parte.';
  if ([...request.descripcion].length > MAX_ODOO_DESCRIPTION)
    return `La descripción admite hasta ${MAX_ODOO_DESCRIPTION} caracteres.`;
  if (
    typeof request.minutos !== 'number' ||
    !Number.isSafeInteger(request.minutos) ||
    request.minutos < 1 ||
    request.minutos > MAX_ODOO_MINUTES
  )
    return 'El tiempo debe estar entre 1 minuto y 24 horas.';
  if (request.horasFormato !== formatHoursMinutes(request.minutos))
    return 'El tiempo en HH:MM no coincide con los minutos.';
  if (typeof request.confirmLong !== 'boolean') return 'Falta la confirmación de horas.';
  if (request.origen !== undefined && request.origen !== 'nube' && request.origen !== 'local')
    return 'La solicitud no indica dónde están los partes.';
  if (request.minutos > LONG_ODOO_MINUTES && !request.confirmLong)
    return 'El parte supera las 5 horas y requiere confirmación.';
  if (!Array.isArray(request.partes) || !request.partes.length)
    return 'Selecciona al menos un parte.';
  if (request.partes.length > MAX_ODOO_ENTRIES)
    return `Demasiados partes para imputarlos juntos (máx. ${MAX_ODOO_ENTRIES}).`;
  const ids = new Set<string>();
  for (const part of request.partes) {
    if (!isRecord(part) || !isUuid(part.id) || !isVersion(part.version))
      return 'Algún parte no es válido.';
    if (ids.has(part.id)) return 'Hay partes repetidos.';
    ids.add(part.id);
  }
  return null;
}

export function isOdooRequest(value: unknown): value is OdooRequest {
  return odooRequestProblem(value) === null;
}

/** Copy with only the known fields (drops anything extra a page might add). */
export function cleanOdooRequest(request: OdooRequest): OdooRequest {
  return {
    requestId: request.requestId,
    userId: request.userId,
    taskId: request.taskId,
    taskVersion: request.taskVersion,
    fecha: request.fecha,
    odooUrl: request.odooUrl,
    descripcion: request.descripcion,
    minutos: request.minutos,
    horasFormato: request.horasFormato,
    confirmLong: request.confirmLong,
    partes: request.partes.map((part) => ({ id: part.id, version: part.version })),
    origen: request.origen === 'local' ? 'local' : 'nube',
  };
}

const isEntryRefs = (value: unknown) =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.length <= MAX_ODOO_ENTRIES &&
  value.every((part) => isRecord(part) && isUuid(part.id) && isVersion(part.version));

const isNullableText = (value: unknown, max: number) =>
  value === null || (typeof value === 'string' && value.length <= max);

export function isLocalOperation(value: unknown): value is LocalOperation {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case 'listar':
      return true;
    case 'crear-tarea': {
      const task = value.tarea;
      return (
        isRecord(task) &&
        isUuid(task.proyecto_id) &&
        typeof task.titulo === 'string' &&
        task.titulo.trim().length > 0 &&
        [...task.titulo].length <= 300 &&
        isNullableText(task.odoo_id, 64) &&
        isNullableText(task.odoo_url, 2048)
      );
    }
    case 'crear-proyecto':
      return (
        typeof value.nombre === 'string' &&
        value.nombre.trim().length > 0 &&
        [...value.nombre].length <= 200
      );
    case 'cargar':
      return (
        isUuid(value.taskId) &&
        Array.isArray(value.partIds) &&
        value.partIds.length <= MAX_ODOO_ENTRIES &&
        value.partIds.every(isUuid)
      );
    case 'imputar':
      return isEntryRefs(value.partes);
    default:
      return false;
  }
}

export function isAppMessage(value: unknown): value is AppMessage {
  if (!isRecord(value) || value.source !== APP_SOURCE) return false;
  if (value.type === 'ping') return true;
  if (value.type === 'local-reply')
    return (
      isUuid(value.requestId) && typeof value.ok === 'boolean' && typeof value.error === 'string'
    );
  if (value.type === 'send-odoo') return isOdooRequest(value.request);
  if (value.type === 'queue-action')
    return (
      isUuid(value.requestId) &&
      typeof value.action === 'string' &&
      queueActions.includes(value.action as QueueAction)
    );
  return false;
}

function isQueueSummaryItem(value: unknown): value is QueueSummaryItem {
  return (
    isRecord(value) &&
    isUuid(value.requestId) &&
    isUuid(value.taskId) &&
    Array.isArray(value.entryIds) &&
    value.entryIds.every(isUuid) &&
    typeof value.status === 'string' &&
    queueStatuses.includes(value.status as QueueStatus) &&
    typeof value.error === 'string'
  );
}

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  if (!isRecord(value) || value.source !== EXTENSION_SOURCE) return false;
  switch (value.type) {
    case 'hello':
      return (
        typeof value.version === 'string' &&
        (value.userId === null || isUuid(value.userId)) &&
        (value.odooOrigin === null || typeof value.odooOrigin === 'string')
      );
    case 'queue':
      return Array.isArray(value.items) && value.items.every(isQueueSummaryItem);
    case 'workspace-changed':
      return true;
    case 'local-request':
      return isUuid(value.requestId) && isUuid(value.userId) && isLocalOperation(value.op);
    case 'send-result':
      return (
        isUuid(value.requestId) && typeof value.ok === 'boolean' && typeof value.error === 'string'
      );
    default:
      return false;
  }
}

/** Requests that still hold their entries: they must not be edited, marked or resent. */
export const activeStatuses: readonly QueueStatus[] = [
  'pending',
  'processing',
  'uncertain',
  'sent-unmarked',
];

export function activeQueueItems(items: readonly QueueSummaryItem[]) {
  return items.filter((item) => activeStatuses.includes(item.status));
}

/** Entry and task ids held by active requests. */
export function lockedIds(items: readonly QueueSummaryItem[]) {
  const entries = new Set<string>();
  const tasks = new Set<string>();
  for (const item of activeQueueItems(items)) {
    tasks.add(item.taskId);
    for (const id of item.entryIds) entries.add(id);
  }
  return { entries, tasks };
}

/** Same origin as the configured Odoo instance (the only site the extension automates). */
export function sameOrigin(url: string, origin: string | null): boolean {
  if (!origin) return false;
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}
