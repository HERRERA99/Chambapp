import assert from 'node:assert/strict';
import test from 'node:test';
import {
  onAttemptDisconnect,
  onScriptMessage,
} from '../extension/src/background/attemptMessages.ts';
import type { Attempt, AttemptResult } from '../extension/src/background/attemptMessages.ts';

const attemptId = '00000000-0000-4000-8000-0000000000aa';

function attempt() {
  const results: AttemptResult[] = [];
  let focusStops = 0;
  const value: Attempt = {
    itemId: 'item',
    tabId: 1,
    config: {
      attemptId,
      deadline: Date.now() + 60_000,
      origin: 'https://empresa.odoo.com',
      recordId: 9,
      fecha: '2026-11-06',
      dateFormat: 'dmy',
      descripcion: 'Revisión',
      horasFormato: '01:00',
    },
    port: { postMessage: () => undefined, disconnect: () => undefined },
    expectDisconnect: false,
    done: false,
    stopFocus: () => {
      focusStops += 1;
    },
    settle: (result) => {
      if (value.done) return;
      value.done = true;
      results.push(result);
    },
  };
  return { value, results, focusStops: () => focusStops };
}

test('a disconnect while "form-saved" is being stored does not interrupt the attempt', async () => {
  const { value, results } = attempt();
  let release!: () => void;
  const slowStorage = new Promise<void>((resolve) => {
    release = resolve;
  });
  const handled = onScriptMessage(
    value,
    { type: 'form-saved', attemptId },
    {
      update: async () => {
        await slowStorage;
        return null;
      },
    },
  );
  // The script's port closes while storage is still busy.
  onAttemptDisconnect(value);
  assert.deepEqual(results, []);
  release();
  await handled;
  assert.deepEqual(results, [{ kind: 'form-saved' }]);
});

test('"form-saved" still settles when storing its phase fails', async () => {
  const { value, results } = attempt();
  await onScriptMessage(
    value,
    { type: 'form-saved', attemptId },
    { update: () => Promise.reject(new Error('storage')) },
  );
  assert.deepEqual(results, [{ kind: 'form-saved' }]);
});

test('an unexpected disconnect before any final message interrupts', () => {
  const { value, results } = attempt();
  onAttemptDisconnect(value);
  assert.equal(results[0]?.kind, 'interrupted');
});

test('the "counting" phase (form rendered) releases the window focus', async () => {
  const { value, focusStops } = attempt();
  await onScriptMessage(
    value,
    { type: 'phase', attemptId, phase: 'counting' },
    { update: async () => null },
  );
  assert.equal(focusStops(), 1);
  await onScriptMessage(
    value,
    { type: 'phase', attemptId, phase: 'filling' },
    { update: async () => null },
  );
  assert.equal(focusStops(), 1);
});
