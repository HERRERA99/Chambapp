import { DateTime } from 'luxon';
import type { Attendance } from './models.ts';

export type AttendanceDay = {
  date: string;
  closedSeconds: number;
  provisionalSeconds: number;
  workedSeconds: number;
};

/** Uses actual instants and each local midnight, including 23/25-hour DST days. */
export function attendanceDays(
  attendance: readonly Pick<Attendance, 'inicio_en' | 'fin_en' | 'eliminado_en'>[],
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
  return days.map((day) => ({
    ...day,
    workedSeconds: day.closedSeconds + day.provisionalSeconds,
  }));
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
