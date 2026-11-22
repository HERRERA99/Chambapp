import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDayTimeline,
  formatReadableDuration,
} from '../src/features/week/components/dayTimeline.model.ts';

const zone = 'Europe/Madrid';
const now = '2026-11-16T18:00:00+01:00';

test('formats readable durations as hours and padded minutes without seconds', () => {
  assert.equal(formatReadableDuration(0), '0 min');
  assert.equal(formatReadableDuration(59), '0 min');
  assert.equal(formatReadableDuration(54 * 60), '54 min');
  assert.equal(formatReadableDuration(2 * 3600), '2 h');
  assert.equal(formatReadableDuration(2 * 3600 + 15 * 60), '2 h 15 min');
  assert.equal(formatReadableDuration(6 * 3600 + 9 * 60 + 45), '6 h 09 min');
});

test('computes gaps at start, middle and end with rounded hour axis and accessible summary', () => {
  const timeline = buildDayTimeline({
    attendance: [
      { id: 'a1', start: '2026-11-16T10:14:00+01:00', end: '2026-11-16T16:23:00+01:00' },
    ],
    entries: [
      {
        id: 'e1',
        task: 'Diseño',
        start: '2026-11-16T10:30:00+01:00',
        end: '2026-11-16T12:30:00+01:00',
      },
      {
        id: 'e2',
        task: 'Desarrollo',
        start: '2026-11-16T13:00:00+01:00',
        end: '2026-11-16T16:15:00+01:00',
      },
    ],
    zone,
    now,
  });

  assert.ok(timeline);
  assert.deepEqual(
    timeline.ticks.map((tick) => tick.label),
    ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'],
  );
  assert.equal(timeline.attendance.length, 1);
  assert.equal(timeline.attendance[0]!.open, false);
  assert.equal(timeline.entries.length, 2);
  assert.equal(timeline.entries[0]!.title, 'Diseño · 10:30–12:30 · 2 h');
  assert.equal(timeline.entries[1]!.title, 'Desarrollo · 13:00–16:15 · 3 h 15 min');
  assert.deepEqual(
    timeline.gaps.map((gap) => [gap.startLabel, gap.endLabel, gap.seconds]),
    [
      ['10:14', '10:30', 16 * 60],
      ['12:30', '13:00', 30 * 60],
      ['16:15', '16:23', 8 * 60],
    ],
  );
  assert.equal(timeline.unimputedSeconds, 54 * 60);
  assert.equal(
    timeline.ariaLabel,
    'Fichado 10:14–16:23; partes 5 h 15 min; sin imputar 54 min',
  );
});

test('does not mark breaks between split attendance shifts as unimputed gaps', () => {
  const timeline = buildDayTimeline({
    attendance: [
      { id: 'a1', start: '2026-11-16T09:00:00+01:00', end: '2026-11-16T13:00:00+01:00' },
      { id: 'a2', start: '2026-11-16T14:00:00+01:00', end: '2026-11-16T18:00:00+01:00' },
    ],
    entries: [
      {
        id: 'e1',
        task: 'Mañana',
        start: '2026-11-16T09:00:00+01:00',
        end: '2026-11-16T13:00:00+01:00',
      },
      {
        id: 'e2',
        task: 'Tarde',
        start: '2026-11-16T14:00:00+01:00',
        end: '2026-11-16T17:00:00+01:00',
      },
    ],
    zone,
    now,
  });

  assert.ok(timeline);
  assert.deepEqual(
    timeline.ticks.map((tick) => tick.label),
    ['09:00', '11:00', '13:00', '15:00', '17:00'],
  );
  assert.deepEqual(
    timeline.gaps.map((gap) => [gap.startLabel, gap.endLabel]),
    [['17:00', '18:00']],
  );
  assert.equal(timeline.unimputedSeconds, 3600);
});

test('handles parts completely or partially outside attendance without creating negative gaps', () => {
  const timeline = buildDayTimeline({
    attendance: [
      { id: 'a1', start: '2026-11-16T10:00:00+01:00', end: '2026-11-16T14:00:00+01:00' },
    ],
    entries: [
      {
        id: 'before',
        task: 'Antes',
        start: '2026-11-16T08:15:00+01:00',
        end: '2026-11-16T09:00:00+01:00',
      },
      {
        id: 'overlap-end',
        task: 'Cierre',
        start: '2026-11-16T13:30:00+01:00',
        end: '2026-11-16T15:15:00+01:00',
      },
    ],
    zone,
    now,
  });

  assert.ok(timeline);
  assert.equal(timeline.ticks[0]!.label, '08:00');
  assert.equal(timeline.ticks.at(-1)!.label, '16:00');
  assert.deepEqual(
    timeline.gaps.map((gap) => [gap.startLabel, gap.endLabel, gap.seconds]),
    [['10:00', '13:30', 3.5 * 3600]],
  );
  assert.equal(timeline.entries.length, 2);

  const entriesOnly = buildDayTimeline({
    attendance: [],
    entries: [
      {
        id: 'solo',
        task: 'Revisión',
        start: '2026-11-16T10:15:00+01:00',
        end: '2026-11-16T12:30:00+01:00',
      },
    ],
    zone,
    now,
  });
  assert.ok(entriesOnly);
  assert.deepEqual(entriesOnly.gaps, []);
  assert.equal(entriesOnly.unimputedSeconds, 0);
  assert.equal(entriesOnly.ariaLabel, 'Sin fichajes; partes 2 h 15 min');
});

test('extends open attendance until now and marks uncovered tail as unimputed', () => {
  const timeline = buildDayTimeline({
    attendance: [{ id: 'open', start: '2026-11-16T09:30:00+01:00', end: null }],
    entries: [
      {
        id: 'e1',
        task: 'Soporte',
        start: '2026-11-16T09:30:00+01:00',
        end: '2026-11-16T11:00:00+01:00',
      },
    ],
    zone,
    now: '2026-11-16T12:15:00+01:00',
  });

  assert.ok(timeline);
  assert.equal(timeline.attendance[0]!.open, true);
  assert.equal(timeline.attendance[0]!.endLabel, null);
  assert.equal(timeline.attendance[0]!.seconds, 2.75 * 3600);
  assert.deepEqual(
    timeline.gaps.map((gap) => [gap.startLabel, gap.endLabel]),
    [['11:00', '12:15']],
  );
  assert.equal(
    timeline.ariaLabel,
    'Fichado 09:30–en curso; partes 1 h 30 min; sin imputar 1 h 15 min',
  );
});

test('returns null on empty days and stays valid on zero-length just-opened attendance', () => {
  assert.equal(buildDayTimeline({ attendance: [], entries: [], zone, now }), null);

  const justOpened = buildDayTimeline({
    attendance: [{ id: 'now', start: '2026-11-16T10:00:00+01:00', end: null }],
    entries: [],
    zone,
    now: '2026-11-16T10:00:00+01:00',
  });
  assert.ok(justOpened);
  assert.equal(justOpened.attendance[0]!.leftPercent, 0);
  assert.equal(justOpened.attendance[0]!.widthPercent, 0);
  assert.deepEqual(
    justOpened.ticks.map((tick) => tick.label),
    ['10:00', '11:00'],
  );
});

test('merges overlapping entries to report full coverage without gaps and handles running entries', () => {
  const full = buildDayTimeline({
    attendance: [
      { id: 'a1', start: '2026-11-16T09:00:00+01:00', end: '2026-11-16T12:00:00+01:00' },
    ],
    entries: [
      {
        id: 'e1',
        task: 'Análisis',
        start: '2026-11-16T09:00:00+01:00',
        end: '2026-11-16T11:00:00+01:00',
      },
      {
        id: 'e2',
        task: 'Implementación',
        start: '2026-11-16T10:30:00+01:00',
        end: '2026-11-16T12:00:00+01:00',
      },
    ],
    zone,
    now,
  });
  assert.ok(full);
  assert.deepEqual(full.gaps, []);
  assert.equal(full.unimputedSeconds, 0);
  assert.equal(full.ariaLabel, 'Fichado 09:00–12:00; partes 3 h 30 min; todo imputado');

  const running = buildDayTimeline({
    attendance: [{ id: 'a1', start: '2026-11-16T09:00:00+01:00', end: null }],
    entries: [{ id: 'e1', task: 'En vivo', start: '2026-11-16T09:00:00+01:00', end: null }],
    zone,
    now: '2026-11-16T10:30:00+01:00',
  });
  assert.ok(running);
  assert.equal(running.entries[0]!.running, true);
  assert.equal(running.entries[0]!.title, 'En vivo · 09:00–en curso · 1 h 30 min');
  assert.deepEqual(running.gaps, []);
});
