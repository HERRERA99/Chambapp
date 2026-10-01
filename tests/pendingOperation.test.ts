import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import {
  clearPending,
  isPendingOperation,
  readPending,
  readPaused,
  savePending,
  savePaused,
  trackerStorageKey,
} from '../src/features/tracker/pendingOperation.ts';
import { withTrackerLock } from '../src/features/tracker/trackerLock.ts';

const taskId = '11111111-1111-1111-1111-111111111111';
const operationId = '22222222-2222-2222-2222-222222222222';
const partId = '33333333-3333-3333-3333-333333333333';
const operation = {
  action: 'iniciar' as const,
  payload: { operacion_id: operationId, tarea_id: taskId, descripcion: 'Trabajo exacto' },
  after: 'start' as const,
  taskId,
};

beforeEach(() => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    },
  });
});

test('recovers the exact operation UUID and payload after reload, isolated by user', () => {
  savePending('user-a', operation);
  const recovered = readPending('user-a');
  assert.deepEqual(recovered, operation);
  assert.equal(readPending('user-b'), null);
  assert.equal(readPending(null), null);
  assert.equal(recovered?.payload.operacion_id, operationId);
});

test('a late confirmation cannot erase a newer operation from another tab', () => {
  savePending('user-a', operation);
  const newer = {
    action: 'detener' as const,
    payload: { operacion_id: partId, parte_id: partId },
    after: 'pause' as const,
    taskId,
  };
  savePending('user-a', newer);
  clearPending('user-a', operationId);
  assert.deepEqual(readPending('user-a'), newer);
  clearPending('user-a', partId);
  assert.equal(readPending('user-a'), null);
});

test('rejects mismatched actions, malformed UUIDs and missing or array payloads', () => {
  assert.equal(isPendingOperation({ ...operation, after: 'pause' }), false);
  assert.equal(isPendingOperation({ ...operation, payload: [] }), false);
  assert.equal(
    isPendingOperation({
      ...operation,
      payload: { operacion_id: '-'.repeat(36), tarea_id: taskId },
    }),
    false,
  );
  assert.equal(isPendingOperation({ ...operation, payload: { operacion_id: operationId } }), false);
  assert.equal(isPendingOperation({ ...operation, action: 'detener', after: 'stop' }), false);
  assert.throws(() => savePending('user-a', { ...operation, taskId: 'invalid' }));
  localStorage.setItem(trackerStorageKey('user-a'), '{broken-json');
  assert.equal(readPending('user-a'), null);
});

test('paused shortcuts remain scoped to the user and invalid values are ignored', () => {
  savePaused('user-a', taskId);
  assert.equal(readPaused('user-a'), taskId);
  assert.equal(readPaused('user-b'), null);
  localStorage.setItem(`${trackerStorageKey('user-a')}:paused`, 'not-a-task');
  assert.equal(readPaused('user-a'), null);
  savePaused('user-a', null);
  assert.equal(readPaused('user-a'), null);
});

function lockManager() {
  const locked = new Set<string>();
  return {
    request: async <T>(
      name: string,
      _options: unknown,
      work: (lock: { name: string } | null) => Promise<T>,
    ) => {
      if (locked.has(name)) return work(null);
      locked.add(name);
      try {
        return await work({ name });
      } finally {
        locked.delete(name);
      }
    },
  } as unknown as LockManager;
}

test('simultaneous tabs cannot write over the same durable intent', async () => {
  const manager = lockManager();
  let release = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = withTrackerLock(
    'user-a',
    async () => {
      savePending('user-a', operation);
      await waiting;
    },
    manager,
  );
  await assert.rejects(
    withTrackerLock(
      'user-a',
      async () => {
        savePending('user-a', {
          ...operation,
          taskId: partId,
          payload: { operacion_id: partId, tarea_id: partId },
        });
      },
      manager,
    ),
    /Otra pestaña/,
  );
  assert.deepEqual(readPending('user-a'), operation);
  release();
  await first;
});

test('locks are released after a failed request and different users are independent', async () => {
  const manager = lockManager();
  await assert.rejects(
    withTrackerLock(
      'user-a',
      async () => {
        throw new Error('Offline');
      },
      manager,
    ),
    /Offline/,
  );
  assert.equal(
    await withTrackerLock('user-a', async () => 'retry same UUID', manager),
    'retry same UUID',
  );
  await withTrackerLock(
    'user-a',
    () => withTrackerLock('user-b', async () => undefined, manager),
    manager,
  );
});
