import assert from 'node:assert/strict';
import test from 'node:test';
import type { Task, TimeEntry } from '../src/domain/models.ts';
import {
  applyImputationResult,
  buildOdooRequest,
  buildTimesheetWeek,
  formatRange,
  groupRounding,
  reconcileSelection,
} from '../src/features/timesheet/timesheet.model.ts';

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
    duracion_real_segundos: 3600,
    duracion_imputada_segundos: 3600,
    intervalo_redondeo_minutos: 15,
    version: 1,
    odoo_id: null,
    eliminado_en: null,
    imputado_en_odoo: !!extra.imputacion_odoo_id,
    imputacion_odoo_id: null,
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
        duracion_real_segundos: 1200,
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
  assert.equal(first.items[3]!.realSeconds, null);
  assert.equal(first.items[1]!.realSeconds, 1200);
  assert.equal(first.items[3]!.range, '16:00–en curso');
  // Totals round each task/day group on its summed real time; open entries do not count.
  // Task a: 60 + 20 min -> 80 -> 90 min (R15). Orphan task b: 60 min.
  assert.equal(first.loggedSeconds, 5400 + 3600);
  assert.equal(week.loggedSeconds, first.loggedSeconds);
  const ids = week.days.flatMap((day) => day.items.map((item) => item.entry.id));
  assert.ok(!ids.includes('nextweek') && !ids.includes('prevsunday') && !ids.includes('gone'));
});

const minutes = (value: number) => value * 60;
function at(id: string, startMinute: number, length: number, extra: Partial<TimeEntry> = {}) {
  const start = new Date(Date.parse(`${monday}T07:00:00Z`) + minutes(startMinute) * 1000);
  return entry(id, {
    inicio_en: start.toISOString(),
    fin_en: new Date(start.getTime() + minutes(length) * 1000).toISOString(),
    duracion_real_segundos: minutes(length),
    ...extra,
  });
}

test('rounds the summed real time once, with the largest interval of the entries', () => {
  const three = [at('a', 0, 25), at('b', 60, 20), at('c', 120, 10)];
  // 55 min -> 60 with R15, not 30 + 30 + 15 = 75.
  assert.deepEqual(groupRounding(three), {
    realSeconds: minutes(55),
    intervalMinutes: 15,
    loggedSeconds: minutes(60),
  });
  assert.equal(
    groupRounding([at('a', 0, 25, { intervalo_redondeo_minutos: 30 }), at('b', 60, 20)])
      .loggedSeconds,
    minutes(60),
  );
  assert.equal(
    groupRounding([at('a', 0, 25, { intervalo_redondeo_minutos: 0 })]).loggedSeconds,
    minutes(25),
  );
  // Running and deleted entries do not count.
  assert.equal(
    groupRounding([
      at('a', 0, 25),
      entry('open', { fin_en: null }),
      at('x', 90, 5, { eliminado_en: 'x' }),
    ]).realSeconds,
    minutes(25),
  );
  assert.deepEqual(groupRounding([]), { realSeconds: 0, intervalMinutes: 0, loggedSeconds: 0 });
});

test('groups entries by task and day with pending, partial and imputed states', () => {
  const week = buildTimesheetWeek({
    monday,
    tasks: [task('a'), task('b')],
    entries: [
      at('a3', 120, 10),
      at('a1', 0, 25, { imputacion_odoo_id: 'imp-1' }),
      at('b1', 30, 20, { tarea_id: 'b' }),
      at('a2', 60, 20, { imputacion_odoo_id: 'imp-1' }),
      at('tuesday', 0, 40, { fecha: '2026-10-20', imputacion_odoo_id: 'imp-2' }),
      entry('gone', { eliminado_en: 'x', imputacion_odoo_id: 'imp-1' }),
    ],
  });
  const [monGroups, tueGroups] = [week.days[0]!.groups, week.days[1]!.groups];
  assert.deepEqual(
    monGroups.map((group) => [group.taskId, group.entries.map((item) => item.id)]),
    [
      ['a', ['a1', 'a2', 'a3']],
      ['b', ['b1']],
    ],
  );
  const a = monGroups[0]!;
  assert.equal(a.status, 'partial');
  assert.deepEqual(
    a.pending.map((item) => item.id),
    ['a3'],
  );
  assert.equal(a.imputations.length, 1);
  // Imputation: 45 min -> 45; pending 10 min -> 15.
  assert.equal(a.imputations[0]!.loggedSeconds, minutes(45));
  assert.equal(a.pendingLoggedSeconds, minutes(15));
  assert.equal(a.loggedSeconds, minutes(60));
  assert.equal(a.realSeconds, minutes(55));
  assert.equal(monGroups[1]!.status, 'pending');
  assert.equal(monGroups[1]!.loggedSeconds, minutes(30));
  assert.equal(week.days[0]!.loggedSeconds, minutes(90));
  assert.equal(tueGroups[0]!.status, 'imputed');
  assert.equal(tueGroups[0]!.loggedSeconds, minutes(45));
  assert.equal(week.loggedSeconds, minutes(135));
  assert.equal(week.days[2]!.groups.length, 0);
});

test('a running entry keeps an otherwise imputed group partial and is not pending', () => {
  const week = buildTimesheetWeek({
    monday,
    tasks: [task('a')],
    entries: [
      at('a1', 0, 25, { imputacion_odoo_id: 'imp-1' }),
      entry('open', {
        inicio_en: `${monday}T09:00:00Z`,
        fin_en: null,
        duracion_real_segundos: null,
      }),
    ],
  });
  const group = week.days[0]!.groups[0]!;
  assert.equal(group.status, 'partial');
  assert.deepEqual(group.pending, []);
  assert.deepEqual(
    group.running.map((item) => item.id),
    ['open'],
  );
  assert.equal(group.loggedSeconds, minutes(30));
});

test('applies confirmed imputation results only over older cached versions', () => {
  const cached = [
    entry('a', { version: 2 }),
    entry('b', { version: 5 }),
    entry('c', { version: 1 }),
  ];
  const next = applyImputationResult(cached, [
    { id: 'a', version: 3, imputacion_odoo_id: 'imp', imputado_en_odoo: true },
    { id: 'b', version: 4, imputacion_odoo_id: 'imp', imputado_en_odoo: true },
  ]);
  assert.deepEqual(
    next.map((item) => [item.id, item.version, item.imputacion_odoo_id, item.imputado_en_odoo]),
    [
      ['a', 3, 'imp', true],
      ['b', 5, null, false],
      ['c', 1, null, false],
    ],
  );
  const undone = applyImputationResult(next, [
    { id: 'a', version: 4, imputacion_odoo_id: null, imputado_en_odoo: false },
  ]);
  assert.deepEqual(
    [undone[0]!.version, undone[0]!.imputacion_odoo_id, undone[0]!.imputado_en_odoo],
    [4, null, false],
  );
});

test('sums fractional seconds exactly before rounding (no float overshoot)', () => {
  const parts = (seconds: number[]) =>
    seconds.map((value, index) =>
      at(`f${index}`, index * 20, 1, { duracion_real_segundos: value }),
    );
  // 599.6 + 299.8 + 0.6 is exactly 900 s: one 15-minute interval, not two.
  const exact = groupRounding(parts([599.6, 299.8, 0.6]));
  assert.equal(exact.realSeconds, 900);
  assert.equal(exact.loggedSeconds, 900);
  // One microsecond above the boundary rounds up to the next interval.
  assert.equal(groupRounding(parts([599.6, 299.8, 0.600001])).loggedSeconds, 1800);
  assert.equal(groupRounding(parts([0.000001])).loggedSeconds, 900);
  assert.equal(
    groupRounding(parts([0.1, 0.2]).map((item) => ({ ...item, intervalo_redondeo_minutos: 0 })))
      .loggedSeconds,
    0.3,
  );
});

test('a selection drops entries that stop being pending, even if they come back', () => {
  const a = at('a', 0, 10);
  const b = at('b', 20, 10);
  const selected = new Set(['a', 'b']);
  assert.equal(reconcileSelection(selected, [a, b]), selected);
  // a was imputed elsewhere: it leaves the selection permanently.
  const afterImpute = reconcileSelection(selected, [b]);
  assert.deepEqual([...afterImpute], ['b']);
  // Undoing that imputation makes a pending again, but it is not re-selected.
  assert.deepEqual([...reconcileSelection(afterImpute, [a, b])], ['b']);
});

test('buildOdooRequest rounds the sum once, then up to whole minutes for Odoo', () => {
  const owner = '00000000-0000-4000-8000-000000000001';
  const rid = '00000000-0000-4000-8000-000000000002';
  const odooTask = task('a', {
    version: 7,
    odoo_url: 'https://empresa.odoo.com/odoo/project/1/tasks/9',
  });
  const group = { date: monday, taskId: 'a', title: 'Tarea a', odooUrl: null };
  const parts = [
    entry('2', {
      inicio_en: `${monday}T09:00:00Z`,
      duracion_real_segundos: 20 * 60,
      descripcion: 'Revisión',
    }),
    entry('1', {
      inicio_en: `${monday}T08:00:00Z`,
      duracion_real_segundos: 25 * 60,
      descripcion: 'Análisis',
    }),
    entry('3', {
      inicio_en: `${monday}T10:00:00Z`,
      duracion_real_segundos: 10 * 60,
      descripcion: 'Revisión',
    }),
  ];
  const built = buildOdooRequest({
    group,
    entries: parts,
    task: odooTask,
    userId: owner,
    requestId: rid,
  });
  assert.ok('request' in built);
  // 25 + 20 + 10 = 55 min, rounded once to 15 → 60 min (not 75).
  assert.equal(built.request.minutos, 60);
  assert.equal(built.request.horasFormato, '01:00');
  assert.equal(built.request.descripcion, 'Análisis · Revisión');
  assert.equal(built.request.taskVersion, 7);
  assert.equal(built.request.fecha, monday);
  assert.equal(built.request.odooUrl, 'https://empresa.odoo.com/odoo/project/1/tasks/9');
  assert.deepEqual(
    built.request.partes.map((part) => part.id),
    ['1', '2', '3'],
  );

  // Exact durations (interval 0) with seconds go up to the next minute: 61 s → 2 min.
  const exact = buildOdooRequest({
    group,
    entries: [
      entry('4', { intervalo_redondeo_minutos: 0, duracion_real_segundos: 61, descripcion: null }),
    ],
    task: odooTask,
    userId: owner,
    requestId: rid,
  });
  assert.ok('request' in exact);
  assert.equal(exact.request.minutos, 2);
  assert.equal(exact.request.horasFormato, '00:02');
  assert.equal(exact.request.descripcion, 'Tarea a');

  const zero = buildOdooRequest({
    group,
    entries: [entry('5', { intervalo_redondeo_minutos: 0, duracion_real_segundos: 0 })],
    task: odooTask,
    userId: owner,
    requestId: rid,
  });
  assert.ok('problem' in zero);
  const noUrl = buildOdooRequest({
    group,
    entries: parts,
    task: task('a'),
    userId: owner,
    requestId: rid,
  });
  assert.ok('problem' in noUrl);
  const running = buildOdooRequest({
    group,
    entries: [entry('6', { fin_en: null })],
    task: odooTask,
    userId: owner,
    requestId: rid,
  });
  assert.ok('problem' in running);
  const long = buildOdooRequest({
    group,
    entries: [entry('7', { duracion_real_segundos: 6 * 3600 })],
    task: odooTask,
    userId: owner,
    requestId: rid,
    confirmLong: true,
  });
  assert.ok('request' in long);
  assert.equal(long.request.confirmLong, true);
});
