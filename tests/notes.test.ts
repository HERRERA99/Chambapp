import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_NOTE_BYTES,
  MAX_NOTE_TITLE_LENGTH,
  noteFileName,
  titleFromFileName,
  readMarkdownFile,
  normalizeNoteSearch,
  noteMatchesSearch,
} from '../src/features/notes/notes.model.ts';

test('Markdown import preserves source, CRLF, UTF-8 BOM, whitespace and code exactly', async () => {
  const text =
    '\uFEFF# Planificación\r\n\r\n- [ ] Revisar\r\n\r\n```ts\r\n  const n = 1;  \r\n```\r\n';
  const imported = await readMarkdownFile(new File([text], 'Reunión.MD', { type: 'text/plain' }));
  assert.deepEqual(imported, { titulo: 'Reunión', contenido_md: text });
});

test('Markdown import accepts empty files and the exact byte limit', async () => {
  assert.equal((await readMarkdownFile(new File([], 'vacía.md'))).contenido_md, '');
  const text = 'é'.repeat(MAX_NOTE_BYTES / 2);
  assert.equal((await readMarkdownFile(new File([text], 'límite.md'))).contenido_md, text);
  await assert.rejects(readMarkdownFile(new File([text + 'a'], 'grande.md')), /1 MB/);
});

test('Markdown import rejects other extensions, invalid UTF-8 and binary NUL', async () => {
  await assert.rejects(readMarkdownFile(new File(['# Nota'], 'nota.md.html')), /extensión .md/);
  await assert.rejects(
    readMarkdownFile(new File([new Uint8Array([0xc3, 0x28])], 'rota.md')),
    /UTF-8/,
  );
  await assert.rejects(readMarkdownFile(new File(['texto\0binario'], 'binario.md')), /binarios/);
});

test('import titles discard path and repeated extension and obey character limit', () => {
  assert.equal(titleFromFileName('C:\\carpeta\\Plan.MD.md'), 'Plan');
  assert.equal(titleFromFileName('../plan.md'), 'plan');
  assert.equal(titleFromFileName('.md'), 'Sin título');
  assert.equal(
    Array.from(titleFromFileName('🙂'.repeat(250) + '.md')).length,
    MAX_NOTE_TITLE_LENGTH,
  );
});

test('download filenames are safe single .md files across platforms', () => {
  assert.equal(noteFileName('  Reunión.md.MD  '), 'Reunión.md');
  assert.equal(noteFileName('  ...  '), 'nota.md');
  assert.equal(noteFileName(''), 'nota.md');
  assert.equal(noteFileName('CON.md'), 'nota-CON.md');
  assert.equal(noteFileName('aux.backup'), 'nota-aux.backup.md');
  assert.equal(noteFileName('lpt1'), 'nota-lpt1.md');
  assert.equal(noteFileName('../Notas:\\"revisión"?*|<>\0'), '-Notas---revisión-------.md');
  assert.equal(Array.from(noteFileName('🙂'.repeat(200))).length, 123);
});

test('note search matches title and Markdown content regardless of accents or case', () => {
  const note = { titulo: 'Planificación', contenido_md: '# Acción\nRevisar la API' };
  assert.equal(normalizeNoteSearch('  ÁÉÍÓÚ Ñ  '), 'aeiou n');
  assert.equal(noteMatchesSearch(note, 'PLANIFICACION'), true);
  assert.equal(noteMatchesSearch(note, ' accion '), true);
  assert.equal(noteMatchesSearch(note, 'revisar la api'), true);
  assert.equal(noteMatchesSearch(note, '   '), true);
  assert.equal(noteMatchesSearch(note, 'ausente'), false);
});
