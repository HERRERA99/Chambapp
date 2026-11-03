import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_SUBTRACTIONS,
  subtractTime,
  sumDurations,
} from '../src/features/calculators/calculators.model.ts';

test('adds every subtraction row before subtracting from the reference time', () => {
  const total = sumDurations([
    { hours: '1', minutes: '30' },
    { hours: '2', minutes: '15' },
  ]);
  assert.equal(total, 225);
  assert.deepEqual(subtractTime('17:30', total!), { time: '13:45', dayOffset: 0 });
  assert.equal(sumDurations([{ hours: '1', minutes: '45' }]), 105);
  // Crossing midnight with several rows.
  assert.deepEqual(
    subtractTime(
      '01:00',
      sumDurations([
        { hours: '0', minutes: '45' },
        { hours: '1', minutes: '0' },
      ])!,
    ),
    { time: '23:15', dayOffset: -1 },
  );
});

test('any invalid or empty row, no rows or too many rows give no total', () => {
  assert.equal(
    sumDurations([
      { hours: '1', minutes: '30' },
      { hours: '', minutes: '10' },
    ]),
    null,
  );
  assert.equal(sumDurations([{ hours: '1', minutes: '60' }]), null);
  assert.equal(sumDurations([]), null);
  const many = Array.from({ length: MAX_SUBTRACTIONS + 1 }, () => ({ hours: '0', minutes: '1' }));
  assert.equal(sumDurations(many), null);
  assert.equal(sumDurations(many.slice(0, MAX_SUBTRACTIONS)), MAX_SUBTRACTIONS);
});
