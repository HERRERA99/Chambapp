// What happened on one day, shown next to the time-entry forms (Plan 12): the
// attendance (entrada/salida) and the entries of that day, plus the interval being
// edited and whether it overlaps another entry. Pure: no React, no network.
import { DateTime } from 'luxon';
import type { Attendance, Project, Task, TimeEntry } from './models.ts';

export type DayInterval = {
  id: string;
  start: string;
  /** null while running. */
  end: string | null;
  /** HH:mm in the day's zone; with the day when it is not the shown day. */
  startLabel: string;
  endLabel: string | null;
  seconds: number;
  running: boolean;
};

export type DayEntry = DayInterval & {
  taskId: string;
  task: string;
  project: string;
  description: string | null;
  /** Overlaps the interval being edited. */
  overlapsDraft: boolean;
};

export type DayContext = {
  date: string;
  zone: string;
  attendance: DayInterval[];
  /** Seconds of attendance inside this day (a running one counts until now). */
  attendanceSeconds: number;
  firstIn: string | null;
  lastOut: string | null;
  entries: DayEntry[];
  /** Seconds of entries inside this day (a running one counts until now). */
  entrySeconds: number;
  draft: {
    start: string;
    startLabel: string;
    endLabel: string | null;
    seconds: number | null;
  } | null;
  overlaps: DayEntry[];
};

type Data = {
  entries: readonly TimeEntry[];
  fichajes: readonly Attendance[];
  tasks: readonly Pick<Task, 'id' | 'titulo' | 'proyecto_id'>[];
  projects: readonly Pick<Project, 'id' | 'nombre'>[];
};

export type DayContextOptions = {
  /** The entry being edited: shown as the draft, not as another entry. */
  excludeEntryId?: string | null;
  /** Interval in the form (ISO instants); end null = open (a timer to start). */
  draft?: { start: string | null; end: string | null } | null;
  /** Current instant (ISO), for running intervals. */
  now: string;
};

const millis = (iso: string) => DateTime.fromISO(iso).toMillis();

function label(iso: string, zone: string, date: string) {
  const value = DateTime.fromISO(iso, { zone });
  const day = value.toISODate();
  const time = value.toFormat('HH:mm');
  if (day === date) return time;
  return `${time} (${value.setLocale('es').toFormat('d LLL')})`;
}

/** Seconds of [start, end) inside [from, to). */
function inside(start: number, end: number, from: number, to: number) {
  return Math.max(0, (Math.min(end, to) - Math.max(start, from)) / 1000);
}

export function dayContext(
  data: Data,
  date: string,
  zone: string,
  options: DayContextOptions,
): DayContext {
  const dayStart = DateTime.fromISO(date, { zone }).startOf('day');
  if (!dayStart.isValid) throw new Error('Fecha o zona horaria inválida.');
  const from = dayStart.toMillis();
  // Next local midnight: 23 or 25 hours on DST days.
  const to = dayStart.plus({ days: 1 }).toMillis();
  const now = millis(options.now);

  const interval = (row: { id: string; inicio_en: string; fin_en: string | null }): DayInterval => {
    const start = millis(row.inicio_en);
    const end = row.fin_en ? millis(row.fin_en) : Math.max(start, now);
    return {
      id: row.id,
      start: row.inicio_en,
      end: row.fin_en,
      startLabel: label(row.inicio_en, zone, date),
      endLabel: row.fin_en ? label(row.fin_en, zone, date) : null,
      seconds: inside(start, end, from, to),
      running: row.fin_en === null,
    };
  };
  const touches = (row: { inicio_en: string; fin_en: string | null }) => {
    const start = millis(row.inicio_en);
    const end = row.fin_en ? millis(row.fin_en) : Math.max(start, now);
    return start < to && (end > from || (end === start && start >= from));
  };
  const byStart = (a: { start: string }, b: { start: string }) => millis(a.start) - millis(b.start);

  const attendance = data.fichajes
    .filter((row) => !row.eliminado_en && touches(row))
    .map(interval)
    .sort(byStart);

  const draftStart = options.draft?.start ? millis(options.draft.start) : null;
  const draftEnd = options.draft?.end ? millis(options.draft.end) : null;
  const draftValid =
    draftStart !== null &&
    Number.isFinite(draftStart) &&
    (draftEnd === null || draftEnd > draftStart);
  const tasks = new Map(data.tasks.map((task) => [task.id, task]));
  const projects = new Map(data.projects.map((project) => [project.id, project]));
  const live = data.entries
    .filter((row) => !row.eliminado_en && row.id !== options.excludeEntryId)
    .map((row): DayEntry => {
      const base = interval(row);
      const task = tasks.get(row.tarea_id);
      const start = millis(row.inicio_en);
      const end = row.fin_en ? millis(row.fin_en) : Math.max(start, now);
      // An open draft (a timer to start) overlaps anything still running after it starts.
      const overlapsDraft =
        draftValid &&
        start < (draftEnd ?? Number.POSITIVE_INFINITY) &&
        (row.fin_en === null || end > draftStart!);
      return {
        ...base,
        taskId: row.tarea_id,
        task: task?.titulo ?? 'Tarea no disponible',
        project: (task && projects.get(task.proyecto_id)?.nombre) ?? '',
        description: row.descripcion ?? null,
        overlapsDraft,
      };
    })
    .sort(byStart);
  const entries = live.filter((entry) => touches({ inicio_en: entry.start, fin_en: entry.end }));

  const closedOut = attendance.filter((row) => row.end !== null);
  return {
    date,
    zone,
    attendance,
    attendanceSeconds: attendance.reduce((total, row) => total + row.seconds, 0),
    firstIn: attendance[0]?.startLabel ?? null,
    lastOut:
      attendance.length && !attendance.at(-1)!.running
        ? (closedOut.at(-1)?.endLabel ?? null)
        : null,
    entries,
    entrySeconds: entries.reduce((total, row) => total + row.seconds, 0),
    draft: draftValid
      ? {
          start: options.draft!.start!,
          startLabel: label(options.draft!.start!, zone, date),
          endLabel: options.draft!.end ? label(options.draft!.end, zone, date) : null,
          seconds: draftEnd !== null ? (draftEnd - draftStart!) / 1000 : null,
        }
      : null,
    // Every live entry the draft overlaps, also on other days (a draft can cross midnight).
    overlaps: live.filter((entry) => entry.overlapsDraft),
  };
}
