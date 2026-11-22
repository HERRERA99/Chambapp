import assert from 'node:assert/strict';
import test from 'node:test';
import { dayContext } from '../src/domain/dayContext.ts';
import type { Attendance, TimeEntry } from '../src/domain/models.ts';
import {
  DAY_BLOCK_ITEM_MAX_HEIGHT_PX,
  DAY_BLOCK_ITEM_MIN_HEIGHT_PX,
  buildDayContextTimeline,
  computeItemHeightPx,
} from '../src/features/day-context/dayContextTimeline.ts';

const zone = 'Europe/Madrid';
const base = {
  tasks: [
    { id: 't1', titulo: 'Migrar ERP', proyecto_id: 'p1' },
    { id: 't2', titulo: 'Revisar permisos', proyecto_id: 'p1' },
  ],
  projects: [{ id: 'p1', nombre: 'Cliente A' }],
};

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

test('returns null on an empty day with no attendance, entries, or draft', () => {
  const context = dayContext({ ...base, fichajes: [], entries: [] }, '2026-11-16', zone, {
    now: '2026-11-16T18:00:00+01:00',
  });
  assert.equal(buildDayContextTimeline(context, '2026-11-16T18:00:00+01:00'), null);
});

test('builds two attendance blocks with a pause between them and exact HH:MM items', () => {
  const context = dayContext(
    {
      ...base,
      fichajes: [
        attendance('f1', '2026-11-16T08:17:00+01:00', '2026-11-16T14:20:00+01:00'),
        attendance('f2', '2026-11-16T16:01:00+01:00', '2026-11-16T18:17:00+01:00'),
      ],
      entries: [
        entry('e1', '2026-11-16T08:20:00+01:00', '2026-11-16T10:30:00+01:00'),
        entry('e2', '2026-11-16T11:00:00+01:00', '2026-11-16T14:20:00+01:00', { tarea_id: 't2' }),
      ],
    },
    '2026-11-16',
    zone,
    { now: '2026-11-16T20:00:00+01:00' },
  );
  const timeline = buildDayContextTimeline(context, '2026-11-16T20:00:00+01:00');
  assert.ok(timeline);
  assert.equal(timeline.blocks.length, 2);

  const [first, second] = timeline.blocks;
  assert.equal(first!.kind, 'attendance');
  assert.equal(first!.start, '08:17');
  assert.equal(first!.end, '14:20');
  assert.equal(first!.open, false);
  assert.equal(first!.durationLabel, '6 h 03 min');
  assert.equal(first!.ariaLabel, 'Fichaje 08:17–14:20, 6 h 03 min');
  assert.deepEqual(
    first!.items.map((item) => [item.kind, item.title, item.start, item.end, item.durationLabel]),
    [
      ['gap', 'Sin imputar', '08:17', '08:20', '3 min'],
      ['entry', 'Migrar ERP', '08:20', '10:30', '2 h 10 min'],
      ['gap', 'Sin imputar', '10:30', '11:00', '30 min'],
      ['entry', 'Revisar permisos', '11:00', '14:20', '3 h 20 min'],
    ],
  );

  assert.equal(second!.kind, 'attendance');
  assert.equal(second!.start, '16:01');
  assert.equal(second!.end, '18:17');
  assert.equal(second!.durationLabel, '2 h 16 min');
  assert.deepEqual(
    second!.items.map((item) => [item.kind, item.title, item.start, item.end, item.durationLabel]),
    [['gap', 'Sin imputar', '16:01', '18:17', '2 h 16 min']],
  );

  assert.equal(timeline.pauses.length, 1);
  assert.equal(timeline.pauses[0]!.afterBlockIndex, 0);
  assert.equal(timeline.pauses[0]!.start, '14:20');
  assert.equal(timeline.pauses[0]!.end, '16:01');
  assert.equal(timeline.pauses[0]!.durationLabel, '1 h 41 min');
  assert.equal(timeline.unimputedSeconds, (3 + 30 + 136) * 60);
});

test('clips an entry crossing the end of attendance and places the remainder outside', () => {
  const context = dayContext(
    {
      ...base,
      fichajes: [attendance('f1', '2026-11-16T08:00:00+01:00', '2026-11-16T14:00:00+01:00')],
      entries: [entry('e1', '2026-11-16T13:00:00+01:00', '2026-11-16T15:00:00+01:00')],
    },
    '2026-11-16',
    zone,
    { now: '2026-11-16T18:00:00+01:00' },
  );
  const timeline = buildDayContextTimeline(context, '2026-11-16T18:00:00+01:00');
  assert.ok(timeline);
  assert.equal(timeline.blocks.length, 2);
  assert.deepEqual(timeline.pauses, []);

  const [attBlock, outsideBlock] = timeline.blocks;
  assert.equal(attBlock!.kind, 'attendance');
  assert.deepEqual(
    attBlock!.items.map((item) => [
      item.kind,
      item.title,
      item.start,
      item.end,
      item.durationLabel,
    ]),
    [
      ['gap', 'Sin imputar', '08:00', '13:00', '5 h'],
      ['entry', 'Migrar ERP', '13:00', '14:00', '1 h'],
    ],
  );

  assert.equal(outsideBlock!.kind, 'outside');
  assert.equal(outsideBlock!.ariaLabel, 'Fuera de fichaje, 1 h');
  assert.deepEqual(
    outsideBlock!.items.map((item) => [
      item.kind,
      item.title,
      item.start,
      item.end,
      item.durationLabel,
    ]),
    [['entry', 'Migrar ERP', '14:00', '15:00', '1 h']],
  );
});

test('places entries outside any attendance into a dedicated outside block without gaps', () => {
  const context = dayContext(
    {
      ...base,
      fichajes: [attendance('f1', '2026-11-16T09:00:00+01:00', '2026-11-16T13:00:00+01:00')],
      entries: [
        entry('e1', '2026-11-16T15:00:00+01:00', '2026-11-16T16:30:00+01:00'),
        entry('e2', '2026-11-16T18:00:00+01:00', '2026-11-16T19:00:00+01:00', { tarea_id: 't2' }),
      ],
    },
    '2026-11-16',
    zone,
    { now: '2026-11-16T20:00:00+01:00' },
  );
  const timeline = buildDayContextTimeline(context, '2026-11-16T20:00:00+01:00');
  assert.ok(timeline);
  assert.equal(timeline.blocks.length, 2);

  const outside = timeline.blocks[1]!;
  assert.equal(outside.kind, 'outside');
  assert.equal(outside.durationLabel, '2 h 30 min');
  assert.deepEqual(
    outside.items.map((item) => [item.kind, item.title, item.start, item.end, item.durationLabel]),
    [
      ['entry', 'Migrar ERP', '15:00', '16:30', '1 h 30 min'],
      ['entry', 'Revisar permisos', '18:00', '19:00', '1 h'],
    ],
  );
});

test('shows unimputed gaps at start, middle, and end of an attendance block', () => {
  const context = dayContext(
    {
      ...base,
      fichajes: [attendance('f1', '2026-11-16T08:00:00+01:00', '2026-11-16T12:00:00+01:00')],
      entries: [
        entry('e1', '2026-11-16T08:30:00+01:00', '2026-11-16T09:30:00+01:00'),
        entry('e2', '2026-11-16T10:00:00+01:00', '2026-11-16T11:30:00+01:00', { tarea_id: 't2' }),
      ],
    },
    '2026-11-16',
    zone,
    { now: '2026-11-16T18:00:00+01:00' },
  );
  const timeline = buildDayContextTimeline(context, '2026-11-16T18:00:00+01:00');
  assert.ok(timeline);
  assert.deepEqual(
    timeline.blocks[0]!.items.map((item) => [item.kind, item.start, item.end, item.durationLabel]),
    [
      ['gap', '08:00', '08:30', '30 min'],
      ['entry', '08:30', '09:30', '1 h'],
      ['gap', '09:30', '10:00', '30 min'],
      ['entry', '10:00', '11:30', '1 h 30 min'],
      ['gap', '11:30', '12:00', '30 min'],
    ],
  );
  assert.equal(timeline.unimputedSeconds, 90 * 60);
});

test('omits unimputed gaps shorter than 1 minute', () => {
  const context = dayContext(
    {
      ...base,
      fichajes: [attendance('f1', '2026-11-16T08:00:00+01:00', '2026-11-16T10:00:00+01:00')],
      entries: [
        entry('e1', '2026-11-16T08:00:45+01:00', '2026-11-16T09:00:00+01:00'),
        entry('e2', '2026-11-16T09:00:30+01:00', '2026-11-16T09:59:20+01:00', { tarea_id: 't2' }),
      ],
    },
    '2026-11-16',
    zone,
    { now: '2026-11-16T18:00:00+01:00' },
  );
  const timeline = buildDayContextTimeline(context, '2026-11-16T18:00:00+01:00');
  assert.ok(timeline);
  assert.deepEqual(
    timeline.blocks[0]!.items.map((item) => item.kind),
    ['entry', 'entry'],
  );
});

test('extends open attendance until now and marks uncovered tail as unimputed', () => {
  const now = '2026-11-16T12:15:00+01:00';
  const context = dayContext(
    {
      ...base,
      fichajes: [attendance('open', '2026-11-16T09:30:00+01:00', null)],
      entries: [entry('e1', '2026-11-16T09:30:00+01:00', '2026-11-16T11:00:00+01:00')],
    },
    '2026-11-16',
    zone,
    { now },
  );
  const timeline = buildDayContextTimeline(context, now);
  assert.ok(timeline);
  const block = timeline.blocks[0]!;
  assert.equal(block.kind, 'attendance');
  assert.equal(block.open, true);
  assert.equal(block.start, '09:30');
  assert.equal(block.end, null);
  assert.equal(block.durationLabel, '2 h 45 min');
  assert.equal(block.ariaLabel, 'Fichaje 09:30–en curso, 2 h 45 min');
  assert.deepEqual(
    block.items.map((item) => [item.kind, item.start, item.end, item.durationLabel]),
    [
      ['entry', '09:30', '11:00', '1 h 30 min'],
      ['gap', '11:00', '12:15', '1 h 15 min'],
    ],
  );
});

test('places the edited draft inside attendance in order or outside when unclocked', () => {
  const insideContext = dayContext(
    {
      ...base,
      fichajes: [attendance('f1', '2026-11-16T08:00:00+01:00', '2026-11-16T14:00:00+01:00')],
      entries: [entry('e1', '2026-11-16T08:00:00+01:00', '2026-11-16T10:00:00+01:00')],
    },
    '2026-11-16',
    zone,
    {
      now: '2026-11-16T18:00:00+01:00',
      draft: {
        start: '2026-11-16T10:00:00+01:00',
        end: '2026-11-16T12:00:00+01:00',
      },
    },
  );
  const inside = buildDayContextTimeline(insideContext, '2026-11-16T18:00:00+01:00');
  assert.ok(inside);
  assert.equal(inside.blocks.length, 1);
  assert.deepEqual(
    inside.blocks[0]!.items.map((item) => [
      item.kind,
      item.title,
      item.start,
      item.end,
      item.durationLabel,
      Boolean(item.overlap),
    ]),
    [
      ['entry', 'Migrar ERP', '08:00', '10:00', '2 h', false],
      ['draft', 'Este parte', '10:00', '12:00', '2 h', false],
      ['gap', 'Sin imputar', '12:00', '14:00', '2 h', false],
    ],
  );

  const outsideContext = dayContext(
    {
      ...base,
      fichajes: [attendance('f1', '2026-11-16T08:00:00+01:00', '2026-11-16T14:00:00+01:00')],
      entries: [],
    },
    '2026-11-16',
    zone,
    {
      now: '2026-11-16T18:00:00+01:00',
      draft: {
        start: '2026-11-16T15:30:00+01:00',
        end: '2026-11-16T17:00:00+01:00',
      },
    },
  );
  const outside = buildDayContextTimeline(outsideContext, '2026-11-16T18:00:00+01:00');
  assert.ok(outside);
  assert.equal(outside.blocks.length, 2);
  assert.equal(outside.blocks[1]!.kind, 'outside');
  assert.deepEqual(
    outside.blocks[1]!.items.map((item) => [
      item.kind,
      item.title,
      item.start,
      item.end,
      item.durationLabel,
    ]),
    [['draft', 'Este parte', '15:30', '17:00', '1 h 30 min']],
  );
});

test('marks overlapping draft and entries without false positives on touching boundaries', () => {
  const context = dayContext(
    {
      ...base,
      fichajes: [attendance('f1', '2026-11-16T08:00:00+01:00', '2026-11-16T14:00:00+01:00')],
      entries: [
        entry('e1', '2026-11-16T09:00:00+01:00', '2026-11-16T10:30:00+01:00'),
        entry('e2', '2026-11-16T11:30:00+01:00', '2026-11-16T12:30:00+01:00', { tarea_id: 't2' }),
      ],
    },
    '2026-11-16',
    zone,
    {
      now: '2026-11-16T18:00:00+01:00',
      draft: {
        start: '2026-11-16T10:00:00+01:00',
        end: '2026-11-16T11:30:00+01:00',
      },
    },
  );
  const timeline = buildDayContextTimeline(context, '2026-11-16T18:00:00+01:00');
  assert.ok(timeline);
  assert.deepEqual(
    timeline.blocks[0]!.items.map((item) => [
      item.kind,
      item.start,
      item.end,
      Boolean(item.overlap),
    ]),
    [
      ['gap', '08:00', '09:00', false],
      ['entry', '09:00', '10:30', true],
      ['draft', '10:00', '11:30', true],
      ['entry', '11:30', '12:30', false],
      ['gap', '12:30', '14:00', false],
    ],
  );

  const openDraftContext = dayContext(
    {
      ...base,
      fichajes: [],
      entries: [entry('later', '2026-11-16T11:00:00+01:00', '2026-11-16T12:00:00+01:00')],
    },
    '2026-11-16',
    zone,
    {
      now: '2026-11-16T10:00:00+01:00',
      draft: { start: '2026-11-16T10:00:00+01:00', end: null },
    },
  );
  const openTimeline = buildDayContextTimeline(openDraftContext, '2026-11-16T10:00:00+01:00');
  assert.ok(openTimeline);
  assert.equal(openTimeline.blocks[0]!.kind, 'outside');
  assert.deepEqual(
    openTimeline.blocks[0]!.items.map((item) => [
      item.kind,
      item.start,
      item.end,
      Boolean(item.open),
      Boolean(item.overlap),
    ]),
    [
      ['draft', '10:00', null, true, true],
      ['entry', '11:00', '12:00', false, true],
    ],
  );
});

test('clamps intervals crossing midnight to HH:MM on the shown day and clamps row heights', () => {
  const context = dayContext(
    {
      ...base,
      fichajes: [],
      entries: [entry('night', '2026-11-15T23:00:00+01:00', '2026-11-16T01:00:00+01:00')],
    },
    '2026-11-16',
    zone,
    { now: '2026-11-16T12:00:00+01:00' },
  );
  const timeline = buildDayContextTimeline(context, '2026-11-16T12:00:00+01:00');
  assert.ok(timeline);
  const item = timeline.blocks[0]!.items[0]!;
  assert.equal(item.start, '00:00');
  assert.equal(item.end, '01:00');
  assert.equal(item.durationLabel, '1 h');

  assert.equal(computeItemHeightPx(5 * 60), DAY_BLOCK_ITEM_MIN_HEIGHT_PX);
  assert.ok(computeItemHeightPx(2 * 3600) > computeItemHeightPx(1 * 3600));
  assert.equal(computeItemHeightPx(10 * 3600), DAY_BLOCK_ITEM_MAX_HEIGHT_PX);
});
