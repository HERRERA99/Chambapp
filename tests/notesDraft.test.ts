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
