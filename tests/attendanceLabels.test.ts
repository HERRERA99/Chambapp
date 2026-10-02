import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatAttendanceDuration,
  formatImputedPercent,
} from '../src/features/attendance/attendanceLabels.ts';

test('attendance labels preserve elapsed seconds instead of showing rounded decimal hours or minutes', () => {
  assert.equal(formatAttendanceDuration(4 * 3600 + 8 * 60 + 17), '04:08:17');
  assert.equal(formatAttendanceDuration(59), '00:00:59');
  assert.equal(formatAttendanceDuration(60), '00:01:00');
  assert.equal(formatAttendanceDuration(40 * 3600 + 12 * 60 + 3), '40:12:03');
  assert.equal(formatAttendanceDuration(101 * 3600 + 2), '101:00:02');
});

test('attendance labels retain milliseconds and do not round up a time boundary', () => {
  assert.equal(formatAttendanceDuration(59.999), '00:00:59.999');
  assert.equal(formatAttendanceDuration(59.99999), '00:00:59.999');
  assert.equal(formatAttendanceDuration(1.001 + 2.002), '00:00:03.003');
  assert.equal(formatAttendanceDuration(3600.007), '01:00:00.007');
});

test('zero and invalid durations remain clear, independently from the imputation percentage', () => {
  assert.equal(formatAttendanceDuration(0), '00:00:00');
  assert.equal(formatAttendanceDuration(-3), '00:00:00');
  assert.equal(formatAttendanceDuration(NaN), '—');
  assert.equal(formatAttendanceDuration(Infinity), '—');
  assert.equal(formatImputedPercent(null), 'Sin fichajes');
  assert.equal(formatImputedPercent(125), '125%');
});
