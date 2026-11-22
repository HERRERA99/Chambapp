import assert from 'node:assert/strict';
import test from 'node:test';
import { DateTime } from 'luxon';
import { normalizeHeraRequests } from '../src/features/extension/heraRequests.ts';
import {
  heraInstant,
  heraPlan,
  heraWeekDates,
  heraWeekPlan,
  heraWeekPlanSignature,
  normalizeHeraWeek,
  pairHeraAccesses,
  parseHeraAction,
} from '../extension/src/shared/hera.ts';
import type { AttendanceRow } from '../extension/src/shared/hera.ts';

const label = (iso: string) => iso.slice(11, 16);

test('reads the last action shown by Hera', () => {
  assert.deepEqual(parseHeraAction('Última acción: SALIDA 09/11/2026 16:04'), {
    kind: 'salida',
    date: '2026-11-09',
    time: '16:04',
  });
  assert.deepEqual(parseHeraAction('  Última acción:   entrada 3/2/2026 8:05 '), {
    kind: 'entrada',
    date: '2026-02-03',
    time: '08:05',
  });
  for (const bad of ['', 'Última acción: SALIDA', 'Última acción: SALIDA 31/02/2026 10:00', null])
    assert.equal(parseHeraAction(bad), null, String(bad));
});

test('the instant uses the user time zone, with its offset (summer and winter)', () => {
  assert.equal(
    heraInstant({ kind: 'salida', date: '2026-11-09', time: '16:04' }, 'Europe/Madrid'),
    '2026-11-09T16:04:00+01:00',
  );
  assert.equal(
    heraInstant({ kind: 'entrada', date: '2026-07-01', time: '08:00' }, 'Europe/Madrid'),
    '2026-07-01T08:00:00+02:00',
  );
});

const closed: AttendanceRow = {
  id: 'a',
  version: 2,
  inicio_en: '2026-11-09T08:00:00+01:00',
  fin_en: '2026-11-09T12:00:00+01:00',
};
const open: AttendanceRow = {
  id: 'b',
  version: 1,
  inicio_en: '2026-11-09T13:00:00+01:00',
  fin_en: null,
};

test('an ENTRADA opens an attendance unless it exists, another is open or it falls inside one', () => {
  const entrada = (time: string) => ({ kind: 'entrada' as const, date: '2026-11-09', time });
  assert.deepEqual(heraPlan([closed], entrada('13:00'), '2026-11-09T13:00:00+01:00', label), {
    kind: 'create',
    inicio_en: '2026-11-09T13:00:00+01:00',
  });
  assert.equal(
    heraPlan([closed], entrada('08:00'), '2026-11-09T08:00:00+01:00', label).kind,
    'already',
  );
  assert.equal(
    heraPlan([closed, open], entrada('15:00'), '2026-11-09T15:00:00+01:00', label).kind,
    'error',
  );
  assert.equal(
    heraPlan([closed], entrada('10:00'), '2026-11-09T10:00:00+01:00', label).kind,
    'error',
  );
  assert.equal(
    heraPlan([closed], entrada('07:00'), '2026-11-09T07:00:00+01:00', label).kind,
    'error',
    'an open entry before later attendance would overlap it',
  );
});

test('a SALIDA closes the open attendance; repeated or impossible exits are not recorded', () => {
  const salida = (time: string) => ({ kind: 'salida' as const, date: '2026-11-09', time });
  assert.deepEqual(heraPlan([closed, open], salida('16:04'), '2026-11-09T16:04:00+01:00', label), {
    kind: 'close',
    id: 'b',
    version: 1,
    inicio_en: '2026-11-09T13:00:00+01:00',
    fin_en: '2026-11-09T16:04:00+01:00',
  });
  assert.equal(
    heraPlan([closed], salida('12:00'), '2026-11-09T12:00:00+01:00', label).kind,
    'already',
  );
  assert.equal(
    heraPlan([closed], salida('16:04'), '2026-11-09T16:04:00+01:00', label).kind,
    'error',
  );
  assert.equal(
    heraPlan([open], salida('12:30'), '2026-11-09T12:30:00+01:00', label).kind,
    'error',
    'an exit before the open entry',
  );
});

const monday = '2026-11-09';
const zone = 'Europe/Madrid';
const entrada = (time: string) => ({ kind: 'entrada' as const, time });
const salida = (time: string) => ({ kind: 'salida' as const, time });
const first = [entrada('08:00'), salida('12:00')];
const second = [entrada('13:00'), salida('16:00')];
const day = (accesses = first, pendingRequests = 0) => ({
  date: monday,
  accesses,
  pendingRequests,
});
const at = (time: string) => `${monday}T${time}:00+01:00`;
const shift = (start: string, end: string) => ({ inicio_en: at(start), fin_en: at(end) });
const planDay = (rows: AttendanceRow[], accesses = first) =>
  heraWeekPlan([day(accesses)], rows, zone).days[0]!;

test('Hera week ends yesterday in the profile zone, using the previous week on Monday', () => {
  const sundayUtc = DateTime.fromISO('2026-11-08T23:30Z', { zone });
  assert.deepEqual(heraWeekDates(sundayUtc), [
    '2026-11-02',
    '2026-11-03',
    '2026-11-04',
    '2026-11-05',
    '2026-11-06',
    '2026-11-07',
    '2026-11-08',
  ]);
  assert.deepEqual(heraWeekDates(DateTime.fromISO('2026-11-12', { zone })), [
    monday,
    '2026-11-10',
    '2026-11-11',
  ]);
});

test('pairs one or two registered shifts in the order received', () => {
  assert.deepEqual(pairHeraAccesses(day(), zone).segments, [shift('08:00', '12:00')]);
  assert.deepEqual(pairHeraAccesses(day([...first, ...second]), zone).segments, [
    shift('08:00', '12:00'),
    shift('13:00', '16:00'),
  ]);
});

test('an incomplete Hera day never schedules writes, even if some pairs are complete', () => {
  for (const [accesses, reason] of [
    [[...first, entrada('13:00')], /no tiene salida/],
    [[salida('12:00')], /salida sin entrada/],
    [[entrada('08:00'), entrada('09:00')], /dos entradas/],
    [[entrada('08:00'), salida('08:00')], /posterior/],
  ] as const) {
    const plan = planDay([], [...accesses]);
    assert.equal(plan.status, 'incomplete');
    assert.match(plan.message!, reason);
    assert.deepEqual(plan.create, []);
    assert.deepEqual(plan.update, []);
  }
});

test('creates missing shifts and treats touching endpoints as non-overlapping', () => {
  const later = { ...closed, ...shift('12:00', '13:00') };
  const plan = planDay([later], [...first, ...second]);
  assert.equal(plan.status, 'ok');
  assert.deepEqual(plan.create, [shift('08:00', '12:00'), shift('13:00', '16:00')]);
  assert.deepEqual(plan.onlyChambapp, [later]);
});

test('updates a unique overlap at a one-minute difference and closes a past open shift', () => {
  const moved = { ...closed, ...shift('08:01', '12:00') };
  const plan = planDay([moved, open], [...first, ...second]);
  assert.deepEqual(plan.update, [
    { row: moved, segment: shift('08:00', '12:00') },
    { row: open, segment: shift('13:00', '16:00') },
  ]);
  assert.deepEqual(plan.create, []);
});

test('a shift left open in the morning closes with the first segment and the rest is created', () => {
  const forgotten = { ...open, inicio_en: at('08:00') };
  const plan = planDay([forgotten], [...first, ...second]);
  assert.equal(plan.status, 'ok');
  assert.deepEqual(plan.update, [{ row: forgotten, segment: shift('08:00', '12:00') }]);
  assert.deepEqual(plan.create, [shift('13:00', '16:00')]);
});

test('an overlap matching within one minute stays unchanged', () => {
  const row = {
    ...closed,
    inicio_en: '2026-11-09T07:00:59Z',
    fin_en: '2026-11-09T10:59:01Z',
  };
  const plan = planDay([row]);
  assert.deepEqual(plan.same, [{ row, segment: shift('08:00', '12:00') }]);
  assert.deepEqual(plan.update, []);
});

test('either type of ambiguous overlap skips the entire day', () => {
  const long = { ...closed, ...shift('09:00', '14:00') };
  const split = [
    { ...closed, ...shift('08:00', '09:00') },
    { ...open, ...shift('09:15', '11:00') },
  ];
  for (const rows of [[long], split]) {
    const plan = planDay(rows, [...first, ...second]);
    assert.equal(plan.status, 'conflict');
    assert.match(plan.message!, /correspondencia única/);
    assert.deepEqual(plan.create, []);
    assert.deepEqual(plan.update, []);
  }
});

test('scopes by local start date, lists Chambapp-only rows, and reports empty and out-of-range days', () => {
  const previousDay = { ...open, inicio_en: '2026-11-08T20:00:00Z' };
  const localMonday = { ...open, inicio_en: '2026-11-08T23:00:00Z' };
  const plan = planDay([previousDay, localMonday], []);
  assert.equal(plan.status, 'empty');
  assert.deepEqual(plan.onlyChambapp, [localMonday]);
  assert.deepEqual(plan.create, []);
  assert.equal(planDay([], []).status, 'empty');

  const outside = normalizeHeraWeek([{ ...day([]), outOfRange: true }], [monday]);
  const skipped = heraWeekPlan(outside, [closed], zone).days[0]!;
  assert.equal(skipped.status, 'out-of-range');
  assert.deepEqual(skipped.create, []);
  assert.deepEqual(skipped.update, []);
});

test('validates page results for the requested dates and normalizes valid access fields', () => {
  assert.deepEqual(normalizeHeraWeek([day([entrada(' 08:00 '), salida('12:00')], 2)], [monday]), [
    day(first, 2),
  ]);
  assert.equal(heraWeekPlan([day([], 2)], [], zone).days[0]!.pendingRequests, 2);
  for (const malformed of [
    null,
    [],
    [day(), day()],
    [null],
    [{ ...day(), date: '2026-11-10' }],
    [{ ...day(), accesses: 'entrada' }],
    [{ ...day(), accesses: [null] }],
    [{ ...day(), accesses: [{ kind: 'e', time: '08:00' }] }],
    [day([entrada('24:00')])],
    [day([salida('12:60')])],
    [day([], -1)],
    [day([], 1.5)],
    [{ ...day(), pendingRequests: '1' }],
    [{ ...day([]), outOfRange: false }],
    [{ ...day(), outOfRange: true }],
  ]) {
    assert.throws(() => normalizeHeraWeek(malformed, [monday]), /datos de fichaje no válidos/);
  }
});

test('rebuilding a preview detects added, removed or edited Chambapp rows', () => {
  const days = [day([...first, ...second])];
  const signature = (rows: AttendanceRow[]) =>
    heraWeekPlanSignature(heraWeekPlan(days, rows, zone));
  const preview = signature([closed, open]);
  assert.equal(preview, signature([open, closed]));
  for (const rows of [
    [closed],
    [closed, open, { ...open, id: 'new', ...shift('17:00', '18:00') }],
    [{ ...closed, version: closed.version + 1 }, open],
    [closed, { ...open, fin_en: at('16:00') }],
  ]) {
    assert.notEqual(preview, signature(rows));
  }
  const skipped = [day([entrada('08:00')])];
  assert.notEqual(
    heraWeekPlanSignature(heraWeekPlan(skipped, [closed], zone)),
    heraWeekPlanSignature(heraWeekPlan(skipped, [], zone)),
  );
});

const requestRow = {
  date: '2026-03-23',
  originalText: 'E: 12:22',
  changeText: '[ Actualizar ] E: 08:00',
  reason: 'Olvido de fichaje',
  statusText: 'Solicitud Concedida',
  statusClasses: 'label-new label-new-success',
};

test('reads all change requests for a date, including additions and deletions', () => {
  assert.deepEqual(
    normalizeHeraRequests([
      requestRow,
      {
        ...requestRow,
        originalText: '-',
        changeText: '[ Añadir ] S: 16:03',
        statusText: 'Pendiente',
      },
      {
        ...requestRow,
        originalText: 'S: 15:57',
        changeText: '[ Eliminar   acceso ]',
        statusText: 'Rechazada',
      },
    ]),
    [
      {
        date: requestRow.date,
        original: { kind: 'entrada', time: '12:22' },
        operation: 'Actualizar',
        change: { kind: 'entrada', time: '08:00' },
        reason: 'Olvido de fichaje',
        status: 'concedida',
        statusText: 'Solicitud Concedida',
      },
      {
        date: requestRow.date,
        original: null,
        operation: 'Añadir',
        change: { kind: 'salida', time: '16:03' },
        reason: 'Olvido de fichaje',
        status: 'pendiente',
        statusText: 'Pendiente',
      },
      {
        date: requestRow.date,
        original: { kind: 'salida', time: '15:57' },
        operation: 'Eliminar acceso',
        change: null,
        reason: 'Olvido de fichaje',
        status: 'denegada',
        statusText: 'Rechazada',
      },
    ],
  );
});

test('uses the label class as a fallback and preserves unfamiliar status text', () => {
  const items = normalizeHeraRequests(
    ['label-new-success', 'label-new-warning', 'label-new-danger', 'label-new-info'].map(
      (statusClasses) => ({ ...requestRow, statusText: 'En revisión', statusClasses }),
    ),
  );
  assert.deepEqual(
    items.map(({ status, statusText }) => [status, statusText]),
    ['concedida', 'pendiente', 'denegada', 'desconocido'].map((status) => [status, 'En revisión']),
  );
  assert.equal(
    normalizeHeraRequests([{ ...requestRow, statusText: 'Aceptada', statusClasses: '' }])[0]
      ?.status,
    'concedida',
  );
});

test('discards malformed request rows and caps long text fields', () => {
  const items = normalizeHeraRequests([
    { ...requestRow, date: '2026-02-30' },
    { ...requestRow, originalText: '12:22' },
    { ...requestRow, changeText: 'Actualizar E: 08:00' },
    { ...requestRow, changeText: '[ Añadir ] S: 28:00' },
    { ...requestRow, changeText: '[   ] S: 18:00' },
    { ...requestRow, reason: null },
    null,
    {
      ...requestRow,
      changeText: `[ ${'A'.repeat(81)} ] S: 18:00`,
      reason: 'r'.repeat(1001),
      statusText: 'x'.repeat(121),
    },
  ]);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.operation.length, 80);
  assert.equal(items[0]?.reason.length, 1000);
  assert.equal(items[0]?.statusText.length, 120);
  assert.throws(() => normalizeHeraRequests(null), /solicitudes no válidas/);
});
