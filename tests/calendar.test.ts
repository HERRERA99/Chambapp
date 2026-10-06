import assert from 'node:assert/strict';
import test from 'node:test';
import { absencesOn, validDateRange } from '../src/domain/calendar.ts';
import { parseHolidays, selectedHolidays } from '../src/features/calendar/holidayApi.ts';
import type { CalendarAbsence } from '../src/domain/models.ts';

test('inclusive absence intervals overlap without duplicating objectives', () => {
  const absences = [
    { id: 'holiday', inicio: '2026-10-12', fin: '2026-10-12' },
    { id: 'vacation', inicio: '2026-10-09', fin: '2026-10-16' },
  ] as CalendarAbsence[];
  assert.equal(absencesOn(absences, '2026-10-08').length, 0);
  assert.equal(absencesOn(absences, '2026-10-09').length, 1);
  assert.equal(absencesOn(absences, '2026-10-12').length, 2);
  assert.equal(absencesOn(absences, '2026-10-16').length, 1);
  assert.equal(absencesOn(absences, '2026-10-17').length, 0);
  assert.equal(validDateRange('2026-02-29', '2026-03-01'), false);
  assert.equal(validDateRange('2026-10-12', '2026-10-09'), false);
  assert.equal(validDateRange('2028-02-29', '2028-02-29'), true);
});

test('holiday import selects national and exact regional public holidays, combining duplicate dates', () => {
  const national = {
    date: '2026-01-01',
    localName: 'Año Nuevo',
    countryCode: 'ES',
    global: true,
    counties: null,
    types: ['Public'],
  };
  const regional = {
    ...national,
    date: '2026-05-02',
    localName: 'Madrid',
    global: false,
    counties: ['ES-MD'],
  };
  const holidays = parseHolidays(
    [
      national,
      regional,
      { ...regional, localName: 'Otra fiesta' },
      { ...regional, date: '2026-05-03', counties: ['ES-VC'] },
      { ...national, date: '2026-05-04', types: ['Observance'] },
    ],
    2026,
    'ES',
  );
  assert.equal(selectedHolidays(holidays, '').length, 1);
  assert.deepEqual(selectedHolidays(holidays, 'ES-MD'), [
    { fecha: '2026-01-01', titulo: 'Año Nuevo' },
    { fecha: '2026-05-02', titulo: 'Madrid / Otra fiesta' },
  ]);
  assert.throws(() => parseHolidays([national], 2027, 'ES'), /incompletos/);
  assert.throws(() => parseHolidays([{ ...national, counties: [123] }], 2026, 'ES'), /incompletos/);
  assert.throws(() => parseHolidays({ error: 'unavailable' }, 2026, 'ES'), /inválida/);
});
