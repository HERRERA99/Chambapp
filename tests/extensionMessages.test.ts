import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanOdooRequest,
  formatHoursMinutes,
  isAppMessage,
  isExtensionMessage,
  lockedIds,
  odooMinutes,
  odooRequestProblem,
  sameOrigin,
} from '../src/features/extension/protocol.ts';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const valid = {
  requestId: id(1),
  userId: id(2),
  taskId: id(3),
  taskVersion: 1,
  fecha: '2026-11-02',
  odooUrl: 'https://empresa.odoo.com/odoo/project/1/tasks/9',
  descripcion: 'Revisión',
  minutos: 75,
  horasFormato: '01:15',
  confirmLong: false,
  partes: [{ id: id(4), version: 2 }],
};

test('formatHoursMinutes and odooMinutes', () => {
  assert.equal(formatHoursMinutes(0), '00:00');
  assert.equal(formatHoursMinutes(75), '01:15');
  assert.equal(formatHoursMinutes(1440), '24:00');
  assert.equal(odooMinutes(61), 2);
  assert.equal(odooMinutes(60), 1);
  assert.equal(odooMinutes(120.00000001), 2);
  assert.equal(odooMinutes(60.000001), 2);
  assert.equal(odooMinutes(0.000001), 1);
  assert.equal(odooMinutes(0), 0);
  assert.equal(odooMinutes(-5), 0);
});

test('odooRequestProblem accepts a valid request and rejects malformed ones', () => {
  assert.equal(odooRequestProblem(valid), null);
  const bad: Record<string, unknown>[] = [
    { ...valid, requestId: 'x' },
    { ...valid, userId: undefined },
    { ...valid, taskVersion: -1 },
    { ...valid, fecha: '2026-02-30' },
    { ...valid, odooUrl: 'javascript:alert(1)' },
    { ...valid, odooUrl: 'https://u:p@empresa.odoo.com/x' },
    { ...valid, descripcion: '   ' },
    { ...valid, descripcion: 'x'.repeat(1001) },
    { ...valid, minutos: 0, horasFormato: '00:00' },
    { ...valid, minutos: 1.5 },
    { ...valid, minutos: 1441, horasFormato: '24:01' },
    { ...valid, horasFormato: '1:15' },
    { ...valid, minutos: 301, horasFormato: '05:01' },
    { ...valid, partes: [] },
    {
      ...valid,
      partes: [
        { id: id(4), version: 1 },
        { id: id(4), version: 1 },
      ],
    },
    { ...valid, partes: [{ id: 'x', version: 1 }] },
    { ...valid, partes: Array.from({ length: 1001 }, (_, n) => ({ id: id(n + 10), version: 1 })) },
  ];
  for (const request of bad)
    assert.ok(odooRequestProblem(request), JSON.stringify(request).slice(0, 80));
  assert.equal(
    odooRequestProblem({ ...valid, minutos: 301, horasFormato: '05:01', confirmLong: true }),
    null,
  );
  assert.ok(odooRequestProblem(null));
});

test('cleanOdooRequest drops unknown fields', () => {
  const cleaned = cleanOdooRequest({
    ...valid,
    extra: 'x',
    partes: [{ id: id(4), version: 2, x: 1 }],
  } as never);
  assert.deepEqual(cleaned, { ...valid, origen: 'nube' });
  assert.equal(cleanOdooRequest({ ...valid, origen: 'local' }).origen, 'local');
  assert.equal(odooRequestProblem({ ...valid, origen: 'disco' }) !== null, true);
});

test('app and extension messages are validated by source and type', () => {
  assert.equal(isAppMessage({ source: 'chambapp-app', type: 'ping' }), true);
  assert.equal(isAppMessage({ source: 'chambapp-app', type: 'send-odoo', request: valid }), true);
  assert.equal(
    isAppMessage({ source: 'chambapp-app', type: 'send-odoo', request: { ...valid, minutos: 0 } }),
    false,
  );
  assert.equal(
    isAppMessage({
      source: 'chambapp-app',
      type: 'queue-action',
      requestId: id(1),
      action: 'retry',
    }),
    true,
  );
  assert.equal(
    isAppMessage({
      source: 'chambapp-app',
      type: 'queue-action',
      requestId: id(1),
      action: 'nuke',
    }),
    false,
  );
  assert.equal(isAppMessage({ source: 'otro', type: 'ping' }), false);
  assert.equal(isAppMessage({ source: 'chambapp-app', type: 'read-vault' }), false);
  assert.equal(
    isExtensionMessage({
      source: 'chambapp-extension',
      type: 'hello',
      version: '1',
      userId: null,
      odooOrigin: null,
    }),
    true,
  );
  assert.equal(
    isExtensionMessage({
      source: 'chambapp-extension',
      type: 'queue',
      items: [{ requestId: id(1), taskId: id(3), entryIds: [id(4)], status: 'pending', error: '' }],
    }),
    true,
  );
  assert.equal(
    isExtensionMessage({
      source: 'chambapp-extension',
      type: 'queue',
      items: [{ requestId: id(1), status: 'x' }],
    }),
    false,
  );
});

test('Hera requests are scoped by account and their snapshots are validated', () => {
  const get = {
    source: 'chambapp-app',
    type: 'hera-requests-get',
    userId: id(2),
    generation: null,
  };
  assert.equal(isAppMessage(get), true);
  assert.equal(isAppMessage({ ...get, generation: id(8) }), true);
  assert.equal(isAppMessage({ ...get, userId: undefined }), false);
  assert.equal(isAppMessage({ ...get, generation: 7 }), false);
  const item = {
    date: '2026-03-23',
    original: null,
    operation: 'Añadir',
    change: { kind: 'salida', time: '16:03' },
    reason: 'Olvido de fichaje',
    status: 'desconocido',
    statusText: 'En revisión',
  };
  const message = {
    source: 'chambapp-extension',
    type: 'hera-requests',
    userId: id(2),
    generation: null,
    readAt: Date.now(),
    items: [item],
  };
  assert.equal(isExtensionMessage(message), true);
  assert.equal(isExtensionMessage({ ...message, readAt: null, items: [] }), true);
  assert.equal(isExtensionMessage({ ...message, type: 'hera-requests-changed' }), true);
  for (const bad of [
    { ...message, source: 'otro' },
    { ...message, userId: 'otro' },
    { ...message, generation: undefined },
    { ...message, readAt: Infinity },
    { ...message, readAt: null },
    { ...message, items: [{ ...item, change: { kind: 'salida', time: '16:99' } }] },
    { ...message, items: [{ ...item, change: { kind: 'S', time: '16:03' } }] },
    { ...message, items: [{ ...item, date: '2026-02-30' }] },
    { ...message, items: [{ ...item, status: 'otro' }] },
    { ...message, items: [{ ...item, reason: 'r'.repeat(1001) }] },
  ]) {
    assert.equal(isExtensionMessage(bad), false);
  }
});

test('lockedIds covers entries and tasks of active requests only', () => {
  const item = (n: number, status: string) => ({
    requestId: id(n),
    taskId: id(100 + n),
    entryIds: [id(200 + n)],
    status: status as 'pending',
    error: '',
  });
  const locked = lockedIds([
    item(1, 'pending'),
    item(2, 'uncertain'),
    item(3, 'success'),
    item(4, 'error'),
  ]);
  assert.deepEqual([...locked.entries], [id(201), id(202)]);
  assert.deepEqual([...locked.tasks], [id(101), id(102)]);
  assert.equal(sameOrigin('https://empresa.odoo.com/odoo/x', 'https://empresa.odoo.com'), true);
  assert.equal(
    sameOrigin('https://empresa.odoo.com.evil.com/x', 'https://empresa.odoo.com'),
    false,
  );
  assert.equal(sameOrigin('https://empresa.odoo.com/x', null), false);
});
