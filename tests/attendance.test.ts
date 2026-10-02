import assert from 'node:assert/strict';
import test from 'node:test';
import type { Attendance } from '../src/domain/models.ts';
import {
  attendanceDays,
  attendanceInPeriod,
  attendanceTotal,
  estimateServerTime,
  imputedPercent,
} from '../src/domain/attendance.ts';
import {
  attendanceStorageKey,
  clearPendingAttendance,
  isPendingAttendance,
  readPendingAttendance,
  savePendingAttendance,
  withAttendanceLock,
} from '../src/features/attendance/pendingAttendance.ts';

const zone = 'Europe/Madrid';
const now = '2026-10-02T16:00:00Z';
const session = (inicio_en: string, fin_en: string | null, eliminado_en: string | null = null) => ({
  inicio_en,
  fin_en,
  eliminado_en,
});
const entry = (
  inicio_en: string,
  fin_en: string | null,
  duracion_imputada_segundos: number | null,
  eliminado_en: string | null = null,
) => ({ inicio_en, fin_en, duracion_imputada_segundos, eliminado_en });

test('sums multiple sessions without breaks and compares only closed imputed parts', () => {
  const [day] = attendanceDays(
    [
      session('2026-10-02T07:00:00Z', '2026-10-02T11:00:00Z'),
      session('2026-10-02T12:00:00Z', '2026-10-02T15:00:00Z'),
      session('2026-10-02T05:00:00Z', '2026-10-02T06:00:00Z', now),
    ],
    [
      entry('2026-10-02T07:00:00Z', '2026-10-02T10:45:00Z', 4 * 3600),
      entry('2026-10-02T12:00:00Z', null, null),
      entry('2026-10-02T12:00:00Z', '2026-10-02T15:00:00Z', 3 * 3600, now),
    ],
    ['2026-10-02'],
    zone,
    now,
  );
  assert.equal(day!.workedSeconds, 7 * 3600);
  assert.equal(day!.imputedSeconds, 4 * 3600);
  assert.equal(day!.imputedPercent, 57.1);
});

test('keeps exact seconds and fractions when rounded task time is compared with manual attendance', () => {
  const start = '2026-09-01T09:07:12.125+02:00';
  const end = '2026-09-01T10:08:13.375+02:00';
  const [day] = attendanceDays(
    [session(start, end)],
    [entry(start, end, 7200)],
    ['2026-09-01'],
    zone,
    '2026-09-01T12:00:00+02:00',
  );
  assert.equal(day!.closedSeconds, 3661.25);
  assert.equal(day!.provisionalSeconds, 0);
  assert.equal(day!.workedSeconds, 3661.25);
  assert.equal(day!.imputedSeconds, 7200);
  assert.equal(attendanceTotal([day!]).workedSeconds, 3661.25);
});

test('allocates overnight sessions and rounded imputation by actual overlap, conserving totals', () => {
  const days = attendanceDays(
    [session('2026-10-01T21:00:00Z', '2026-10-02T01:00:00Z')],
    [entry('2026-10-01T21:00:00Z', '2026-10-02T01:00:00Z', 5 * 3600)],
    ['2026-10-01', '2026-10-02'],
    zone,
    now,
  );
  assert.equal(days[0]!.workedSeconds, 3600);
  assert.equal(days[1]!.workedSeconds, 3 * 3600);
  assert.equal(days[0]!.imputedSeconds, 1.25 * 3600);
  assert.equal(days[1]!.imputedSeconds, 3.75 * 3600);
  assert.equal(attendanceTotal(days).workedSeconds, 4 * 3600);
  assert.equal(attendanceTotal(days).imputedSeconds, 5 * 3600);
  assert.equal(attendanceTotal(days).imputedPercent, 125);
});

test('local-midnight allocation respects the 23-hour and 25-hour DST days', () => {
  for (const [date, start, end, expected] of [
    ['2026-03-29', '2026-03-28T23:00:00Z', '2026-03-29T22:00:00Z', 23],
    ['2026-10-25', '2026-10-24T22:00:00Z', '2026-10-25T23:00:00Z', 25],
  ] as const) {
    const [day] = attendanceDays([session(start, end)], [], [date], zone, end);
    assert.equal(day!.workedSeconds, expected * 3600);
  }
});

test('open attendance remains provisional and does not double count closed portions', () => {
  const dates = ['2026-10-01', '2026-10-02'];
  const days = attendanceDays(
    [session('2026-10-01T21:00:00Z', null)],
    [],
    dates,
    zone,
    '2026-10-02T00:00:00Z',
  );
  assert.equal(days[0]!.provisionalSeconds, 3600);
  assert.equal(days[1]!.provisionalSeconds, 2 * 3600);
  assert.equal(attendanceTotal(days).workedSeconds, 3 * 3600);
  assert.equal(attendanceTotal(days).closedSeconds, 0);
  const closed = attendanceDays(
    [session('2026-10-01T21:00:00Z', '2026-10-02T00:00:00Z')],
    [],
    dates,
    zone,
    now,
  );
  assert.equal(attendanceTotal(closed).workedSeconds, 3 * 3600);
  assert.equal(attendanceTotal(closed).provisionalSeconds, 0);
});

test('clips sessions to selected dates, keeps totals at exact midnight and avoids future negative durations', () => {
  const [day] = attendanceDays(
    [
      session('2026-10-01T20:00:00Z', '2026-10-01T22:00:00Z'),
      session('2026-10-01T22:00:00Z', '2026-10-02T00:00:00Z'),
      session('2026-10-02T17:00:00Z', null),
    ],
    [],
    ['2026-10-02'],
    zone,
    now,
  );
  assert.equal(day!.workedSeconds, 2 * 3600);
  assert.equal(day!.provisionalSeconds, 0);
  assert.equal(imputedPercent(3600, 0), null);
  assert.equal(imputedPercent(0, 3600), 0);
});

test('period history includes a session starting earlier and excludes boundary-adjacent/deleted sessions', () => {
  const records = [
    { id: 'overnight', ...session('2026-10-01T21:00:00Z', '2026-10-02T01:00:00Z') },
    { id: 'before', ...session('2026-10-01T20:00:00Z', '2026-10-01T22:00:00Z') },
    { id: 'after', ...session('2026-10-02T22:00:00Z', '2026-10-03T01:00:00Z') },
    { id: 'deleted', ...session('2026-10-02T09:00:00Z', '2026-10-02T12:00:00Z', now) },
  ] as Attendance[];
  assert.deepEqual(
    attendanceInPeriod(records, ['2026-10-02'], zone, now).map((record) => record.id),
    ['overnight'],
  );
  assert.deepEqual(attendanceInPeriod(records, [], zone, now), []);
});

test('uses the server clock estimate instead of local clock offset and tolerates pre-fetch ticks', () => {
  assert.equal(estimateServerTime('2026-10-02T12:00:00Z', 1000, 6000), '2026-10-02T12:00:05.000Z');
  assert.equal(estimateServerTime('2026-10-02T12:00:00Z', 6000, 1000), '2026-10-02T12:00:00.000Z');
});

test('validates durable intents and preserves exact UUID/version/manual timestamps for retry', () => {
  const id = 'de305d54-75b4-431b-adb2-eb6b9e546014';
  for (const value of [
    { action: 'fichar_entrada', payload: { id } },
    { action: 'fichar_salida', payload: { id, version: 4 } },
    { action: 'crear_fichaje', payload: { id, inicio_en: now, fin_en: null } },
    {
      action: 'editar_fichaje',
      payload: { id, version: 2, inicio_en: now, fin_en: '2026-10-02T18:00:00Z' },
    },
    { action: 'eliminar_fichaje', payload: { id, version: 3 } },
  ])
    assert.equal(isPendingAttendance(value), true);
  for (const value of [
    null,
    { action: 'iniciar', payload: { id } },
    { action: 'fichar_entrada', payload: { id: 'invalid' } },
    { action: 'fichar_salida', payload: { id, version: 0 } },
    { action: 'fichar_salida', payload: { id, version: '1' } },
    { action: 'crear_fichaje', payload: { id, inicio_en: now } },
    { action: 'editar_fichaje', payload: { id, version: 1, inicio_en: 'invalid', fin_en: null } },
  ])
    assert.equal(isPendingAttendance(value), false);
});

test('durable intents survive reload, stay account-bound, and cannot clear another tab newer intent', () => {
  const values = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  try {
    const first = {
      action: 'fichar_entrada' as const,
      payload: { id: 'de305d54-75b4-431b-adb2-eb6b9e546014' },
    };
    const second = {
      action: 'fichar_entrada' as const,
      payload: { id: 'de305d54-75b4-431b-adb2-eb6b9e546015' },
    };
    savePendingAttendance('user-a', first);
    assert.deepEqual(readPendingAttendance('user-a'), first);
    assert.equal(readPendingAttendance('user-b'), null);
    savePendingAttendance('user-a', second);
    clearPendingAttendance('user-a', first);
    assert.deepEqual(readPendingAttendance('user-a'), second);
    clearPendingAttendance('user-a', second);
    assert.equal(values.has(attendanceStorageKey('user-a')), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('attendance Web Lock prevents overlapping mutations from different tabs', async () => {
  const manager = {
    request: async (
      name: string,
      options: { ifAvailable: boolean },
      callback: (lock: null) => Promise<void>,
    ) => {
      assert.equal(name, 'chambapp:attendance:user-a');
      assert.equal(options.ifAvailable, true);
      return callback(null);
    },
  };
  let ran = false;
  await assert.rejects(
    withAttendanceLock(
      'user-a',
      async () => {
        ran = true;
      },
      manager as never,
    ),
    /Otra pestaña/,
  );
  assert.equal(ran, false);
});
