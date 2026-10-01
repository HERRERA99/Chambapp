import { DateTime } from 'luxon';
import type { WorkspaceData } from '../../domain/models';
import { mondayForDate, todayInZone } from '../../domain/time.ts';

export type ProfileDraft = {
  nombre: string;
  workspace: string;
  especialidad: string;
  zonaHoraria: string;
  intervaloRedondeo: number;
};

export type ScheduleDraft = {
  mode: string;
  effectiveDate: string;
  minutes: number[];
};

export const weekdays = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;

export function profileDraft(data: WorkspaceData): ProfileDraft {
  return {
    nombre: data.profile.nombre,
    workspace:
      typeof data.profile.preferencias.workspace === 'string'
        ? data.profile.preferencias.workspace
        : 'Mi Workspace',
    especialidad:
      typeof data.profile.preferencias.especialidad === 'string'
        ? data.profile.preferencias.especialidad
        : '',
    zonaHoraria: data.profile.zona_horaria,
    intervaloRedondeo: data.profile.intervalo_redondeo_minutos,
  };
}

export function nextMonday(monday: string) {
  return DateTime.fromISO(monday, { zone: 'UTC' }).plus({ days: 7 }).toISODate()!;
}

export function minimumScheduleMonday(
  data: WorkspaceData,
  today = todayInZone(data.profile.zona_horaria),
) {
  const monday = mondayForDate(today);
  const lastDay = DateTime.fromISO(monday, { zone: 'UTC' }).plus({ days: 6 }).toISODate()!;
  const currentWeekHasHistory = data.jornadas.some(
    (day) => day.fecha >= monday && day.fecha <= lastDay,
  );
  const currentMondayExists = data.configurations.some(
    (configuration) => configuration.vigente_desde === monday,
  );
  return currentWeekHasHistory || currentMondayExists ? nextMonday(monday) : monday;
}

export function initialSchedule(
  data: WorkspaceData,
  today = todayInZone(data.profile.zona_horaria),
): ScheduleDraft {
  const current = data.configurations
    .filter((configuration) => configuration.vigente_desde <= today)
    .sort((a, b) => b.vigente_desde.localeCompare(a.vigente_desde))[0];
  const minutes = current
    ? weekdays.map(
        (_, index) =>
          data.days.find(
            (day) => day.configuracion_id === current.id && day.dia_semana === index + 1,
          )?.minutos_objetivo ?? 0,
      )
    : [480, 480, 480, 480, 330, 0, 0];
  let effectiveDate = minimumScheduleMonday(data, today);
  while (data.configurations.some((configuration) => configuration.vigente_desde === effectiveDate))
    effectiveDate = nextMonday(effectiveDate);
  return { mode: scheduleMode(minutes), effectiveDate, minutes };
}

export function presetMinutes(mode: string) {
  if (mode === '37.5') return [480, 480, 480, 480, 330, 0, 0];
  if (mode === '40') return [480, 480, 480, 480, 480, 0, 0];
  if (mode === '35') return [420, 420, 420, 420, 420, 0, 0];
  return null;
}

function scheduleMode(minutes: number[]) {
  return (
    ['37.5', '40', '35'].find((mode) =>
      presetMinutes(mode)?.every((value, index) => value === minutes[index]),
    ) ?? 'manual'
  );
}
