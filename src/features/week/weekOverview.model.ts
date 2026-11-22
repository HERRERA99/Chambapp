import { DateTime } from 'luxon';
import { attendanceInPeriod } from '../../domain/attendance.ts';
import { readImputationThresholds } from '../../domain/imputationThresholds.ts';
import type { ImputationThresholds } from '../../domain/imputationThresholds.ts';
import type { WorkspaceData } from '../../domain/models';
import { buildTimesheetWeek } from '../timesheet/timesheet.model.ts';
import { buildWeek } from './week.model.ts';

function imputationTone(
  percent: number | null,
  thresholds: ImputationThresholds,
): 'success' | 'warning' | 'danger' | null {
  if (percent === null) return null;
  if (percent < thresholds.ambarDesde || percent > thresholds.maximo) return 'danger';
  return percent < thresholds.verdeDesde ? 'warning' : 'success';
}

function distribution(
  imputedSeconds: number,
  workedSeconds: number,
  thresholds: ImputationThresholds,
) {
  const imputedPercent = workedSeconds > 0 ? (imputedSeconds * 100) / workedSeconds : null;
  return {
    imputedSeconds,
    workedSeconds,
    imputedPercent,
    tone: imputationTone(imputedPercent, thresholds),
  };
}

export function buildWeekOverview(data: WorkspaceData, monday: string, today: string, now: string) {
  const week = buildWeek(data, monday, today, now);
  const timesheet = buildTimesheetWeek({ entries: data.entries, tasks: data.tasks, monday });
  const timesheetByDate = new Map(timesheet.days.map((day) => [day.date, day]));
  const zone = data.profile.zona_horaria;
  const nowMs = Date.parse(now);
  const thresholds = readImputationThresholds(data.profile.preferencias);
  const days = week.days.flatMap((day, index) => {
    const midnight = DateTime.fromISO(day.date, { zone }).startOf('day');
    const start = midnight.toMillis();
    const end = midnight.plus({ days: 1 }).toMillis();
    const records = attendanceInPeriod(data.fichajes, [day.date], zone, now);
    // A just-opened record may have no elapsed time yet.
    const justOpened = data.fichajes.find(
      (record) =>
        !record.eliminado_en &&
        !record.fin_en &&
        Date.parse(record.inicio_en) === nowMs &&
        nowMs >= start &&
        nowMs < end,
    );
    if (justOpened) records.unshift(justOpened);
    const attendance = records
      .map((record) => {
        const from = Math.max(Date.parse(record.inicio_en), start);
        const to = Math.min(Date.parse(record.fin_en ?? now), end);
        return {
          id: record.id,
          start: new Date(from).toISOString(),
          end: record.fin_en || to === end ? new Date(to).toISOString() : null,
          seconds: Math.max(0, to - from) / 1000,
          provisional: !record.fin_en,
        };
      })
      // In the order they happened (the period query returns the latest first).
      .sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
    const sheetDay = timesheetByDate.get(day.date);
    const count = sheetDay?.items.length ?? 0;
    if (index >= 5 && !attendance.length && !count) return [];
    const sent = sheetDay?.items.filter(({ entry }) => entry.imputado_en_odoo).length ?? 0;
    const imputedSeconds = sheetDay?.loggedSeconds ?? 0;
    return [
      {
        date: day.date,
        name: day.name[0]!.toLocaleUpperCase('es') + day.name.slice(1),
        isToday: day.isToday,
        attendance,
        sheetDay,
        hasData: attendance.length > 0 || count > 0,
        provisional: attendance.some((record) => record.provisional),
        provisionalSeconds: day.provisionalSeconds,
        ...distribution(imputedSeconds, day.workedSeconds, thresholds),
        odoo: !count ? '—' : !sent ? 'Sin enviar' : sent === count ? 'Enviado' : 'Parcial',
      },
    ];
  });
  return {
    entries: week.entries,
    canAdd: week.canAdd,
    missingDays: week.missingDays,
    targetSeconds: week.targetSeconds,
    reportDays: week.days,
    timesheetDays: timesheet.days,
    days,
    total: distribution(timesheet.loggedSeconds, week.workedSeconds, thresholds),
  };
}
