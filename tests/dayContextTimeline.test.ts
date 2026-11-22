import assert from 'node:assert/strict';
import test from 'node:test';
import { dayContext } from '../src/domain/dayContext.ts';
import type { Attendance, TimeEntry } from '../src/domain/models.ts';
import {
  DAY_TIMELINE_MIN_HOURS,
  DAY_TIMELINE_PX_PER_HOUR,
  buildDayContextTimeline,
} from '../src/features/day-context/dayContextTimeline.ts';

const zone = 'Europe/Madrid';
const base = {
  tasks: [
    { id: 't1', titulo: 'Desarrollo', proyecto_id: 'p1' },
    { id: 't2', titulo: 'Reunión', proyecto_id: 'p1' },
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

test('enforces a minimum 4-hour vertical range and stays within the day near midnight', () => {
  const shortContext = dayContext(
    {
      ...base,
      fichajes: [attendance('f1', '2026-11-16T09:15:00+01:00', '2026-11-16T10:30:00+01:00')],
      entries: [],
    },
    '2026-11-16',
    zone,
    { now: '2026-11-16T18:00:00+01:00' },
  );
  const shortTimeline = buildDayContextTimeline(shortContext, '2026-11-16T18:00:00+01:00');
  assert.ok(shortTimeline);
  assert.equal(shortTimeline.totalHours, DAY_TIMELINE_MIN_HOURS);
  assert.equal(shortTimeline.heightPx, DAY_TIMELINE_MIN_HOURS * DAY_TIMELINE_PX_PER_HOUR);
  assert.deepEqual(
    shortTimeline.ticks.map((tick) => tick.label),
    ['09:00', '10:00', '11:00', '12:00', '13:00'],
  );
  assert.equal(shortTimeline.attendance[0]!.topPercent, (15 / 240) * 100);
  assert.equal(shortTimeline.attendance[0]!.heightPercent, (75 / 240) * 100);

  const lateContext = dayContext(
    {
      ...base,
      fichajes: [attendance('f2', '2026-11-16T22:30:00+01:00', '2026-11-16T23:15:00+01:00')],
      entries: [],
    },
    '2026-11-16',
    zone,
    { now: '2026-11-16T23:30:00+01:00' },
  );
  const lateTimeline = buildDayContextTimeline(lateContext, '2026-11-16T23:30:00+01:00');
  assert.ok(lateTimeline);
  assert.equal(lateTimeline.totalHours, DAY_TIMELINE_MIN_HOURS);
  assert.deepEqual(
    lateTimeline.ticks.map((tick) => tick.label),
    ['20:00', '21:00', '22:00', '23:00', '00:00'],
  );
  assert.equal(lateTimeline.attendance[0]!.topPercent, (150 / 240) * 100);
});

test('computes hourly ticks, proportional blocks, gaps, and summary for a normal day', () => {
  const context = dayContext(
    {
      ...base,
      fichajes: [attendance('f1', '2026-11-16T10:14:00+01:00', '2026-11-16T16:23:00+01:00')],
      entries: [
        entry('e1', '2026-11-16T10:30:00+01:00', '2026-11-16T12:30:00+01:00'),
        entry('e2', '2026-11-16T13:00:00+01:00', '2026-11-16T16:15:00+01:00', { tarea_id: 't2' }),
      ],
    },
    '2026-11-16',
    zone,
    { now: '2026-11-16T18:00:00+01:00' },
  );
  const timeline = buildDayContextTimeline(context, '2026-11-16T18:00:00+01:00');
  assert.ok(timeline);
  assert.equal(timeline.totalHours, 7);
  assert.deepEqual(
    timeline.ticks.map((tick) => tick.label),
    ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'],
  );
  assert.equal(timeline.entries.length, 2);
  assert.equal(timeline.entries[0]!.durationLabel, '2 h');
  assert.equal(timeline.entries[0]!.lane, 0);
  assert.equal(timeline.entries[0]!.laneCount, 1);
  assert.deepEqual(
    timeline.gaps.map((gap) => [gap.startLabel, gap.endLabel, gap.durationLabel]),
    [
      ['10:14', '10:30', '16 min'],
      ['12:30', '13:00', '30 min'],
      ['16:15', '16:23', '8 min'],
    ],
  );
  assert.equal(timeline.unimputedSeconds, 54 * 60);
  assert.equal(
    timeline.ariaLabel,
    'Fichado 10:14–16:23 (6 h 09 min); 2 partes (5 h 15 min); sin imputar 54 min',
  );
});

test('edited draft expands the vertical range earlier and later than attendance', () => {
  const earlierContext = dayContext(
    {
      ...base,
      fichajes: [attendance('f1', '2026-11-16T10:00:00+01:00', '2026-11-16T14:00:00+01:00')],
      entries: [],
    },
    '2026-11-16',
    zone,
    {
      now: '2026-11-16T18:00:00+01:00',
      draft: {
        start: '2026-11-16T08:15:00+01:00',
        end: '2026-11-16T09:30:00+01:00',
      },
    },
  );
  const earlier = buildDayContextTimeline(earlierContext, '2026-11-16T18:00:00+01:00');
  assert.ok(earlier);
  assert.deepEqual(
    earlier.ticks.map((tick) => tick.label),
    ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00'],
  );
  assert.ok(earlier.draft);
  assert.equal(earlier.draft.durationLabel, '1 h 15 min');
  assert.equal(earlier.draft.hasOverlap, false);
  assert.deepEqual(earlier.overlapSegments, []);

  const laterContext = dayContext(
    {
      ...base,
      fichajes: [attendance('f1', '2026-11-16T10:00:00+01:00', '2026-11-16T14:00:00+01:00')],
      entries: [],
    },
    '2026-11-16',
    zone,
    {
      now: '2026-11-16T18:00:00+01:00',
      draft: {
        start: '2026-11-16T15:30:00+01:00',
        end: '2026-11-16T17:15:00+01:00',
      },
    },
  );
  const later = buildDayContextTimeline(laterContext, '2026-11-16T18:00:00+01:00');
  assert.ok(later);
  assert.equal(later.ticks[0]!.label, '10:00');
  assert.equal(later.ticks.at(-1)!.label, '18:00');
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
  assert.equal(timeline.attendance[0]!.open, true);
  assert.equal(timeline.attendance[0]!.endLabel, null);
  assert.equal(timeline.attendance[0]!.seconds, 2.75 * 3600);
  assert.equal(timeline.totalHours, DAY_TIMELINE_MIN_HOURS);
  assert.deepEqual(
    timeline.ticks.map((tick) => tick.label),
    ['09:00', '10:00', '11:00', '12:00', '13:00'],
  );
  assert.deepEqual(
    timeline.gaps.map((gap) => [gap.startLabel, gap.endLabel]),
    [['11:00', '12:15']],
  );
  assert.equal(timeline.unimputedSeconds, 75 * 60);
});

test('computes red overlap segments for closed and open drafts without false positives on touching entries', () => {
  const context = dayContext(
    {
      ...base,
      fichajes: [],
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
  assert.ok(timeline.draft);
  assert.equal(timeline.draft.hasOverlap, true);
  assert.equal(timeline.entries[0]!.overlapsDraft, true);
  assert.equal(timeline.entries[1]!.overlapsDraft, false, 'touching at 11:30 is not an overlap');
  assert.equal(timeline.overlapSegments.length, 1);
  assert.equal(timeline.overlapSegments[0]!.startLabel, '10:00');
  assert.equal(timeline.overlapSegments[0]!.endLabel, '10:30');
  assert.equal(timeline.overlapSegments[0]!.durationLabel, '30 min');
  assert.deepEqual(timeline.overlapSegments[0]!.tasks, ['Desarrollo']);
  assert.match(timeline.ariaLabel, /se solapa con otro parte/);

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
  assert.ok(openTimeline?.draft);
  assert.equal(openTimeline.draft.open, true);
  assert.equal(openTimeline.overlapSegments.length, 1);
  assert.equal(openTimeline.overlapSegments[0]!.startLabel, '11:00');
  assert.equal(openTimeline.overlapSegments[0]!.endLabel, '12:00');
});

test('assigns side-by-side lanes when two existing entries overlap each other', () => {
  const context = dayContext(
    {
      ...base,
      fichajes: [],
      entries: [
        entry('e1', '2026-11-16T09:00:00+01:00', '2026-11-16T11:00:00+01:00'),
        entry('e2', '2026-11-16T10:00:00+01:00', '2026-11-16T12:00:00+01:00', { tarea_id: 't2' }),
        entry('e3', '2026-11-16T13:00:00+01:00', '2026-11-16T14:00:00+01:00'),
      ],
    },
    '2026-11-16',
    zone,
    { now: '2026-11-16T18:00:00+01:00' },
  );
  const timeline = buildDayContextTimeline(context, '2026-11-16T18:00:00+01:00');
  assert.ok(timeline);
  assert.deepEqual(
    timeline.entries.map((item) => [item.id, item.lane, item.laneCount]),
    [
      ['e1', 0, 2],
      ['e2', 1, 2],
      ['e3', 0, 1],
    ],
  );
});

test('clamps intervals crossing midnight to the shown day', () => {
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
  assert.equal(timeline.totalHours, DAY_TIMELINE_MIN_HOURS);
  assert.deepEqual(
    timeline.ticks.map((tick) => tick.label),
    ['00:00', '01:00', '02:00', '03:00', '04:00'],
  );
  assert.equal(timeline.entries[0]!.topPercent, 0);
  assert.equal(timeline.entries[0]!.heightPercent, 25);
  assert.equal(timeline.entries[0]!.durationLabel, '1 h');
});
