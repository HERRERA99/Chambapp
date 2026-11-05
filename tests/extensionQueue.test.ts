import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyQueueAction,
  failureStatus,
  enqueueDecision,
  interruptedStatus,
  newQueueItem,
  purgeQueue,
  revalidationProblem,
  SUCCESS_RETENTION_MS,
  summarizeQueue,
  taskChangedProblem,
  verificationStatus,
} from '../extension/src/shared/queue.ts';
import type { EntryRow, QueueItem } from '../extension/src/shared/queue.ts';
import type { OdooRequest } from '../src/features/extension/protocol.ts';

const user = '00000000-0000-4000-8000-000000000001';
const taskId = '00000000-0000-4000-8000-0000000000aa';
const e1 = '00000000-0000-4000-8000-000000000011';
const e2 = '00000000-0000-4000-8000-000000000012';
const e3 = '00000000-0000-4000-8000-000000000013';
const url = 'https://empresa.odoo.com/odoo/project/1/tasks/9';

let counter = 0;
function request(partes: { id: string; version: number }[], extra: Partial<OdooRequest> = {}) {
  counter += 1;
  return {
    requestId: `00000000-0000-4000-9000-${String(counter).padStart(12, '0')}`,
    userId: user,
    taskId,
    taskVersion: 3,
    fecha: '2026-11-02',
    odooUrl: url,
    descripcion: 'Revisión',
    minutos: 45,
    horasFormato: '00:45',
    confirmLong: false,
    partes,
    ...extra,
  } satisfies OdooRequest;
}

const withStatus = (item: QueueItem, status: QueueItem['status']): QueueItem => ({
  ...item,
  status,
});

test('enqueue: an entry held by an active request is never queued twice', () => {
  for (const status of ['pending', 'processing', 'uncertain', 'sent-unmarked'] as const) {
    const first = withStatus(
      newQueueItem(
        request([
          { id: e1, version: 1 },
          { id: e2, version: 1 },
        ]),
        0,
      ),
      status,
    );
    const decision = enqueueDecision([first], request([{ id: e2, version: 5 }]), 1);
    assert.equal(decision.kind, 'existing', status);
    assert.equal(decision.item.id, first.id);
  }
});

test('enqueue: same requestId returns the existing item; disjoint entries are queued', () => {
  const first = newQueueItem(request([{ id: e1, version: 1 }]), 0);
  assert.equal(enqueueDecision([first], first.request, 1).kind, 'existing');
  const other = enqueueDecision([first], request([{ id: e3, version: 1 }]), 1);
  assert.equal(other.kind, 'new');
});

test('enqueue: a sent request blocks an identical resend but not one after undo', () => {
  const done = withStatus(newQueueItem(request([{ id: e1, version: 4 }]), 0), 'success');
  assert.equal(enqueueDecision([done], request([{ id: e1, version: 4 }]), 1).kind, 'existing');
  // Marking and undoing bump the version: the entries changed, so they may be sent again.
  assert.equal(enqueueDecision([done], request([{ id: e1, version: 6 }]), 1).kind, 'new');
});

test('enqueue: old errors sharing entries are replaced', () => {
  const failed = withStatus(newQueueItem(request([{ id: e1, version: 1 }]), 0), 'error');
  const decision = enqueueDecision(
    [failed],
    request([
      { id: e1, version: 1 },
      { id: e2, version: 1 },
    ]),
    1,
  );
  assert.equal(decision.kind, 'new');
  assert.deepEqual(decision.kind === 'new' ? decision.replaced : [], [failed.id]);
});

test('interruptions: safe to retry only before the write boundary', () => {
  for (const phase of ['idle', 'opening', 'counting', 'filling'] as const)
    assert.equal(interruptedStatus(phase), 'error', phase);
  for (const phase of ['may-have-written', 'form-saved', 'reloading', 'verifying', 'done'] as const)
    assert.equal(interruptedStatus(phase), 'uncertain', phase);
});

test('verification: only one more matching line proves the save', () => {
  assert.equal(verificationStatus(0, 1), 'success');
  assert.equal(verificationStatus(2, 3), 'success');
  assert.equal(verificationStatus(0, 0), 'uncertain');
  assert.equal(verificationStatus(0, 2), 'uncertain');
  assert.equal(verificationStatus(null, 1), 'uncertain');
  assert.equal(verificationStatus(1, null), 'uncertain');
});

function row(id: string, extra: Partial<EntryRow> = {}): EntryRow {
  return {
    id,
    usuario_id: user,
    version: 1,
    tarea_id: taskId,
    fecha: '2026-11-02',
    fin_en: '2026-11-02T10:00:00Z',
    eliminado_en: null,
    imputacion_odoo_id: null,
    duracion_real_segundos: 20 * 60,
    intervalo_redondeo_minutos: 15,
    ...extra,
  };
}

test('revalidation: accepts unchanged entries and rejects every kind of change', () => {
  const req = request(
    [
      { id: e1, version: 1 },
      { id: e2, version: 1 },
    ],
    { minutos: 45, horasFormato: '00:45' },
  );
  const task = {
    id: taskId,
    usuario_id: user,
    proyecto_id: 'p',
    version: 3,
    odoo_url: url,
    eliminado_en: null,
  };
  const project = { id: 'p', eliminado_en: null };
  const rows = [row(e1), row(e2, { duracion_real_segundos: 15 * 60 })];
  // 20 + 15 = 35 min, rounded to 15 → 45 min.
  assert.equal(revalidationProblem(req, rows, task, project), null);
  const changed: [string, EntryRow[]][] = [
    ['version', [row(e1, { version: 2 }), rows[1]!]],
    ['imputed', [row(e1, { imputacion_odoo_id: 'x' }), rows[1]!]],
    ['other task', [row(e1, { tarea_id: 'otra' }), rows[1]!]],
    ['other day', [row(e1, { fecha: '2026-11-03' }), rows[1]!]],
    ['deleted', [row(e1, { eliminado_en: '2026-11-02T11:00:00Z' }), rows[1]!]],
    ['running', [row(e1, { fin_en: null }), rows[1]!]],
    ['other user', [row(e1, { usuario_id: 'otro' }), rows[1]!]],
    ['missing', [rows[1]!]],
    ['duration', [row(e1, { duracion_real_segundos: 40 * 60 }), rows[1]!]],
  ];
  for (const [label, list] of changed)
    assert.ok(revalidationProblem(req, list, task, project), label);
  assert.ok(revalidationProblem(req, rows, { ...task, version: 4 }, project), 'task version');
  assert.ok(revalidationProblem(req, rows, { ...task, odoo_url: `${url}0` }, project), 'task url');
  assert.ok(
    revalidationProblem(req, rows, { ...task, eliminado_en: 'x' }, project),
    'task deleted',
  );
  assert.ok(
    revalidationProblem(req, rows, task, { id: 'p', eliminado_en: 'x' }),
    'project deleted',
  );
  assert.ok(revalidationProblem(req, rows, null, project), 'no task');
});

test('a task changed during the send keeps the entries unmarked', () => {
  const req = request([{ id: e1, version: 1 }]);
  const task = {
    id: taskId,
    usuario_id: user,
    proyecto_id: 'p',
    version: 3,
    odoo_url: url,
    eliminado_en: null,
  };
  const project = { id: 'p', eliminado_en: null };
  assert.equal(taskChangedProblem(req, task, project), null);
  assert.ok(taskChangedProblem(req, { ...task, version: 4 }, project));
  assert.ok(taskChangedProblem(req, { ...task, odoo_url: null }, project));
  assert.ok(taskChangedProblem(req, task, null));
});

test('actions follow the allowed transitions; uncertain cannot be retried blindly', () => {
  const base = newQueueItem(request([{ id: e1, version: 1 }]), 0);
  const failed = { ...withStatus(base, 'error'), phase: 'filling' as const };
  const retried = applyQueueAction(failed, 'retry', 5);
  assert.equal(retried.kind, 'update');
  assert.equal(retried.kind === 'update' && retried.item.status, 'pending');
  assert.equal(retried.kind === 'update' && retried.item.phase, 'idle');
  const unsure = withStatus(base, 'uncertain');
  assert.equal(applyQueueAction(unsure, 'retry', 5).kind, 'invalid');
  assert.equal(applyQueueAction(unsure, 'discard', 5).kind, 'invalid');
  const claimed = applyQueueAction(unsure, 'confirm-created', 5, 'tok');
  assert.equal(claimed.kind, 'mark');
  // While marking, a second click (or any other action) is rejected.
  const marking = claimed.kind === 'mark' ? claimed.item : unsure;
  assert.equal(marking.marking, 'tok');
  assert.equal(applyQueueAction(marking, 'confirm-created', 6, 'tok2').kind, 'invalid');
  assert.equal(applyQueueAction(marking, 'confirm-not-created', 6).kind, 'invalid');
  assert.equal(applyQueueAction(unsure, 'confirm-created', 5).kind, 'invalid');
  const again = applyQueueAction(unsure, 'confirm-not-created', 5);
  assert.equal(again.kind === 'update' && again.item.status, 'pending');
  assert.equal(applyQueueAction(withStatus(base, 'processing'), 'discard', 5).kind, 'invalid');
  assert.equal(applyQueueAction(withStatus(base, 'sent-unmarked'), 'discard', 5).kind, 'remove');
});

test('purge keeps recent successes and everything unresolved; summary hides other users', () => {
  const old = {
    ...withStatus(newQueueItem(request([{ id: e1, version: 1 }]), 0), 'success'),
    updatedAt: 0,
  };
  const failed = {
    ...withStatus(newQueueItem(request([{ id: e2, version: 1 }]), 0), 'error'),
    updatedAt: 0,
  };
  const foreign = newQueueItem(
    request([{ id: e3, version: 1 }], { userId: '00000000-0000-4000-8000-0000000000ff' }),
    0,
  );
  const kept = purgeQueue([old, failed, foreign], SUCCESS_RETENTION_MS + 1);
  assert.deepEqual(
    kept.map((item) => item.id),
    [failed.id, foreign.id],
  );
  const summary = summarizeQueue(kept, user);
  assert.deepEqual(summary, [
    { requestId: failed.id, taskId, entryIds: [e2], status: 'error', error: '' },
  ]);
});

test('unexpected failures never allow a blind retry after the write boundary', () => {
  for (const phase of ['idle', 'opening', 'counting', 'filling'] as const)
    assert.equal(failureStatus(phase), 'error', phase);
  for (const phase of ['may-have-written', 'form-saved', 'reloading', 'verifying'] as const)
    assert.equal(failureStatus(phase), 'uncertain', phase);
  assert.equal(failureStatus('done'), 'sent-unmarked');
});
