import { DateTime } from 'luxon';
import type { Attendance, TimeEntry } from './models.ts';

export type AttendanceDay = {
  date: string;
  closedSeconds: number;
  provisionalSeconds: number;
  workedSeconds: number;
  imputedSeconds: number;
  imputedPercent: number | null;
};

export function imputedPercent(imputedSeconds: number, workedSeconds: number) {
  return workedSeconds > 0 ? Math.round((imputedSeconds / workedSeconds) * 1000) / 10 : null;
}

/** Uses actual instants and each local midnight, including 23/25-hour DST days. */
export function attendanceDays(
  attendance: readonly Pick<Attendance, 'inicio_en' | 'fin_en' | 'eliminado_en'>[],
  entries: readonly Pick<
    TimeEntry,
    'inicio_en' | 'fin_en' | 'duracion_imputada_segundos' | 'eliminado_en'
  >[],
  dates: readonly string[],
  zone: string,
  now: string,
): AttendanceDay[] {
  const bounds = dates.map((date) => {
    const start = DateTime.fromISO(date, { zone }).startOf('day');
    if (!start.isValid) throw new Error('Fecha o zona horaria inválida.');
    return { start: start.toMillis(), end: start.plus({ days: 1 }).toMillis() };
  });
  const days = dates.map((date) => ({
    date,
    closedSeconds: 0,
    provisionalSeconds: 0,
    workedSeconds: 0,
    imputedSeconds: 0,
    imputedPercent: null as number | null,
  }));
  const nowMs = Date.parse(now);
  for (const record of attendance) {
    if (record.eliminado_en) continue;
    const start = Date.parse(record.inicio_en);
    const end = record.fin_en ? Date.parse(record.fin_en) : nowMs;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    bounds.forEach((bound, index) => {
      const overlap = Math.max(0, Math.min(end, bound.end) - Math.max(start, bound.start)) / 1000;
      const day = days[index]!;
      if (record.fin_en) day.closedSeconds += overlap;
      else day.provisionalSeconds += overlap;
    });
  }
  for (const entry of entries) {
    if (entry.eliminado_en || !entry.fin_en || entry.duracion_imputada_segundos === null) continue;
    const start = Date.parse(entry.inicio_en);
    const end = Date.parse(entry.fin_en);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    // Distribute rounding proportionally; every second is counted once across days.
    bounds.forEach((bound, index) => {
      const overlap = Math.max(0, Math.min(end, bound.end) - Math.max(start, bound.start));
      days[index]!.imputedSeconds += (entry.duracion_imputada_segundos! * overlap) / (end - start);
    });
  }
  return days.map((day) => {
    const workedSeconds = day.closedSeconds + day.provisionalSeconds;
    return {
      ...day,
      workedSeconds,
      imputedPercent: imputedPercent(day.imputedSeconds, workedSeconds),
    };
  });
}

export function attendanceTotal(days: readonly AttendanceDay[]) {
  const total = days.reduce(
    (result, day) => ({
      closedSeconds: result.closedSeconds + day.closedSeconds,
      provisionalSeconds: result.provisionalSeconds + day.provisionalSeconds,
      workedSeconds: result.workedSeconds + day.workedSeconds,
      imputedSeconds: result.imputedSeconds + day.imputedSeconds,
    }),
    { closedSeconds: 0, provisionalSeconds: 0, workedSeconds: 0, imputedSeconds: 0 },
  );
  return { ...total, imputedPercent: imputedPercent(total.imputedSeconds, total.workedSeconds) };
}

export function attendanceInPeriod(
  attendance: readonly Attendance[],
  dates: readonly string[],
  zone: string,
  now: string,
) {
  if (!dates.length) return [];
  const start = DateTime.fromISO(dates[0]!, { zone }).startOf('day').toMillis();
  const end = DateTime.fromISO(dates[dates.length - 1]!, { zone })
    .startOf('day')
    .plus({ days: 1 })
    .toMillis();
  return attendance
    .filter((record) => {
      if (record.eliminado_en) return false;
      const recordStart = Date.parse(record.inicio_en);
      const recordEnd = Date.parse(record.fin_en ?? now);
      return recordStart < end && recordEnd > start;
    })
    .sort((a, b) => Date.parse(b.inicio_en) - Date.parse(a.inicio_en));
}

export function estimateServerTime(serverTime: string, receivedAt: number, clientNow: number) {
  return new Date(Date.parse(serverTime) + Math.max(0, clientNow - receivedAt)).toISOString();
}
