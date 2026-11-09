import assert from 'node:assert/strict';
import test from 'node:test';
import { heraInstant, heraPlan, parseHeraAction } from '../extension/src/shared/hera.ts';
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
