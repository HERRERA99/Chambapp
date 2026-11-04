import test from 'node:test';
import assert from 'node:assert/strict';
import { readNoteSession } from '../src/features/notes/notesDraft.ts';
import type { NoteSession } from '../src/features/notes/notesDraft.ts';

const userId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const noteId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const projectId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const taskId = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';
const now = '2026-10-27T08:00:00.000Z';

function session(version = 1): NoteSession {
  const baseline = {
    id: noteId,
    usuario_id: userId,
    titulo: 'Revisión',
    contenido_md: '# Plan\r\n',
    proyecto_ids: [projectId],
    tarea_ids: [taskId],
    version,
    creado_en: now,
    actualizado_en: now,
  };
  return {
    baseline,
    draft: {
      ...baseline,
      titulo: 'Pendiente de guardar',
      contenido_md: '# Plan\r\n\r\n- [ ] Revisar  ',
    },
  };
}

function storage(value: unknown) {
  return { getItem: () => JSON.stringify(value) };
}

test('draft recovery preserves unsaved Markdown and its baseline version exactly', () => {
  const value = session();
  assert.deepEqual(readNoteSession('draft', storage(value)), value);
});

test('draft recovery accepts new version-zero notes and unfinished title/content', () => {
  const value = session(0);
  value.draft.titulo = '';
  value.draft.contenido_md = 'a'.repeat(1_000_001);
  assert.deepEqual(readNoteSession('draft', storage(value)), value);
});

test('draft recovery tolerates absent, malformed and inaccessible storage', () => {
  assert.equal(readNoteSession('draft', { getItem: () => null }), null);
  assert.equal(readNoteSession('draft', { getItem: () => '{broken' }), null);
  assert.equal(
    readNoteSession('draft', {
      getItem: () => {
        throw new Error('Blocked');
      },
    }),
    null,
  );
  for (const value of [
    null,
    [],
    {},
    'note',
    { baseline: session().baseline },
    { draft: session().draft },
  ])
    assert.equal(readNoteSession('draft', storage(value)), null);
});

test('draft recovery rejects mismatched identity, owner and version', () => {
  for (const patch of [{ id: projectId }, { usuario_id: taskId }, { version: 2 }]) {
    const value = session();
    Object.assign(value.draft, patch);
    assert.equal(readNoteSession('draft', storage(value)), null);
  }
});

test('draft recovery validates every required field in both baseline and draft', () => {
  const invalidFields = [
    ['id', 'not-a-uuid'],
    ['usuario_id', undefined],
    ['usuario_id', 9],
    ['titulo', null],
    ['contenido_md', {}],
    ['version', -1],
    ['version', 1.5],
    ['version', Number.MAX_SAFE_INTEGER + 1],
    ['version', '1'],
    ['proyecto_ids', null],
    ['proyecto_ids', ['not-a-uuid']],
    ['proyecto_ids', [projectId, projectId]],
    ['tarea_ids', [null]],
    ['tarea_ids', {}],
    ['creado_en', 'not-a-date'],
    ['actualizado_en', ''],
  ] as const;
  for (const side of ['baseline', 'draft'] as const) {
    for (const [field, invalid] of invalidFields) {
      const value = session();
      Object.assign(value[side], { [field]: invalid });
      assert.equal(readNoteSession('draft', storage(value)), null, `${side}.${field}`);
    }
  }
});

test('draft recovery reads only the requested account key', () => {
  const key = `chambapp:notes-draft:${userId}`;
  const requested: string[] = [];
  const value = session();
  assert.deepEqual(
    readNoteSession(key, {
      getItem(requestedKey: string) {
        requested.push(requestedKey);
        return JSON.stringify(value);
      },
    }),
    value,
  );
  assert.deepEqual(requested, [key]);
});

import {
  encryptNoteSession,
  reconcilePending,
  restoreNoteSession,
} from '../src/features/notes/notesDraft.ts';
import { createVault } from '../src/lib/crypto/vault.ts';

const envelope = `v1.${'A'.repeat(16)}.${'B'.repeat(22)}`;
const generation = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

test('encrypted drafts round-trip with their pending request and are bound to the account', async () => {
  const { key } = await createVault('clave de prueba 123', userId, 1000);
  const value: NoteSession = {
    ...session(0),
    pendiente: {
      id: noteId,
      cifrado: envelope,
      boveda_generacion: generation,
      proyecto_ids: [projectId],
      tarea_ids: [],
    },
  };
  const stored = await encryptNoteSession(key, userId, value);
  assert.doesNotMatch(stored, /Pendiente de guardar|Plan/);
  assert.deepEqual(await restoreNoteSession('k', key, userId, { getItem: () => stored }), {
    kind: 'restored',
    session: value,
    legacy: false,
  });
  // Another account or key cannot open it, and it is reported instead of dropped.
  assert.deepEqual(await restoreNoteSession('k', key, taskId, { getItem: () => stored }), {
    kind: 'unreadable',
  });
  const other = await createVault('otra clave distinta', userId, 1000);
  assert.deepEqual(await restoreNoteSession('k', other.key, userId, { getItem: () => stored }), {
    kind: 'unreadable',
  });
  assert.deepEqual(await restoreNoteSession('k', key, userId, { getItem: () => null }), {
    kind: 'none',
  });
  assert.deepEqual(await restoreNoteSession('k', key, userId, { getItem: () => '{broken' }), {
    kind: 'unreadable',
  });
});

test('plaintext drafts from earlier versions are restored for re-encryption', async () => {
  const { key } = await createVault('clave de prueba 123', userId, 1000);
  const value = session();
  assert.deepEqual(await restoreNoteSession('k', key, userId, storage(value)), {
    kind: 'restored',
    session: value,
    legacy: true,
  });
});

test('pending saves are confirmed, resent with the same bytes or reported as conflicts', () => {
  const create = { cifrado: envelope };
  const update = { cifrado: envelope, version: 3 };
  assert.equal(reconcilePending(create, null), 'resend');
  assert.equal(reconcilePending(create, { version: 1, cifrado: envelope }), 'confirmed');
  assert.equal(reconcilePending(create, { version: 1, cifrado: 'other' }), 'conflict');
  assert.equal(reconcilePending(update, { version: 3, cifrado: 'previous' }), 'resend');
  assert.equal(reconcilePending(update, { version: 4, cifrado: envelope }), 'confirmed');
  assert.equal(reconcilePending(update, { version: 4, cifrado: 'someone else' }), 'conflict');
  assert.equal(reconcilePending(update, null), 'conflict');
});

import {
  clearNoteDraft,
  draftWriteMark,
  nextDraftWrite,
} from '../src/features/notes/notesDraft.ts';

test('an explicit discard invalidates draft writes that are still in flight', () => {
  const key = 'chambapp:notes-draft:test-discard';
  const removed: string[] = [];
  const scheduled = draftWriteMark(key);
  const write = nextDraftWrite(key);
  assert.equal(draftWriteMark(key), write);
  clearNoteDraft(key, { removeItem: (item) => removed.push(item) });
  assert.deepEqual(removed, [key]);
  // Both the late write and the unmount flush scheduled before the discard are stale.
  assert.notEqual(draftWriteMark(key), write);
  assert.notEqual(draftWriteMark(key), scheduled);
});
