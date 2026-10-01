import { DateTime } from 'luxon';
import type { Project, Task, TimeEntry, Workday, WorkspaceData } from '../../domain/models';
import { formatDuration, weekDates } from '../../domain/time';

export type WeekBlock = {
  entry: TimeEntry;
  task: Task | undefined;
  project: Project | undefined;
};

export type CalendarDay = {
  date: string;
  name: string;
  label: string;
  dayNumber: string;
  isToday: boolean;
  isFuture: boolean;
  jornada: Workday | undefined;
  plannedTargetSeconds: number;
  targetSeconds: number;
  realSeconds: number;
  loggedSeconds: number;
  blocks: WeekBlock[];
};

export function describeBalance(seconds: number) {
  if (seconds === 0) return 'Objetivo cumplido';
  return `${formatDuration(Math.abs(seconds))} ${seconds > 0 ? 'a favor' : 'pendientes'}`;
}

export function buildWeek(data: WorkspaceData, monday: string, today: string) {
  const dates = weekDates(monday);
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
    const dayBlocks = (blocks.get(date) ?? []).sort(
      (a, b) => Date.parse(a.entry.inicio_en) - Date.parse(b.entry.inicio_en),
    );
    const completed = dayBlocks.filter((block) => block.entry.fin_en !== null);
    return {
      date,
      name: local.toFormat('cccc'),
      label: local.toFormat('ccc dd'),
      dayNumber: local.toFormat('dd'),
      isToday: date === today,
      isFuture: date > today,
      jornada,
      plannedTargetSeconds: targets.get(index + 1) ?? 0,
      targetSeconds: (jornada?.minutos_objetivo ?? 0) * 60,
      realSeconds: completed.reduce(
        (sum, block) => sum + (block.entry.duracion_real_segundos ?? 0),
        0,
      ),
      loggedSeconds: completed.reduce(
        (sum, block) => sum + (block.entry.duracion_imputada_segundos ?? 0),
        0,
      ),
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
    realSeconds: days.reduce((sum, day) => sum + day.realSeconds, 0),
    loggedSeconds: days.reduce((sum, day) => sum + day.loggedSeconds, 0),
    completedDays: days.filter(
      (day) => day.jornada && day.targetSeconds > 0 && day.loggedSeconds >= day.targetSeconds,
    ).length,
    workdays: days.filter((day) => day.targetSeconds > 0).length,
  };
}
