import assert from 'node:assert/strict';
import test from 'node:test';
import type { Task, TimeEntry } from '../src/domain/models.ts';
import { lockedIds } from '../src/features/extension/protocol.ts';
import {
  applyImputationResult,
  buildOdooRequest,
  odooDescriptionChoices,
  buildTimesheetWeek,
  formatRange,
  groupRounding,
  planWeekOdooSend,
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
  assert.equal(first.items[2]!.title, 'Tarea no disponible');
  assert.equal(first.groups[0]!.odooUrl, 'https://odoo.example/tasks/1');
  // Unsafe links are never exposed.
  assert.equal(first.groups[1]!.odooUrl, null);
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

test('odooDescriptionChoices: distinct, trimmed, in send order; ignores empty and unsendable', () => {
  const parts = [
    entry('b', { inicio_en: `${monday}T09:00:00Z`, descripcion: ' Revisión ' }),
    entry('a', { inicio_en: `${monday}T08:00:00Z`, descripcion: 'Análisis' }),
    entry('c', { inicio_en: `${monday}T10:00:00Z`, descripcion: 'Revisión' }),
    entry('d', { inicio_en: `${monday}T11:00:00Z`, descripcion: '   ' }),
    entry('e', { inicio_en: `${monday}T12:00:00Z`, descripcion: 'En curso', fin_en: null }),
  ];
  assert.deepEqual(odooDescriptionChoices(parts), ['Análisis', 'Revisión']);
  assert.deepEqual(odooDescriptionChoices([entry('f', { descripcion: null })]), []);
});

test('buildOdooRequest uses the description chosen by the user', () => {
  const odooTask = task('a', {
    version: 1,
    odoo_url: 'https://empresa.odoo.com/odoo/project/1/tasks/9',
  });
  const group = { date: monday, taskId: 'a', title: 'Tarea a', odooUrl: null };
  const base = {
    group,
    entries: [
      entry('1', { descripcion: 'Análisis' }),
      entry('2', { inicio_en: `${monday}T09:00:00Z`, descripcion: 'Revisión' }),
    ],
    task: odooTask,
    userId: '00000000-0000-4000-8000-000000000001',
    requestId: '00000000-0000-4000-8000-000000000002',
  };
  const chosen = buildOdooRequest({ ...base, descripcion: '  Reunión de seguimiento  ' });
  assert.ok('request' in chosen);
  assert.equal(chosen.request.descripcion, 'Reunión de seguimiento');
  const long = buildOdooRequest({ ...base, descripcion: 'x'.repeat(1200) });
  assert.ok('request' in long);
  assert.equal(long.request.descripcion.length, 1000);
  const empty = buildOdooRequest({ ...base, descripcion: '   ' });
  assert.ok('problem' in empty);
  const joined = buildOdooRequest(base);
  assert.ok('request' in joined);
  assert.equal(joined.request.descripcion, 'Análisis · Revisión');
});

test('planWeekOdooSend excludes groups without Odoo URL, with running timer, queued, or invalid', () => {
  const owner = '00000000-0000-4000-8000-000000000001';
  const tasks = [
    task('ok', { version: 2, odoo_url: 'https://empresa.odoo.com/odoo/project/1/tasks/1' }),
    task('no-url', { version: 1, odoo_url: null }),
    task('running', { version: 1, odoo_url: 'https://empresa.odoo.com/odoo/project/1/tasks/2' }),
    task('queued', { version: 1, odoo_url: 'https://empresa.odoo.com/odoo/project/1/tasks/3' }),
    task('zero', { version: 1, odoo_url: 'https://empresa.odoo.com/odoo/project/1/tasks/4' }),
    task('over24', { version: 1, odoo_url: 'https://empresa.odoo.com/odoo/project/1/tasks/5' }),
    task('other-origin', {
      version: 1,
      odoo_url: 'https://otro.odoo.com/odoo/project/1/tasks/6',
    }),
  ];
  const week = buildTimesheetWeek({
    monday,
    tasks,
    entries: [
      at('ok-1', 0, 30, { tarea_id: 'ok', descripcion: 'Desarrollo' }),
      at('no-url-1', 30, 30, { tarea_id: 'no-url', descripcion: 'Sin enlace' }),
      at('run-1', 60, 30, { tarea_id: 'running', descripcion: 'Terminado' }),
      entry('run-open', {
        tarea_id: 'running',
        inicio_en: `${monday}T09:00:00Z`,
        fin_en: null,
        duracion_real_segundos: null,
      }),
      at('q-1', 90, 30, { tarea_id: 'queued', descripcion: 'En cola' }),
      at('zero-1', 120, 0, {
        tarea_id: 'zero',
        intervalo_redondeo_minutos: 0,
        duracion_real_segundos: 0,
        descripcion: 'Cero',
      }),
      at('over-1', 150, 25 * 60, {
        tarea_id: 'over24',
        duracion_real_segundos: 25 * 3600,
        descripcion: 'Demasiado largo',
      }),
      at('other-1', 180, 30, { tarea_id: 'other-origin', descripcion: 'Otro Odoo' }),
      // Missing task (deleted from task list)
      at('missing-1', 210, 30, {
        tarea_id: 'deleted-task',
        odoo_url: 'https://empresa.odoo.com/odoo/project/1/tasks/99',
        descripcion: 'Huérfana',
      }),
    ],
  });
  const locked = lockedIds([
    {
      requestId: '00000000-0000-4000-8000-000000000099',
      taskId: 'queued',
      entryIds: ['q-1'],
      status: 'pending',
      error: '',
    },
    {
      // Completed/failed queue items must not lock entries.
      requestId: '00000000-0000-4000-8000-000000000098',
      taskId: 'ok',
      entryIds: ['ok-1'],
      status: 'error',
      error: 'Error previo',
    },
  ]);
  let seq = 0;
  const rows = planWeekOdooSend({
    days: week.days,
    tasks,
    userId: owner,
    locked,
    nextId: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
    odooOrigin: 'https://empresa.odoo.com',
  });
  const byTask = new Map(rows.map((row) => [row.group.taskId, row]));
  assert.equal(byTask.get('ok')!.exclusionReason, null);
  assert.equal(byTask.get('ok')!.request?.minutos, 30);

  assert.equal(byTask.get('no-url')!.request, null);
  assert.match(byTask.get('no-url')!.exclusionReason!, /enlace de Odoo/i);

  assert.equal(byTask.get('running')!.request, null);
  assert.match(byTask.get('running')!.exclusionReason!, /cronómetro/i);

  assert.equal(byTask.get('queued')!.request, null);
  assert.match(byTask.get('queued')!.exclusionReason!, /en cola/i);

  assert.equal(byTask.get('zero')!.request, null);
  assert.match(byTask.get('zero')!.exclusionReason!, /0/);

  assert.equal(byTask.get('over24')!.request, null);
  assert.match(byTask.get('over24')!.exclusionReason!, /24 horas/);

  assert.equal(byTask.get('other-origin')!.request, null);
  assert.match(byTask.get('other-origin')!.exclusionReason!, /empresa\.odoo\.com/);

  assert.equal(byTask.get('deleted-task')!.request, null);
  assert.match(byTask.get('deleted-task')!.exclusionReason!, /no está disponible/i);
});

test('planWeekOdooSend classifies descriptions (1, >1, 0) and >5h groups', () => {
  const owner = '00000000-0000-4000-8000-000000000001';
  const tasks = [
    task('one', { version: 1, odoo_url: 'https://empresa.odoo.com/odoo/project/1/tasks/1' }),
    task('multi', { version: 1, odoo_url: 'https://empresa.odoo.com/odoo/project/1/tasks/2' }),
    task('none', { version: 1, odoo_url: 'https://empresa.odoo.com/odoo/project/1/tasks/3' }),
    task('exact5', { version: 1, odoo_url: 'https://empresa.odoo.com/odoo/project/1/tasks/4' }),
    task('over5', { version: 1, odoo_url: 'https://empresa.odoo.com/odoo/project/1/tasks/5' }),
  ];
  const week = buildTimesheetWeek({
    monday,
    tasks,
    entries: [
      at('o1', 0, 20, { tarea_id: 'one', descripcion: 'Misma' }),
      at('o2', 30, 20, { tarea_id: 'one', descripcion: ' Misma ' }),
      at('m1', 60, 15, { tarea_id: 'multi', descripcion: 'Análisis' }),
      at('m2', 90, 15, { tarea_id: 'multi', descripcion: 'Revisión' }),
      at('n1', 120, 30, { tarea_id: 'none', descripcion: null }),
      at('n2', 160, 15, { tarea_id: 'none', descripcion: '   ' }),
      at('e5', 200, 300, { tarea_id: 'exact5', descripcion: 'Cinco horas exactas' }),
      at('o5', 520, 315, { tarea_id: 'over5', descripcion: 'Más de cinco horas' }),
    ],
  });
  let seq = 0;
  const rows = planWeekOdooSend({
    days: week.days,
    tasks,
    userId: owner,
    locked: lockedIds([]),
    nextId: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
  });
  const byTask = new Map(rows.map((row) => [row.group.taskId, row]));

  assert.equal(byTask.get('one')!.needsDescription, false);
  assert.deepEqual(byTask.get('one')!.choices, ['Misma']);
  assert.equal(byTask.get('one')!.request?.descripcion, 'Misma');

  assert.equal(byTask.get('multi')!.needsDescription, true);
  assert.deepEqual(byTask.get('multi')!.choices, ['Análisis', 'Revisión']);
  assert.notEqual(byTask.get('multi')!.request, null);

  assert.equal(byTask.get('none')!.needsDescription, true);
  assert.deepEqual(byTask.get('none')!.choices, []);
  assert.notEqual(byTask.get('none')!.request, null);

  assert.equal(byTask.get('exact5')!.isLong, false);
  assert.equal(byTask.get('over5')!.isLong, true);
  assert.equal(byTask.get('over5')!.request?.confirmLong, false);
});

test('planWeekOdooSend orders by day then group, skips non-pending groups, and sends only pending parts of partial groups', () => {
  const owner = '00000000-0000-4000-8000-000000000001';
  const tasks = [
    task('a', { version: 3, odoo_url: 'https://empresa.odoo.com/odoo/project/1/tasks/1' }),
    task('b', { version: 4, odoo_url: 'https://empresa.odoo.com/odoo/project/1/tasks/2' }),
    task('c', { version: 5, odoo_url: 'https://empresa.odoo.com/odoo/project/1/tasks/3' }),
  ];
  const week = buildTimesheetWeek({
    monday,
    tasks,
    entries: [
      // Monday: task b starts before task a, plus task c already imputed (should be skipped).
      at('mon-b', 0, 45, { tarea_id: 'b', descripcion: 'Lunes B' }),
      at('mon-a-imp', 30, 60, {
        tarea_id: 'a',
        imputacion_odoo_id: 'imp-1',
        descripcion: 'Ya imputado',
      }),
      at('mon-a-pend', 120, 20, { tarea_id: 'a', descripcion: 'Pendiente A' }),
      at('mon-c-imp', 150, 30, {
        tarea_id: 'c',
        imputacion_odoo_id: 'imp-2',
        descripcion: 'Todo imputado',
      }),
      // Tuesday: only running entry on task c (should be skipped), pending on task a and b.
      entry('tue-c-run', {
        tarea_id: 'c',
        fecha: '2026-10-20',
        inicio_en: '2026-10-20T07:00:00Z',
        fin_en: null,
        duracion_real_segundos: null,
      }),
      at('tue-a', 0, 30, { tarea_id: 'a', fecha: '2026-10-20', descripcion: 'Martes A' }),
      at('tue-b', 60, 15, { tarea_id: 'b', fecha: '2026-10-20', descripcion: 'Martes B' }),
    ],
  });
  let seq = 0;
  const rows = planWeekOdooSend({
    days: week.days,
    tasks,
    userId: owner,
    locked: lockedIds([]),
    nextId: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
  });

  assert.deepEqual(
    rows.map((row) => [row.group.date, row.group.taskId]),
    [
      ['2026-10-19', 'b'],
      ['2026-10-19', 'a'],
      ['2026-10-20', 'a'],
      ['2026-10-20', 'b'],
    ],
  );
  // Partial group on Monday task a: only the 20-minute pending part (rounded to 30 min) is sent.
  const partial = rows[1]!;
  assert.equal(partial.exclusionReason, null);
  assert.deepEqual(
    partial.request?.partes.map((part) => part.id),
    ['mon-a-pend'],
  );
  assert.equal(partial.request?.minutos, 30);
  assert.equal(partial.request?.horasFormato, '00:30');
  assert.deepEqual(partial.choices, ['Pendiente A']);
  assert.equal(partial.needsDescription, false);
});
