import assert from 'node:assert/strict';
import test from 'node:test';
import { dayContext } from '../src/domain/dayContext.ts';
import type { Attendance, TimeEntry } from '../src/domain/models.ts';

const zone = 'Europe/Madrid';
const entry = (id: string, start: string, end: string | null, extra: Partial<TimeEntry> = {}) =>
  ({
    id,
    tarea_id: 't1',
    inicio_en: start,
    fin_en: end,
    eliminado_en: null,
    descripcion: null,
    ...extra,
  }) as TimeEntry;
const attendance = (
  id: string,
  start: string,
  end: string | null,
  extra: Partial<Attendance> = {},
) => ({ id, inicio_en: start, fin_en: end, eliminado_en: null, ...extra }) as Attendance;
const base = {
  tasks: [
    { id: 't1', titulo: 'Desarrollo', proyecto_id: 'p1' },
    { id: 't2', titulo: 'Reunión', proyecto_id: 'p1' },
  ],
  projects: [{ id: 'p1', nombre: 'Cliente A' }],
};

test('lists the day attendance and entries in order, with totals and first in / last out', () => {
  const context = dayContext(
    {
      ...base,
      fichajes: [
        attendance('f2', '2026-09-21T13:00:00+02:00', '2026-09-21T17:30:00+02:00'),
        attendance('f1', '2026-09-21T08:00:00+02:00', '2026-09-21T12:00:00+02:00'),
        attendance('old', '2026-09-20T08:00:00+02:00', '2026-09-20T09:00:00+02:00'),
        attendance('gone', '2026-09-21T18:00:00+02:00', '2026-09-21T19:00:00+02:00', {
          eliminado_en: '2026-09-21T20:00:00Z',
        }),
      ],
      entries: [
        entry('e2', '2026-09-21T10:00:00+02:00', '2026-09-21T11:30:00+02:00', { tarea_id: 't2' }),
        entry('e1', '2026-09-21T08:15:00+02:00', '2026-09-21T10:00:00+02:00'),
        entry('other-day', '2026-09-22T08:00:00+02:00', '2026-09-22T09:00:00+02:00'),
      ],
    },
    '2026-09-21',
    zone,
    { now: '2026-09-21T20:00:00+02:00' },
  );
  assert.deepEqual(
    context.attendance.map((row) => [row.id, row.startLabel, row.endLabel]),
    [
      ['f1', '08:00', '12:00'],
      ['f2', '13:00', '17:30'],
    ],
  );
  assert.equal(context.attendanceSeconds, 8.5 * 3600);
  assert.equal(context.firstIn, '08:00');
  assert.equal(context.lastOut, '17:30');
  assert.deepEqual(
    context.entries.map((row) => [row.id, row.task, row.project]),
    [
      ['e1', 'Desarrollo', 'Cliente A'],
      ['e2', 'Reunión', 'Cliente A'],
    ],
  );
  assert.equal(context.entrySeconds, 3.25 * 3600);
  assert.equal(context.draft, null);
  assert.deepEqual(context.overlaps, []);
});

test('running attendance and entries count until now and have no exit', () => {
  const context = dayContext(
    {
      ...base,
      fichajes: [attendance('f1', '2026-09-21T09:00:00+02:00', null)],
      entries: [entry('e1', '2026-09-21T09:30:00+02:00', null)],
    },
    '2026-09-21',
    zone,
    { now: '2026-09-21T11:00:00+02:00' },
  );
  assert.equal(context.attendanceSeconds, 2 * 3600);
  assert.equal(context.lastOut, null);
  assert.equal(context.entries[0]!.running, true);
  assert.equal(context.entries[0]!.endLabel, null);
  assert.equal(context.entrySeconds, 1.5 * 3600);
});

test('intervals crossing midnight count only their part of the day and show the other date', () => {
  const context = dayContext(
    {
      ...base,
      fichajes: [],
      entries: [entry('night', '2026-09-20T23:00:00+02:00', '2026-09-21T01:00:00+02:00')],
    },
    '2026-09-21',
    zone,
    { now: '2026-09-21T12:00:00+02:00' },
  );
  assert.equal(context.entries.length, 1);
  assert.equal(context.entries[0]!.seconds, 3600);
  assert.match(context.entries[0]!.startLabel, /^23:00 \(20 sept?\.?\)$/);
  assert.equal(context.entries[0]!.endLabel, '01:00');
});

test('a 25-hour DST day counts the repeated hour', () => {
  const context = dayContext(
    {
      ...base,
      fichajes: [attendance('f1', '2026-10-25T00:00:00+02:00', '2026-10-26T00:00:00+01:00')],
      entries: [],
    },
    '2026-10-25',
    zone,
    { now: '2026-10-27T00:00:00+01:00' },
  );
  assert.equal(context.attendanceSeconds, 25 * 3600);
});

test('the edited entry is the draft; overlaps with other entries are reported', () => {
  const data = {
    ...base,
    fichajes: [],
    entries: [
      entry('a', '2026-09-21T09:00:00+02:00', '2026-09-21T10:00:00+02:00'),
      entry('b', '2026-09-21T10:00:00+02:00', '2026-09-21T11:00:00+02:00', { tarea_id: 't2' }),
      entry('edited', '2026-09-21T12:00:00+02:00', '2026-09-21T13:00:00+02:00'),
    ],
  };
  const context = dayContext(data, '2026-09-21', zone, {
    now: '2026-09-21T20:00:00+02:00',
    excludeEntryId: 'edited',
    draft: { start: '2026-09-21T09:30:00+02:00', end: '2026-09-21T10:00:00+02:00' },
  });
  assert.deepEqual(
    context.entries.map((row) => row.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    context.overlaps.map((row) => row.id),
    ['a'],
    'touching at 10:00 is not an overlap',
  );
  assert.deepEqual(context.draft, {
    start: '2026-09-21T09:30:00+02:00',
    startLabel: '09:30',
    endLabel: '10:00',
    seconds: 1800,
  });
});

test('an open draft (a timer to start) overlaps entries that end after it and running ones', () => {
  const context = dayContext(
    {
      ...base,
      fichajes: [],
      entries: [
        entry('before', '2026-09-21T08:00:00+02:00', '2026-09-21T09:00:00+02:00'),
        entry('after', '2026-09-21T10:00:00+02:00', '2026-09-21T11:00:00+02:00'),
      ],
    },
    '2026-09-21',
    zone,
    { now: '2026-09-21T12:00:00+02:00', draft: { start: '2026-09-21T09:00:00+02:00', end: null } },
  );
  assert.deepEqual(
    context.overlaps.map((row) => row.id),
    ['after'],
  );
  assert.equal(context.draft!.endLabel, null);
  assert.equal(context.draft!.seconds, null);
});

test('an invalid or incomplete draft is ignored; an empty day has no intervals', () => {
  const context = dayContext({ ...base, fichajes: [], entries: [] }, '2026-09-21', zone, {
    now: '2026-09-21T12:00:00+02:00',
    draft: { start: '2026-09-21T10:00:00+02:00', end: '2026-09-21T09:00:00+02:00' },
  });
  assert.equal(context.draft, null);
  assert.deepEqual(context.entries, []);
  assert.deepEqual(context.attendance, []);
  assert.equal(context.firstIn, null);
  assert.throws(() => dayContext({ ...base, fichajes: [], entries: [] }, 'x', zone, { now: '' }));
});

test('a draft crossing midnight reports overlaps on the next day too', () => {
  const data = {
    ...base,
    fichajes: [],
    entries: [entry('next', '2026-09-22T01:00:00+02:00', '2026-09-22T01:30:00+02:00')],
  };
  const context = dayContext(data, '2026-09-21', zone, {
    now: '2026-09-22T12:00:00+02:00',
    draft: { start: '2026-09-21T23:00:00+02:00', end: '2026-09-22T02:00:00+02:00' },
  });
  assert.deepEqual(context.entries, [], 'the next-day entry is not on the shown day');
  assert.deepEqual(
    context.overlaps.map((row) => row.id),
    ['next'],
  );
  assert.match(context.overlaps[0]!.startLabel, /^01:00 \(22 sept?\.?\)$/);
});

test('a retroactive timer started yesterday overlaps entries recorded today', () => {
  const context = dayContext(
    {
      ...base,
      fichajes: [],
      entries: [entry('today', '2026-09-22T09:00:00+02:00', '2026-09-22T10:00:00+02:00')],
    },
    '2026-09-21',
    zone,
    { now: '2026-09-22T12:00:00+02:00', draft: { start: '2026-09-21T18:00:00+02:00', end: null } },
  );
  assert.deepEqual(
    context.overlaps.map((row) => row.id),
    ['today'],
  );
});
