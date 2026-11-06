import { DateTime } from 'luxon';
import type { Task, TimeEntry } from '../../domain/models';
import { roundDuration, weekDates } from '../../domain/time.ts';
import { isOdooUrl } from '../../domain/odoo.ts';
import {
  formatHoursMinutes,
  LONG_ODOO_MINUTES,
  MAX_ODOO_DESCRIPTION,
  MAX_ODOO_MINUTES,
  odooMinutes,
} from '../extension/protocol.ts';
import type { OdooRequest } from '../extension/protocol.ts';

export type TimesheetItem = {
  entry: TimeEntry;
  title: string;
  odooId: string | null;
  /** Safe Odoo link of the task, if any. */
  odooUrl: string | null;
  range: string;
  /** Real duration of this entry; null while it is still running. */
  realSeconds: number | null;
};

/** Entries logged together: their summed real time is rounded once. */
export type TimesheetImputation = {
  id: string;
  entries: TimeEntry[];
  realSeconds: number;
  intervalMinutes: number;
  loggedSeconds: number;
};

export type TimesheetGroupStatus = 'pending' | 'partial' | 'imputed';

/** All entries of one task on one day (the "parte" of that task and day). */
export type TimesheetGroup = {
  key: string;
  date: string;
  taskId: string;
  title: string;
  odooId: string | null;
  odooUrl: string | null;
  /** Every entry of the group, by start time. */
  entries: TimeEntry[];
  /** Finished entries not yet imputed: the ones that can be selected. */
  pending: TimeEntry[];
  /** Entries still running: not imputable until stopped. */
  running: TimeEntry[];
  imputations: TimesheetImputation[];
  realSeconds: number;
  /** Rounded total of the pending entries taken together. */
  pendingLoggedSeconds: number;
  /** Imputations plus pending entries, each rounded on its own sum. */
  loggedSeconds: number;
  status: TimesheetGroupStatus;
};

export type TimesheetDay = {
  date: string;
  isWeekend: boolean;
  items: TimesheetItem[];
  groups: TimesheetGroup[];
  loggedSeconds: number;
};

/** Maximum entries one imputation request accepts (same bound as the database). */
export const maxImputationEntries = 1000;

/**
 * Real time of the finished entries summed, then rounded once with the largest
 * interval among them (entries keep the interval copied from the profile).
 */
export function groupRounding(entries: readonly TimeEntry[]) {
  // Whole microseconds (the database precision): float sums of fractional seconds can
  // land just above an exact interval boundary and round up a whole extra interval.
  let realMicros = 0;
  let intervalMinutes = 0;
  for (const entry of entries) {
    if (!entry.fin_en || entry.eliminado_en) continue;
    realMicros += Math.round((entry.duracion_real_segundos ?? 0) * 1e6);
    intervalMinutes = Math.max(intervalMinutes, entry.intervalo_redondeo_minutos ?? 0);
  }
  const realSeconds = realMicros / 1e6;
  // Validates the interval like every other rounding in the app.
  roundDuration(realSeconds, intervalMinutes);
  const loggedSeconds =
    intervalMinutes === 0
      ? realSeconds
      : Math.ceil(realMicros / (intervalMinutes * 60e6)) * intervalMinutes * 60;
  return { realSeconds, intervalMinutes, loggedSeconds };
}

/** Keeps only selected ids that are still pending (imputed or deleted ones drop out for good). */
export function reconcileSelection(
  selected: ReadonlySet<string>,
  pending: readonly TimeEntry[],
): ReadonlySet<string> {
  const ids = new Set(pending.map((entry) => entry.id));
  const kept = [...selected].filter((id) => ids.has(id));
  return kept.length === selected.size ? selected : new Set(kept);
}

/** "HH:mm–HH:mm", with "(+N)" when the end falls N calendar days later in the entry's zone. */
export function formatRange(entry: Pick<TimeEntry, 'inicio_en' | 'fin_en' | 'zona_horaria'>) {
  const start = DateTime.fromISO(entry.inicio_en, { zone: entry.zona_horaria });
  if (!entry.fin_en) return `${start.toFormat('HH:mm')}–en curso`;
  const end = DateTime.fromISO(entry.fin_en, { zone: entry.zona_horaria });
  const days = Math.round(
    DateTime.fromISO(end.toISODate()!, { zone: 'UTC' })
      .diff(DateTime.fromISO(start.toISODate()!, { zone: 'UTC' }), 'days')
      .as('days'),
  );
  return `${start.toFormat('HH:mm')}–${end.toFormat('HH:mm')}${days > 0 ? ` (+${days})` : ''}`;
}

function taskInfo(entry: TimeEntry, task: Task | undefined) {
  return {
    title: task && !task.eliminado_en ? task.titulo : 'Tarea no disponible',
    odooId: entry.odoo_id ?? task?.odoo_id ?? null,
    odooUrl: [task?.odoo_url, entry.odoo_url].find(isOdooUrl) ?? null,
  };
}

function buildGroups(entries: readonly TimeEntry[], taskById: Map<string, Task>, date: string) {
  const byTask = new Map<string, TimeEntry[]>();
  for (const entry of entries) {
    const list = byTask.get(entry.tarea_id) ?? [];
    list.push(entry);
    byTask.set(entry.tarea_id, list);
  }
  // Entries arrive sorted by start, so groups are ordered by their first entry.
  return [...byTask.entries()].map(([taskId, list]): TimesheetGroup => {
    const imputationEntries = new Map<string, TimeEntry[]>();
    for (const entry of list) {
      if (!entry.imputacion_odoo_id) continue;
      const items = imputationEntries.get(entry.imputacion_odoo_id) ?? [];
      items.push(entry);
      imputationEntries.set(entry.imputacion_odoo_id, items);
    }
    const imputations = [...imputationEntries.entries()].map(([id, items]) => ({
      id,
      entries: items,
      ...groupRounding(items),
    }));
    const pending = list.filter((entry) => entry.fin_en && !entry.imputacion_odoo_id);
    const running = list.filter((entry) => !entry.fin_en);
    const pendingLoggedSeconds = groupRounding(pending).loggedSeconds;
    const open = pending.length > 0 || running.length > 0;
    return {
      key: `${date}:${taskId}`,
      date,
      taskId,
      ...taskInfo(list[0]!, taskById.get(taskId)),
      entries: list,
      pending,
      running,
      imputations,
      realSeconds: groupRounding(list).realSeconds,
      pendingLoggedSeconds,
      loggedSeconds:
        imputations.reduce((total, item) => total + item.loggedSeconds, 0) + pendingLoggedSeconds,
      status: imputations.length === 0 ? 'pending' : open ? 'partial' : 'imputed',
    };
  });
}

export function buildTimesheetWeek({
  entries,
  tasks,
  monday,
}: {
  entries: readonly TimeEntry[];
  tasks: readonly Task[];
  monday: string;
}) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const days: TimesheetDay[] = weekDates(monday).map((date, index) => {
    const dayEntries = entries
      .filter((entry) => !entry.eliminado_en && entry.fecha === date)
      .sort((a, b) => a.inicio_en.localeCompare(b.inicio_en) || a.id.localeCompare(b.id));
    const items = dayEntries.map((entry): TimesheetItem => ({
      entry,
      ...taskInfo(entry, taskById.get(entry.tarea_id)),
      range: formatRange(entry),
      realSeconds: entry.fin_en ? (entry.duracion_real_segundos ?? 0) : null,
    }));
    const groups = buildGroups(dayEntries, taskById, date);
    return {
      date,
      isWeekend: index >= 5,
      items,
      groups,
      loggedSeconds: groups.reduce((total, group) => total + group.loggedSeconds, 0),
    };
  });
  const visibleDays = days.filter((day) => !day.isWeekend || day.items.length > 0);
  return {
    days: visibleDays,
    loggedSeconds: days.reduce((total, day) => total + day.loggedSeconds, 0),
  };
}

export type ImputationResultEntry = {
  id: string;
  version: number;
  imputacion_odoo_id: string | null;
  imputado_en_odoo: boolean;
};

/**
 * Applies a confirmed imputation result to cached entries, so the page stays
 * correct even if the follow-up refresh fails. Newer cached versions win.
 */
export function applyImputationResult<T extends TimeEntry>(
  entries: readonly T[],
  partes: readonly ImputationResultEntry[],
): T[] {
  const byId = new Map(partes.map((part) => [part.id, part]));
  return entries.map((entry) => {
    const part = byId.get(entry.id);
    return part && entry.version < part.version
      ? {
          ...entry,
          version: part.version,
          imputacion_odoo_id: part.imputacion_odoo_id,
          imputado_en_odoo: part.imputado_en_odoo,
        }
      : entry;
  });
}

/** Entries that would go to Odoo, in send order (finished, pending, not deleted). */
function sendableParts(entries: readonly TimeEntry[]) {
  return [...entries]
    .filter((entry) => entry.fin_en && !entry.eliminado_en && !entry.imputacion_odoo_id)
    .sort((a, b) => a.inicio_en.localeCompare(b.inicio_en) || a.id.localeCompare(b.id));
}

/** Distinct, non-empty descriptions of the entries to send, in send order. */
export function odooDescriptionChoices(entries: readonly TimeEntry[]): string[] {
  const descriptions: string[] = [];
  for (const entry of sendableParts(entries)) {
    const text = entry.descripcion?.trim();
    if (text && !descriptions.includes(text)) descriptions.push(text);
  }
  return descriptions;
}

/**
 * Odoo line for some finished entries of one group: their summed real time is
 * rounded once (like "Marcar") and then up to whole minutes, which is all
 * Odoo's HH:MM field accepts. Returns the problem when it cannot be sent.
 */
export function buildOdooRequest({
  group,
  entries,
  task,
  userId,
  requestId,
  confirmLong = false,
  descripcion: chosen,
}: {
  group: Pick<TimesheetGroup, 'date' | 'taskId' | 'title' | 'odooUrl'>;
  entries: readonly TimeEntry[];
  task: Pick<Task, 'id' | 'version' | 'titulo' | 'odoo_url'> | undefined;
  userId: string;
  requestId: string;
  confirmLong?: boolean;
  /** Description picked by the user; without it the entries' descriptions are joined. */
  descripcion?: string;
}): { request: OdooRequest } | { problem: string } {
  if (!task || task.id !== group.taskId) return { problem: 'La tarea ya no está disponible.' };
  const odooUrl = [task.odoo_url, group.odooUrl].find(isOdooUrl);
  if (!odooUrl) return { problem: 'La tarea no tiene un enlace de Odoo válido.' };
  const parts = sendableParts(entries);
  if (!parts.length) return { problem: 'No hay partes terminados pendientes.' };
  if (parts.length !== entries.length)
    return { problem: 'Solo se pueden enviar partes terminados y pendientes.' };
  if (parts.length > maxImputationEntries)
    return { problem: `Demasiados partes para imputarlos juntos (máx. ${maxImputationEntries}).` };
  const minutos = odooMinutes(groupRounding(parts).loggedSeconds);
  if (minutos < 1) return { problem: 'El tiempo a imputar es 0.' };
  if (minutos > MAX_ODOO_MINUTES)
    return { problem: 'Odoo no admite más de 24 horas en una línea.' };
  const source =
    chosen === undefined
      ? odooDescriptionChoices(parts).join(' · ') || task.titulo.trim() || group.title
      : chosen.trim();
  const descripcion = Array.from(source).slice(0, MAX_ODOO_DESCRIPTION).join('').trim();
  if (!descripcion) return { problem: 'Escribe una descripción para el parte.' };
  return {
    request: {
      requestId,
      userId,
      taskId: task.id,
      taskVersion: task.version,
      fecha: group.date,
      odooUrl,
      descripcion,
      minutos,
      horasFormato: formatHoursMinutes(minutos),
      confirmLong: confirmLong && minutos > LONG_ODOO_MINUTES,
      partes: parts.map((entry) => ({ id: entry.id, version: entry.version })),
    },
  };
}
