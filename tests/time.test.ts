import assert from 'node:assert/strict';
import test from 'node:test';
import {
  roundDuration,
  formatClock,
  localDateTimeToIso,
  mondayForDate,
  weekDates,
} from '../src/domain/time.ts';

test('rounds only the full 4h 8min duration upwards using the configured interval', () => {
  const real = 4 * 3600 + 8 * 60;
  assert.equal(roundDuration(real, 15), 4 * 3600 + 15 * 60);
  assert.equal(roundDuration(real, 30), 4 * 3600 + 30 * 60);
  assert.equal(roundDuration(real, 60), 5 * 3600);
  assert.equal(roundDuration(real, 0), real);
});

test('retains zero and exact boundaries, rounds fractional seconds, rejects invalid intervals', () => {
  assert.equal(roundDuration(0, 15), 0);
  assert.equal(roundDuration(900, 15), 900);
  assert.equal(roundDuration(900.001, 15), 1800);
  assert.equal(roundDuration(1, 60), 3600);
  assert.throws(() => roundDuration(-1, 15));
  assert.throws(() => roundDuration(100, 7));
  assert.throws(() => roundDuration(Infinity, 15));
});

test('converts exact timestamps including seconds, without rounding either endpoint', () => {
  assert.equal(
    localDateTimeToIso('2026-10-01', '09:07:14', 'Europe/Madrid'),
    '2026-10-01T07:07:14.000Z',
  );
  assert.equal(
    localDateTimeToIso('2026-10-01', '13:15:14', 'Europe/Madrid'),
    '2026-10-01T11:15:14.000Z',
  );
  assert.equal(formatClock(4 * 3600 + 8 * 60), '04:08:00');
});

test('rejects nonexistent and ambiguous local hours during daylight saving changes', () => {
  assert.throws(() => localDateTimeToIso('2026-03-29', '02:30', 'Europe/Madrid'), /no existe/);
  assert.throws(() => localDateTimeToIso('2026-10-25', '02:30', 'Europe/Madrid'), /se repite/);
  assert.equal(
    localDateTimeToIso('2026-10-25', '03:30', 'Europe/Madrid'),
    '2026-10-25T02:30:00.000Z',
  );
});

test('weeks have seven dates and start on the ISO Monday across month boundaries', () => {
  assert.equal(mondayForDate('2026-10-01'), '2026-09-28');
  assert.deepEqual(weekDates('2026-09-28'), [
    '2026-09-28',
    '2026-09-29',
    '2026-09-30',
    '2026-10-01',
    '2026-10-02',
    '2026-10-03',
    '2026-10-04',
  ]);
});
