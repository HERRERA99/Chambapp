import { DateTime } from 'luxon';
import type {
  CalendarAbsence,
  Project,
  Task,
  TimeEntry,
  Workday,
  WorkspaceData,
} from '../../domain/models';
import { absencesOn } from '../../domain/calendar.ts';
import { weekDates } from '../../domain/time.ts';
import { attendanceDays } from '../../domain/attendance.ts';

export type WeekBlock = {
  entry: TimeEntry;
  task: Task | undefined;
  project: Project | undefined;
};

export type CalendarDay = {
  date: string;
  name: string;
  isToday: boolean;
  isFuture: boolean;
  jornada: Workday | undefined;
  absences: CalendarAbsence[];
  plannedTargetSeconds: number;
  targetSeconds: number;
  workedSeconds: number;
  provisionalSeconds: number;
  blocks: WeekBlock[];
};

export function buildWeek(
  data: WorkspaceData,
  monday: string,
  today: string,
  now = new Date().toISOString(),
) {
  const dates = weekDates(monday);
  const attendance = attendanceDays(data.fichajes, dates, data.profile.zona_horaria, now);
  const selectedDates = new Set(dates);
  const configuration = data.configurations.reduce<
    (typeof data.configurations)[number] | undefined
  >(
    (latest, current) =>
      current.vigente_desde <= monday && (!latest || current.vigente_desde > latest.vigente_desde)
        ? current
        : latest,
    undefined,
  );
  const targets = new Map(
    data.days
      .filter((day) => day.configuracion_id === configuration?.id)
      .map((day) => [day.dia_semana, day.minutos_objetivo * 60]),
  );
  const jornadas = new Map(
    data.jornadas.filter((day) => selectedDates.has(day.fecha)).map((day) => [day.fecha, day]),
  );
  const tasks = new Map(data.tasks.map((task) => [task.id, task]));
  const projects = new Map(data.projects.map((project) => [project.id, project]));
  const blocks = new Map<string, WeekBlock[]>();
  for (const entry of data.entries) {
    if (!selectedDates.has(entry.fecha)) continue;
    const dayBlocks = blocks.get(entry.fecha) ?? [];
    dayBlocks.push({
      entry,
      task: tasks.get(entry.tarea_id),
      project: projects.get(entry.proyecto_id),
    });
    blocks.set(entry.fecha, dayBlocks);
  }

  const days: CalendarDay[] = dates.map((date, index) => {
    const local = DateTime.fromISO(date, { zone: 'UTC' }).setLocale('es');
    const jornada = jornadas.get(date);
    const absences = absencesOn(data.absences ?? [], date);
    const dayBlocks = (blocks.get(date) ?? []).sort(
      (a, b) => Date.parse(a.entry.inicio_en) - Date.parse(b.entry.inicio_en),
    );
    return {
      date,
      name: local.toFormat('cccc'),
      isToday: date === today,
      isFuture: date > today,
      jornada,
      absences,
      plannedTargetSeconds: absences.length ? 0 : (targets.get(index + 1) ?? 0),
      targetSeconds: absences.length ? 0 : (jornada?.minutos_objetivo ?? 0) * 60,
      workedSeconds: attendance[index]!.workedSeconds,
      provisionalSeconds: attendance[index]!.provisionalSeconds,
      blocks: dayBlocks,
    };
  });
  return {
    days,
    configuration,
    canAdd: data.tasks.some(
      (task) =>
        !task.archivado_en &&
        projects.has(task.proyecto_id) &&
        !projects.get(task.proyecto_id)?.archivado_en,
    ),
    entries: days.flatMap((day) => day.blocks),
    missingDays: days.filter((day) => day.plannedTargetSeconds > 0 && !day.jornada).length,
    targetSeconds: days.reduce((sum, day) => sum + day.targetSeconds, 0),
    workedSeconds: days.reduce((sum, day) => sum + day.workedSeconds, 0),
  };
}
