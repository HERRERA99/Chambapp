import assert from 'node:assert/strict';
import test from 'node:test';
import { assertNote, withNoteDefaults } from '../src/lib/supabase/rowValidation.ts';
import { isValidCommandResponse } from '../src/lib/supabase/commandValidation.ts';
import type { NoteRow } from '../src/domain/models.ts';

const id = '11111111-1111-1111-1111-111111111111';
const owner = '22222222-2222-2222-2222-222222222222';
const project = '33333333-3333-3333-3333-333333333333';
const task = '44444444-4444-4444-4444-444444444444';
const timestamp = '2026-10-27T14:00:00Z';
const note: NoteRow = {
  id,
  usuario_id: owner,
  titulo: 'Una nota',
  contenido_md: '\uFEFF# Reunión\r\n\r\n- [ ] Revisar 📝\r\n',
  proyecto_ids: [project],
  tarea_ids: [task],
  creado_en: timestamp,
  actualizado_en: timestamp,
  version: 2,
  cifrado: null,
  boveda_generacion: null,
};
const payload = {
  id,
  titulo: ' Una nota ',
  contenido_md: note.contenido_md,
  proyecto_ids: [project],
  tarea_ids: [task],
  version: 1,
};

test('note boundary validation accepts exact Unicode Markdown and rejects incomplete data', () => {
  assert.doesNotThrow(() => assertNote(note));
  for (const change of [
    { id: null },
    { usuario_id: 'invalid' },
    { contenido_md: null },
    { titulo: '' },
    { titulo: '📝'.repeat(201) },
    { contenido_md: 'é'.repeat(500001) },
    { version: 0 },
    { creado_en: 'invalid' },
    { actualizado_en: null },
    { proyecto_ids: null },
    { tarea_ids: ['invalid'] },
    { proyecto_ids: [project, project] },
  ])
    assert.throws(() => assertNote({ ...note, ...change }), /nota contiene/);
  assert.doesNotThrow(() =>
    assertNote({ ...note, titulo: '📝'.repeat(200), contenido_md: 'é'.repeat(500000) }),
  );
});

test('note save confirmations match the submitted content, identity, version and associations', () => {
  assert.equal(isValidCommandResponse('guardar_nota', payload, note), true);
  for (const change of [
    { id: project },
    { titulo: 'Distinta' },
    { contenido_md: note.contenido_md.replaceAll('\r\n', '\n') },
    { proyecto_ids: [] },
    { tarea_ids: [] },
    { version: 1 },
    { version: 3 },
    { usuario_id: null },
    { tarea_ids: [task, task] },
  ])
    assert.equal(isValidCommandResponse('guardar_nota', payload, { ...note, ...change }), false);
  assert.equal(
    isValidCommandResponse(
      'guardar_nota',
      { ...payload, proyecto_ids: [task, project] },
      { ...note, proyecto_ids: [project, task] },
    ),
    true,
  );
});

test('note deletion only confirms the intended note at its current version', () => {
  assert.equal(isValidCommandResponse('eliminar_nota', { id, version: 2 }, note), true);
  assert.equal(isValidCommandResponse('eliminar_nota', { id, version: 1 }, note), false);
  assert.equal(isValidCommandResponse('eliminar_nota', { id: project, version: 2 }, note), false);
  assert.equal(
    isValidCommandResponse('eliminar_nota', { id, version: 2 }, { id, version: 2 }),
    false,
  );
});

test('encrypted note rows keep text only in the envelope; damaged envelopes are isolated later', () => {
  const generation = '55555555-5555-4555-8555-555555555555';
  const encrypted = {
    ...note,
    titulo: '',
    contenido_md: '',
    cifrado: `v1.${'A'.repeat(16)}.${'B'.repeat(30)}`,
    boveda_generacion: generation,
  };
  assert.doesNotThrow(() => assertNote(encrypted));
  // A malformed envelope does not reject the whole workspace load.
  assert.doesNotThrow(() => assertNote({ ...encrypted, cifrado: 'v1.damaged' }));
  for (const change of [
    { titulo: 'Visible' },
    { contenido_md: 'texto en claro' },
    { boveda_generacion: null },
    { cifrado: 7 },
  ])
    assert.throws(() => assertNote({ ...encrypted, ...change } as never), /nota contiene/);
  assert.throws(() => assertNote({ ...note, boveda_generacion: generation }), /nota contiene/);

  const encryptedPayload = {
    id,
    cifrado: encrypted.cifrado,
    boveda_generacion: generation,
    proyecto_ids: [project],
    tarea_ids: [task],
    version: 1,
  };
  assert.equal(isValidCommandResponse('guardar_nota', encryptedPayload, encrypted), true);
  for (const change of [
    { cifrado: `v1.${'C'.repeat(16)}.${'B'.repeat(30)}` },
    { boveda_generacion: id },
    { titulo: 'x' },
  ])
    assert.equal(
      isValidCommandResponse('guardar_nota', encryptedPayload, { ...encrypted, ...change }),
      false,
    );
});

test('notes from a database without the encryption migration load as plaintext', () => {
  const { cifrado, boveda_generacion, ...legacyRow } = note;
  void cifrado;
  void boveda_generacion;
  const row = withNoteDefaults(legacyRow as never);
  assert.equal(row.cifrado, null);
  assert.equal(row.boveda_generacion, null);
  assert.doesNotThrow(() => assertNote(row));
  // Present but invalid values are still rejected.
  assert.throws(
    () => assertNote(withNoteDefaults({ ...note, cifrado: 7 } as never)),
    /nota contiene/,
  );
});
