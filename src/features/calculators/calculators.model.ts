import { DateTime } from 'luxon';
import { attendanceDays } from '../../domain/attendance.ts';
import type { Attendance } from '../../domain/models.ts';

const minutesPerDay = 24 * 60;

/** Empty and incomplete fields must stay invalid instead of silently becoming zero. */
export function parseDurationMinutes(hours: string, minutes: string): number | null {
  const hourText = hours.trim();
  const minuteText = minutes.trim();
  if (!/^\d+$/.test(hourText) || !/^\d+$/.test(minuteText)) return null;
  const hourValue = Number(hourText);
  const minuteValue = Number(minuteText);
  if (hourValue > 9999 || minuteValue > 59) return null;
  return hourValue * 60 + minuteValue;
}

export function parsePercentage(value: string): number | null {
  const text = value.trim();
  if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return null;
  const percentage = Number(text.replace(',', '.'));
  return Number.isFinite(percentage) && percentage <= 100 ? percentage : null;
}

/** Apply the percentage to exact seconds, then round only the final minute result. */
export function percentageMinutes(baseSeconds: number, percentage: number): number {
  if (
    !Number.isFinite(baseSeconds) ||
    baseSeconds < 0 ||
    baseSeconds > Number.MAX_SAFE_INTEGER ||
    !Number.isFinite(percentage) ||
    percentage < 0 ||
    percentage > 100
  )
    throw new Error('Duración o porcentaje inválido.');
  return Math.round((baseSeconds / 60) * (percentage / 100));
}

function clockMinutes(time: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
}

/** Earlier end times cross midnight; nextDay also permits explicit 24–48 hour spans. */
export function elapsedMinutes(start: string, end: string, nextDay = false): number | null {
  const startMinutes = clockMinutes(start);
  const endMinutes = clockMinutes(end);
  if (startMinutes === null || endMinutes === null) return null;
  const difference = endMinutes - startMinutes;
  return difference + (nextDay || difference < 0 ? minutesPerDay : 0);
}

export function subtractTime(
  time: string,
  durationMinutes: number,
): { time: string; dayOffset: number } | null {
  const startMinutes = clockMinutes(time);
  if (startMinutes === null || !Number.isSafeInteger(durationMinutes) || durationMinutes < 0)
    return null;
  const result = startMinutes - durationMinutes;
  const dayOffset = Math.floor(result / minutesPerDay);
  const clock = ((result % minutesPerDay) + minutesPerDay) % minutesPerDay;
  return {
    time: `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`,
    dayOffset,
  };
}

export function formatMinutes(totalMinutes: number): string {
  if (!Number.isSafeInteger(totalMinutes) || totalMinutes < 0)
    throw new Error('Duración inválida.');
  return `${Math.floor(totalMinutes / 60)} h ${totalMinutes % 60} min`;
}

/** Count only the part of today's attendance that has happened by the supplied clock. */
export function todayWorkedSeconds(
  attendance: readonly Pick<Attendance, 'inicio_en' | 'fin_en' | 'eliminado_en'>[],
  zone: string,
  now: string,
): number {
  const instant = DateTime.fromISO(now, { zone });
  const date = instant.toISODate();
  if (!instant.isValid || !date) throw new Error('Fecha o zona horaria inválida.');
  const nowMs = instant.toMillis();
  const nowIso = instant.toUTC().toISO()!;
  const clippedAttendance = attendance.map((record) => {
    if (record.fin_en && Date.parse(record.fin_en) > nowMs) return { ...record, fin_en: nowIso };
    return record;
  });
  return attendanceDays(clippedAttendance, [], [date], zone, nowIso)[0]!.workedSeconds;
}

export const MAX_SUBTRACTIONS = 20;

/** Total minutes of every duration row; null if any row is invalid or there are none. */
export function sumDurations(rows: readonly { hours: string; minutes: string }[]): number | null {
  if (!rows.length || rows.length > MAX_SUBTRACTIONS) return null;
  let total = 0;
  for (const row of rows) {
    const minutes = parseDurationMinutes(row.hours, row.minutes);
    if (minutes === null) return null;
    total += minutes;
  }
  return total;
}
