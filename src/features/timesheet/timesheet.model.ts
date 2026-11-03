import { DateTime } from 'luxon';
import type { Task, TimeEntry } from '../../domain/models';
import { weekDates } from '../../domain/time.ts';

export type TimesheetItem = {
  entry: TimeEntry;
  title: string;
  odooId: string | null;
  range: string;
  /** Rounded duration to log in Odoo; null while the entry is still running. */
  loggedSeconds: number | null;
};

export type TimesheetDay = {
  date: string;
  isWeekend: boolean;
  items: TimesheetItem[];
  loggedSeconds: number;
};

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
    const items = entries
      .filter((entry) => !entry.eliminado_en && entry.fecha === date)
      .sort((a, b) => a.inicio_en.localeCompare(b.inicio_en))
      .map((entry): TimesheetItem => {
        const task = taskById.get(entry.tarea_id);
        return {
          entry,
          title: task && !task.eliminado_en ? task.titulo : 'Tarea no disponible',
          odooId: entry.odoo_id ?? task?.odoo_id ?? null,
          range: formatRange(entry),
          loggedSeconds: entry.fin_en ? (entry.duracion_imputada_segundos ?? 0) : null,
        };
      });
    return {
      date,
      isWeekend: index >= 5,
      items,
      loggedSeconds: items.reduce((total, item) => total + (item.loggedSeconds ?? 0), 0),
    };
  });
  const visibleDays = days.filter((day) => !day.isWeekend || day.items.length > 0);
  return {
    days: visibleDays,
    loggedSeconds: days.reduce((total, day) => total + day.loggedSeconds, 0),
  };
}
