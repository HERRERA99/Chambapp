import assert from 'node:assert/strict';
import test from 'node:test';
import type { Task, TimeEntry } from '../src/domain/models.ts';
import { buildTimesheetWeek, formatRange } from '../src/features/timesheet/timesheet.model.ts';

const monday = '2026-10-19';
const zone = 'Europe/Madrid';

function task(id: string, extra: Partial<Task> = {}) {
  return { id, titulo: `Tarea ${id}`, odoo_id: null, eliminado_en: null, ...extra } as Task;
}

function entry(id: string, extra: Partial<TimeEntry>) {
  return {
    id,
    tarea_id: 'a',
    fecha: monday,
    zona_horaria: zone,
    inicio_en: `${monday}T07:00:00Z`,
    fin_en: `${monday}T08:00:00Z`,
    duracion_imputada_segundos: 3600,
    odoo_id: null,
    eliminado_en: null,
    imputado_en_odoo: false,
    ...extra,
  } as TimeEntry;
}

test('formats ranges in the entry zone, with real calendar-day offsets', () => {
  assert.equal(formatRange(entry('x', {})), '09:00–10:00');
  assert.equal(formatRange(entry('x', { fin_en: null })), '09:00–en curso');
  assert.equal(
    formatRange(entry('x', { inicio_en: '2026-10-19T21:00:00Z', fin_en: '2026-10-19T23:30:00Z' })),
    '23:00–01:30 (+1)',
  );
  assert.equal(
    formatRange(entry('x', { inicio_en: '2026-10-19T07:00:00Z', fin_en: '2026-10-21T08:00:00Z' })),
    '09:00–10:00 (+2)',
  );
  // Crosses the end of summer time (25 Oct 2026, 03:00 CEST -> 02:00 CET).
  assert.equal(
    formatRange(entry('x', { inicio_en: '2026-10-24T20:00:00Z', fin_en: '2026-10-25T03:00:00Z' })),
    '22:00–04:00 (+1)',
  );
  // Same zone rule in another zone: 22:00 New York the same local day.
  assert.equal(
    formatRange(
      entry('x', {
        zona_horaria: 'America/New_York',
        inicio_en: '2026-10-19T22:00:00Z',
        fin_en: '2026-10-20T02:00:00Z',
      }),
    ),
    '18:00–22:00',
  );
});

test('builds Monday–Friday plus weekend days only when they have entries', () => {
  const week = buildTimesheetWeek({
    tasks: [task('a')],
    monday,
    entries: [
      entry('sun', {
        fecha: '2026-10-25',
        inicio_en: '2026-10-25T09:00:00Z',
        fin_en: '2026-10-25T10:00:00Z',
      }),
    ],
  });
  assert.deepEqual(
    week.days.map((day) => day.date),
    ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-25'],
  );
  assert.equal(week.days.at(-1)!.isWeekend, true);
  const empty = buildTimesheetWeek({ tasks: [], monday, entries: [] });
  assert.equal(empty.days.length, 5);
  assert.equal(empty.loggedSeconds, 0);
});

test('lists one item per entry, sorted, excluding deleted entries and other weeks', () => {
  const week = buildTimesheetWeek({
    monday,
    tasks: [
      task('a', { odoo_id: 'T1', odoo_url: 'https://odoo.example/tasks/1' }),
      task('b', { eliminado_en: '2026-10-01T00:00:00Z' }),
    ],
    entries: [
      entry('late', {
        inicio_en: `${monday}T12:00:00Z`,
        fin_en: `${monday}T12:20:00Z`,
        duracion_imputada_segundos: 1800,
      }),
      entry('early', {}),
      entry('open', {
        inicio_en: `${monday}T14:00:00Z`,
        fin_en: null,
        duracion_imputada_segundos: null,
      }),
      entry('gone', { eliminado_en: '2026-10-19T10:00:00Z' }),
      entry('orphan', {
        tarea_id: 'b',
        inicio_en: `${monday}T13:00:00Z`,
        odoo_id: 'T9',
        odoo_url: 'javascript:alert(1)',
      }),
      entry('nextweek', { fecha: '2026-10-26' }),
      entry('prevsunday', { fecha: '2026-10-18' }),
    ],
  });
  const first = week.days[0]!;
  assert.deepEqual(
    first.items.map((item) => item.entry.id),
    ['early', 'late', 'orphan', 'open'],
  );
  assert.equal(first.items[0]!.title, 'Tarea a');
  assert.equal(first.items[0]!.odooId, 'T1');
  assert.equal(first.items[0]!.odooUrl, 'https://odoo.example/tasks/1');
  // Unsafe links are never exposed.
  assert.equal(first.items[2]!.odooUrl, null);
  assert.equal(first.items[1]!.odooUrl, 'https://odoo.example/tasks/1');
  assert.equal(first.items[2]!.title, 'Tarea no disponible');
  assert.equal(first.items[2]!.odooId, 'T9');
  assert.equal(first.items[3]!.loggedSeconds, null);
  assert.equal(first.items[3]!.range, '16:00–en curso');
  // Totals use each entry's rounded duration; open entries do not count.
  assert.equal(first.loggedSeconds, 3600 + 1800 + 3600);
  assert.equal(week.loggedSeconds, first.loggedSeconds);
  const ids = week.days.flatMap((day) => day.items.map((item) => item.entry.id));
  assert.ok(!ids.includes('nextweek') && !ids.includes('prevsunday') && !ids.includes('gone'));
});
