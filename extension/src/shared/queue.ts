import { groupRounding } from '../../../src/features/timesheet/timesheet.model.ts';
import { activeStatuses, odooMinutes } from '../../../src/features/extension/protocol.ts';
import type {
  OdooRequest,
  QueueAction,
  QueueStatus,
  QueueSummaryItem,
} from '../../../src/features/extension/protocol.ts';
import type { TimeEntry } from '../../../src/domain/models.ts';

/**
 * Progress of one attempt, persisted before acting on it. Everything from
 * `may-have-written` on may have reached Odoo's server.
 */
export type QueuePhase =
  | 'idle'
  | 'opening'
  | 'counting'
  | 'filling'
  | 'may-have-written'
  | 'form-saved'
  | 'reloading'
  | 'verifying'
  | 'done';

const writtenPhases: readonly QueuePhase[] = [
  'may-have-written',
  'form-saved',
  'reloading',
  'verifying',
  'done',
];

export type QueueItem = {
  id: string;
  request: OdooRequest;
  /** Account key (shared/backend.ts) of the session that queued it; absent before Plan 12. */
  account?: string;
  status: QueueStatus;
  phase: QueuePhase;
  error: string;
  attempts: number;
  attemptId: string | null;
  tabId: number | null;
  windowId: number | null;
  /** Matching Odoo lines counted before writing. */
  before: number | null;
  /** Token of the marking in progress ("Sí se creó"); blocks every other action meanwhile. */
  marking?: string | null;
  createdAt: number;
  updatedAt: number;
};

export const SUCCESS_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export const mayHaveWritten = (phase: QueuePhase) => writtenPhases.includes(phase);

export function newQueueItem(request: OdooRequest, now: number): QueueItem {
  return {
    id: request.requestId,
    request,
    status: 'pending',
    phase: 'idle',
    error: '',
    attempts: 0,
    attemptId: null,
    tabId: null,
    windowId: null,
    before: null,
    createdAt: now,
    updatedAt: now,
  };
}

const ids = (request: OdooRequest) => request.partes.map((part) => part.id);

/**
 * Where a new request goes. Active requests sharing any entry win (the entry is
 * never sent twice). A finished one blocks only an identical resend: same entry
 * versions, i.e. nothing changed since (a double click). Old errors sharing
 * entries are replaced by the new request.
 */
export function enqueueDecision(
  queue: readonly QueueItem[],
  request: OdooRequest,
  now: number,
): { kind: 'existing'; item: QueueItem } | { kind: 'new'; item: QueueItem; replaced: string[] } {
  const same = queue.find((item) => item.id === request.requestId);
  if (same) return { kind: 'existing', item: same };
  const wanted = new Map(request.partes.map((part) => [part.id, part.version]));
  for (const item of queue) {
    const shared = item.request.partes.filter((part) => wanted.has(part.id));
    if (!shared.length) continue;
    if (activeStatuses.includes(item.status)) return { kind: 'existing', item };
    if (item.status === 'success' && shared.some((part) => wanted.get(part.id) === part.version))
      return { kind: 'existing', item };
  }
  const replaced = queue
    .filter(
      (item) => item.status === 'error' && item.request.partes.some((part) => wanted.has(part.id)),
    )
    .map((item) => item.id);
  return { kind: 'new', item: newQueueItem(request, now), replaced };
}

/**
 * Status after an unexpected failure: nothing written → error (safe to retry);
 * verified in Odoo → sent-unmarked; anything in between → uncertain.
 */
export function failureStatus(phase: QueuePhase): 'error' | 'uncertain' | 'sent-unmarked' {
  if (phase === 'done') return 'sent-unmarked';
  return mayHaveWritten(phase) ? 'uncertain' : 'error';
}

/** Status after an attempt stopped without a verified result. */
export function interruptedStatus(phase: QueuePhase): 'error' | 'uncertain' {
  return mayHaveWritten(phase) ? 'uncertain' : 'error';
}

/** Only exactly one new matching line proves the save. */
export function verificationStatus(before: number | null, after: number | null) {
  return before !== null && after !== null && after === before + 1 ? 'success' : 'uncertain';
}

export type EntryRow = Pick<
  TimeEntry,
  | 'id'
  | 'usuario_id'
  | 'version'
  | 'tarea_id'
  | 'fecha'
  | 'fin_en'
  | 'eliminado_en'
  | 'imputacion_odoo_id'
  | 'duracion_real_segundos'
  | 'intervalo_redondeo_minutos'
>;

export type TaskRow = {
  id: string;
  usuario_id: string;
  proyecto_id: string;
  version: number;
  odoo_url: string | null;
  eliminado_en: string | null;
};

export type ProjectRow = { id: string; eliminado_en: string | null };

/** Problem that makes the request stale (checked again right before touching Odoo). */
export function revalidationProblem(
  request: OdooRequest,
  rows: readonly EntryRow[],
  task: TaskRow | null,
  project: ProjectRow | null,
): string | null {
  const stale = 'Los partes han cambiado desde que pulsaste Enviar; vuelve a enviarlos.';
  if (
    !task ||
    task.id !== request.taskId ||
    task.usuario_id !== request.userId ||
    task.eliminado_en
  )
    return 'La tarea ya no está disponible.';
  if (task.version !== request.taskVersion || task.odoo_url !== request.odooUrl)
    return 'La tarea ha cambiado desde que pulsaste Enviar; vuelve a enviarlos.';
  if (!project || project.id !== task.proyecto_id || project.eliminado_en)
    return 'El proyecto de la tarea ya no está disponible.';
  const byId = new Map(rows.map((row) => [row.id, row]));
  const entries: EntryRow[] = [];
  for (const part of request.partes) {
    const row = byId.get(part.id);
    if (
      !row ||
      row.usuario_id !== request.userId ||
      row.eliminado_en ||
      row.version !== part.version ||
      !row.fin_en ||
      row.imputacion_odoo_id ||
      row.tarea_id !== request.taskId ||
      row.fecha !== request.fecha
    )
      return stale;
    entries.push(row);
  }
  const minutes = odooMinutes(groupRounding(entries as TimeEntry[]).loggedSeconds);
  return minutes === request.minutos ? null : stale;
}

/** Still-unchanged task right before marking the entries as imputed. */
export function taskChangedProblem(
  request: OdooRequest,
  task: TaskRow | null,
  project: ProjectRow | null,
) {
  if (
    !task ||
    task.eliminado_en ||
    task.version !== request.taskVersion ||
    task.odoo_url !== request.odooUrl ||
    !project ||
    project.eliminado_en
  )
    return 'La tarea cambió durante el envío: revisa a qué tarea de Odoo se imputó antes de marcar.';
  return null;
}

export function purgeQueue(queue: readonly QueueItem[], now: number): QueueItem[] {
  return queue.filter(
    (item) => item.status !== 'success' || now - item.updatedAt < SUCCESS_RETENTION_MS,
  );
}

export function summarizeQueue(queue: readonly QueueItem[], userId: string | null) {
  return queue
    .filter((item) => item.request.userId === userId)
    .map((item): QueueSummaryItem => ({
      requestId: item.id,
      taskId: item.request.taskId,
      entryIds: ids(item.request),
      status: item.status,
      error: item.error,
    }));
}

/**
 * Change requested by the user. `confirm-created` claims the item with
 * `token` and returns `mark` (the caller marks the entries and finishes only
 * if it still holds the claim); a claimed item accepts no other action.
 */
export function applyQueueAction(
  item: QueueItem,
  action: QueueAction,
  now: number,
  token = '',
):
  | { kind: 'update'; item: QueueItem }
  | { kind: 'remove' }
  | { kind: 'mark'; item: QueueItem }
  | { kind: 'invalid' } {
  if (item.marking) return { kind: 'invalid' };
  const reset = {
    phase: 'idle' as const,
    attemptId: null,
    tabId: null,
    windowId: null,
    before: null,
  };
  switch (action) {
    case 'retry':
      return item.status === 'error'
        ? {
            kind: 'update',
            item: { ...item, ...reset, status: 'pending', error: '', updatedAt: now },
          }
        : { kind: 'invalid' };
    case 'confirm-not-created':
      return item.status === 'uncertain'
        ? {
            kind: 'update',
            item: { ...item, ...reset, status: 'pending', error: '', updatedAt: now },
          }
        : { kind: 'invalid' };
    case 'confirm-created':
      return item.status === 'uncertain' && token
        ? { kind: 'mark', item: { ...item, marking: token, updatedAt: now } }
        : { kind: 'invalid' };
    case 'discard':
      return ['pending', 'error', 'sent-unmarked', 'success'].includes(item.status)
        ? { kind: 'remove' }
        : { kind: 'invalid' };
  }
}
