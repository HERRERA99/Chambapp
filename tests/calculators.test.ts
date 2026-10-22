import assert from 'node:assert/strict';
import test from 'node:test';
import {
  elapsedMinutes,
  formatMinutes,
  parseDurationMinutes,
  parsePercentage,
  percentageMinutes,
  subtractTime,
  todayWorkedSeconds,
} from '../src/features/calculators/calculators.model.ts';

test('duration fields accept full hours and minutes, including zero and multi-day values', () => {
  assert.equal(parseDurationMinutes('8', '30'), 510);
  assert.equal(parseDurationMinutes('0', '0'), 0);
  assert.equal(parseDurationMinutes('26', '05'), 1565);
  assert.equal(parseDurationMinutes('9999', '59'), 599999);
  for (const [hours, minutes] of [
    ['', '00'],
    ['8', ''],
    [' ', '0'],
    ['-1', '0'],
    ['8.5', '0'],
    ['1e2', '0'],
    ['10000', '0'],
    ['0', '60'],
    ['0', '-1'],
    ['0', '1.5'],
  ])
    assert.equal(parseDurationMinutes(hours!, minutes!), null, `${hours}:${minutes}`);
});

test('percentages support Spanish decimals and reject empty, negative or out-of-range values', () => {
  for (const [input, result] of [
    ['0', 0],
    ['80', 80],
    ['90', 90],
    ['87.5', 87.5],
    ['87,5', 87.5],
    ['.5', 0.5],
    ['100', 100],
  ] as const)
    assert.equal(parsePercentage(input), result);
  for (const input of ['', ' ', '-1', '100.1', 'Infinity', 'NaN', '8e1', '80%'])
    assert.equal(parsePercentage(input), null, input);
});

test('calculates 80%, 90% and a custom percentage, rounding only the final minute', () => {
  assert.equal(percentageMinutes(8 * 3600, 80), 384);
  assert.equal(percentageMinutes(8 * 3600, 90), 432);
  assert.equal(percentageMinutes(8 * 3600, 87.5), 420);
  // Rounding 100 seconds to two minutes first would incorrectly produce two minutes here.
  assert.equal(percentageMinutes(100, 80), 1);
  assert.equal(percentageMinutes(30, 100), 1);
  assert.equal(percentageMinutes(29.999, 100), 0);
  assert.equal(percentageMinutes(0, 90), 0);
  assert.equal(percentageMinutes(3600, 0), 0);
  for (const [seconds, percent] of [
    [-1, 80],
    [Infinity, 80],
    [Number.MAX_SAFE_INTEGER + 1, 80],
    [3600, -1],
    [3600, 101],
    [3600, NaN],
  ])
    assert.throws(() => percentageMinutes(seconds!, percent!));
  assert.equal(formatMinutes(384), '6 h 24 min');
  assert.equal(formatMinutes(0), '0 h 0 min');
  assert.equal(formatMinutes(1565), '26 h 5 min');
  assert.throws(() => formatMinutes(-1));
  assert.throws(() => formatMinutes(1.5));
});

test('elapsed time handles minutes, midnight and explicit next-day spans', () => {
  assert.equal(elapsedMinutes('09:15', '17:45'), 510);
  assert.equal(elapsedMinutes('23:50', '00:10'), 20);
  assert.equal(elapsedMinutes('23:50', '00:10', true), 20);
  assert.equal(elapsedMinutes('08:00', '08:00'), 0);
  assert.equal(elapsedMinutes('08:00', '08:00', true), 1440);
  assert.equal(elapsedMinutes('08:00', '17:00', true), 1980);
  assert.equal(elapsedMinutes('00:00', '23:59', true), 2879);
  for (const [start, end] of [
    ['', '08:00'],
    ['8:00', '09:00'],
    ['24:00', '09:00'],
    ['09:60', '10:00'],
    ['09:00', '10:00:00'],
  ])
    assert.equal(elapsedMinutes(start!, end!), null);
});

test('subtracting time preserves the clock and reports every crossed day', () => {
  assert.deepEqual(subtractTime('17:30', 8 * 60 + 15), { time: '09:15', dayOffset: 0 });
  assert.deepEqual(subtractTime('00:15', 30), { time: '23:45', dayOffset: -1 });
  assert.deepEqual(subtractTime('08:00', 32 * 60), { time: '00:00', dayOffset: -1 });
  assert.deepEqual(subtractTime('08:00', 56 * 60 + 1), { time: '23:59', dayOffset: -3 });
  assert.deepEqual(subtractTime('00:00', 24 * 60), { time: '00:00', dayOffset: -1 });
  assert.deepEqual(subtractTime('17:30', 0), { time: '17:30', dayOffset: 0 });
  for (const minutes of [-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(subtractTime('08:00', minutes), null);
  assert.equal(subtractTime('24:00', 60), null);
});

const session = (inicio_en: string, fin_en: string | null, eliminado_en: string | null = null) => ({
  inicio_en,
  fin_en,
  eliminado_en,
});

test('today attendance counts multiple sessions and open time, excluding breaks and deleted sessions', () => {
  const now = '2026-10-22T13:00:20Z';
  assert.equal(
    todayWorkedSeconds(
      [
        session('2026-10-22T07:00:05Z', '2026-10-22T10:00:15Z'),
        session('2026-10-22T10:30:00Z', null),
        session('2026-10-22T05:00:00Z', '2026-10-22T06:00:00Z', now),
        session('2026-10-22T14:00:00Z', null),
      ],
      'Europe/Madrid',
      now,
    ),
    5 * 3600 + 30 * 60 + 30,
  );
});

test('today attendance uses the profile date and clips overnight and future closed attendance at now', () => {
  assert.equal(
    todayWorkedSeconds(
      [
        session('2026-10-21T21:30:00Z', '2026-10-22T00:30:00Z'),
        session('2026-10-22T01:00:00Z', '2026-10-22T08:00:00Z'),
        session('2026-10-22T06:00:00Z', '2026-10-22T07:00:00Z'),
      ],
      'Europe/Madrid',
      '2026-10-22T03:00:00Z',
    ),
    4 * 3600 + 30 * 60,
  );
  // UTC is already the next day, while this profile is still on October 21.
  assert.equal(
    todayWorkedSeconds(
      [session('2026-10-21T06:00:00Z', '2026-10-21T08:00:00Z')],
      'America/Los_Angeles',
      '2026-10-22T00:00:00Z',
    ),
    3600,
  );
});

test('today attendance preserves seconds across DST boundaries and rejects invalid clocks or zones', () => {
  assert.equal(
    todayWorkedSeconds(
      [session('2026-10-24T22:00:00.125Z', null)],
      'Europe/Madrid',
      '2026-10-25T03:00:00.375Z',
    ),
    5 * 3600 + 0.25,
  );
  assert.equal(todayWorkedSeconds([], 'Europe/Madrid', '2026-10-22T03:00:00Z'), 0);
  assert.throws(() => todayWorkedSeconds([], 'Invalid/Zone', '2026-10-22T03:00:00Z'));
  assert.throws(() => todayWorkedSeconds([], 'Europe/Madrid', 'invalid'));
});
