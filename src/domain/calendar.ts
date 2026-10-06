import { DateTime } from 'luxon';
import type { CalendarAbsence } from './models.ts';

export function absencesOn(absences: readonly CalendarAbsence[], date: string) {
  return absences.filter((absence) => absence.inicio <= date && absence.fin >= date);
}

export function validDateRange(start: string, end: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(start) &&
    /^\d{4}-\d{2}-\d{2}$/.test(end) &&
    DateTime.fromISO(start).isValid &&
    DateTime.fromISO(end).isValid &&
    start <= end
  );
}
