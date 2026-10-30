import { DateTime } from 'luxon';
import type { Project, Task, TimeEntry, WorkspaceData } from '../../domain/models';
import { attendanceDays } from '../../domain/attendance.ts';

export type TodayMetrics = {
  /** Closed attendance plus the open session up to `now`, split at local midnight. */
  workedSeconds: number;
  provisionalSeconds: number;
  /** Imputed (rounded) duration of finalized entries, split proportionally at midnight. */
  imputedSeconds: number;
  /** imputed ÷ worked × 100; null without attendance. May exceed 100 because of rounding. */
  imputedPercent: number | null;
  finishedEntries: number;
  /** Manual "Imputado en Odoo" marks: independent from the imputed duration. */
  odooMarked: number;
};

function dayBounds(date: string, zone: string) {
  const start = DateTime.fromISO(date, { zone }).startOf('day');
  return { start: start.toMillis(), end: start.plus({ days: 1 }).toMillis() };
}

/** Entries that overlap the local day, including an entry still running at `now`. */
export function entriesForDay(
  entries: readonly TimeEntry[],
  date: string,
  zone: string,
  now: string,
) {
  const bounds = dayBounds(date, zone);
  const nowMs = Date.parse(now);
  return entries
    .filter((entry) => {
      if (entry.eliminado_en) return false;
      const start = Date.parse(entry.inicio_en);
      const end = entry.fin_en ? Date.parse(entry.fin_en) : nowMs;
      return start < bounds.end && Math.max(end, start + 1) > bounds.start;
    })
    .sort((a, b) => Date.parse(b.inicio_en) - Date.parse(a.inicio_en));
}

export function todayMetrics(data: WorkspaceData, today: string, now: string): TodayMetrics {
  const zone = data.profile.zona_horaria;
  const [day] = attendanceDays(data.fichajes, data.entries, [today], zone, now);
  const entries = entriesForDay(data.entries, today, zone, now).filter((entry) => entry.fin_en);
  return {
    workedSeconds: day!.workedSeconds,
    provisionalSeconds: day!.provisionalSeconds,
    imputedSeconds: day!.imputedSeconds,
    imputedPercent: day!.imputedPercent,
    finishedEntries: entries.length,
    odooMarked: entries.filter((entry) => entry.imputado_en_odoo).length,
  };
}

export type RelevantReason = 'active' | 'paused' | 'recent' | 'in_progress' | 'pending';

export type RelevantTask = {
  task: Task;
  project: Project | undefined;
  reason: RelevantReason;
  lastWorkedAt: string | null;
};

/**
 * Tasks to start or resume, using only existing data: the running or paused task,
 * then the most recently worked tasks, then tasks marked "en curso", then pending
 * tasks by last update. There is no invented priority.
 */
export function relevantTasks(
  data: WorkspaceData,
  {
    activeTaskId = null,
    pausedTaskId = null,
    limit = 5,
  }: { activeTaskId?: string | null; pausedTaskId?: string | null; limit?: number } = {},
): RelevantTask[] {
  const projects = new Map(data.projects.map((project) => [project.id, project]));
  const lastWorked = new Map<string, string>();
  for (const entry of data.entries) {
    if (entry.eliminado_en) continue;
    const at = entry.fin_en ?? entry.inicio_en;
    const previous = lastWorked.get(entry.tarea_id);
    if (!previous || Date.parse(at) > Date.parse(previous)) lastWorked.set(entry.tarea_id, at);
  }
  const available = data.tasks.filter((task) => {
    const project = projects.get(task.proyecto_id);
    return (
      !task.eliminado_en &&
      !task.archivado_en &&
      task.estado !== 'completada' &&
      !!project &&
      !project.archivado_en &&
      !project.eliminado_en
    );
  });
  const rank: Record<RelevantReason, number> = {
    active: 0,
    paused: 1,
    recent: 2,
    in_progress: 3,
    pending: 4,
  };
  return available
    .map((task): RelevantTask => {
      const at = lastWorked.get(task.id) ?? null;
      const reason: RelevantReason =
        task.id === activeTaskId
          ? 'active'
          : task.id === pausedTaskId
            ? 'paused'
            : at
              ? 'recent'
              : task.estado === 'en_curso'
                ? 'in_progress'
                : 'pending';
      return { task, project: projects.get(task.proyecto_id), reason, lastWorkedAt: at };
    })
    .sort(
      (a, b) =>
        rank[a.reason] - rank[b.reason] ||
        Date.parse(b.lastWorkedAt ?? b.task.actualizado_en) -
          Date.parse(a.lastWorkedAt ?? a.task.actualizado_en) ||
        a.task.titulo.localeCompare(b.task.titulo, 'es'),
    )
    .slice(0, limit);
}
