import { DateTime } from 'luxon';
import type { WorkspaceData } from '../../domain/models';
import { mondayForDate, todayInZone } from '../../domain/time.ts';
import { backupReminderDays, storageMode } from '../../lib/local/preferences.ts';

export type ProfileDraft = {
  nombre: string;
  workspace: string;
  especialidad: string;
  zonaHoraria: string;
  intervaloRedondeo: number;
  /** Where new projects are created (preferencias.almacenamiento). */
  almacenamiento: 'nube' | 'local';
  /** Days without a backup before the reminder (preferencias.aviso_copia_dias). */
  avisoCopiaDias: number;
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
    almacenamiento: storageMode(data.profile),
    avisoCopiaDias: backupReminderDays(data.profile),
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

/** Days (0 = Monday) worked by default when the weekly hours are spread evenly. */
export const DEFAULT_WORKDAYS = [0, 1, 2, 3, 4];

/**
 * Spreads `total` minutes evenly over `days` (indexes 0–6, Monday first). The
 * remainder goes one minute at a time to the first days, as the database does.
 */
export function distributeWeekly(total: number, days: readonly number[]): number[] {
  const chosen = [...new Set(days)].filter((day) => day >= 0 && day < 7).sort((a, b) => a - b);
  const minutes = [0, 0, 0, 0, 0, 0, 0];
  if (!chosen.length || !Number.isFinite(total) || total <= 0) return minutes;
  const whole = Math.round(total);
  const base = Math.floor(whole / chosen.length);
  const extra = whole % chosen.length;
  chosen.forEach((day, position) => {
    minutes[day] = base + (position < extra ? 1 : 0);
  });
  return minutes;
}

/** Worked days of an allocation; the default working week when nothing is allocated. */
export function workedDays(minutes: readonly number[]) {
  const days = minutes.flatMap((value, index) => (value > 0 ? [index] : []));
  return days.length ? days : DEFAULT_WORKDAYS;
}

/** Whole hours and the remaining minutes of a duration in minutes. */
export function splitHours(total: number) {
  const value = Math.max(0, Math.round(total));
  return { hours: Math.floor(value / 60), minutes: value % 60 };
}

function scheduleMode(minutes: number[]) {
  const preset = ['37.5', '40', '35'].find((mode) =>
    presetMinutes(mode)?.every((value, index) => value === minutes[index]),
  );
  if (preset) return preset;
  const total = minutes.reduce((sum, value) => sum + value, 0);
  const even = distributeWeekly(total, workedDays(minutes));
  return total > 0 && even.every((value, index) => value === minutes[index]) ? 'semanal' : 'manual';
}
