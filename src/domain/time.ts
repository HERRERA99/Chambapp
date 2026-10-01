import { DateTime } from 'luxon';

export const roundingIntervals = [0, 5, 10, 15, 30, 60] as const;

export function roundDuration(seconds: number, minutes: number) {
  if (
    !Number.isFinite(seconds) ||
    seconds < 0 ||
    !roundingIntervals.includes(minutes as (typeof roundingIntervals)[number])
  )
    throw new Error('Duración o intervalo de redondeo inválido.');
  return minutes === 0 ? seconds : Math.ceil(seconds / (minutes * 60)) * minutes * 60;
}

export function formatDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 3600)).padStart(2, '0')}h ${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}m`;
}

export function formatClock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 3600)).padStart(2, '0')}:${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function formatTime(iso: string, zone: string) {
  return DateTime.fromISO(iso, { zone }).toFormat('HH:mm:ss');
}

export function formatDate(date: string, zone = 'Europe/Madrid') {
  return DateTime.fromISO(date, { zone }).setLocale('es').toFormat('cccc, dd LLL yyyy');
}

export function todayInZone(zone: string) {
  return DateTime.now().setZone(zone).toISODate()!;
}

export function mondayForDate(date: string) {
  const local = DateTime.fromISO(date, { zone: 'UTC' });
  return local.minus({ days: local.weekday - 1 }).toISODate()!;
}

export function weekDates(monday: string) {
  return Array.from({ length: 7 }, (_, index) =>
    DateTime.fromISO(monday, { zone: 'UTC' }).plus({ days: index }).toISODate()!,
  );
}

export function localDateTimeToIso(date: string, time: string, zone: string) {
  const value = DateTime.fromISO(`${date}T${time}`, { zone });
  if (
    !value.isValid ||
    value.toFormat('yyyy-MM-dd') !== date ||
    value.toFormat(time.length > 5 ? 'HH:mm:ss' : 'HH:mm') !== time
  )
    throw new Error(
      'La hora seleccionada no existe en esta zona horaria. Revisa la fecha y la hora.',
    );
  // An ambiguous DST hour needs an explicit offset; do not silently choose an occurrence.
  if (value.getPossibleOffsets().length > 1)
    throw new Error(
      'Esa hora se repite por el cambio de horario. Elige una hora fuera del cambio o registra el tramo con el cronómetro.',
    );
  return value.toUTC().toISO()!;
}
