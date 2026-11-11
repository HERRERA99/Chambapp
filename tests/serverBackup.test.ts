import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BackupError,
  buildServerBackup,
  encryptServerBackup,
  readServerBackup,
  summarize,
} from '../src/lib/serverBackup.ts';
import type { ServerData } from '../src/lib/serverBackup.ts';

const user = '00000000-0000-4000-8000-000000000001';
const data: ServerData = {
  formato: 'chambapp-servidor-datos',
  version: 1,
  usuario_id: user,
  tablas: {
    'public.proyectos': [
      { id: 'marcador-proyecto-en-claro', usuario_id: user, eliminado_en: null },
      { id: 'p2', usuario_id: user, eliminado_en: '2026-09-01T00:00:00Z' },
    ],
    'public.tareas': [{ id: 't1', usuario_id: user, eliminado_en: null }],
    'public.partes_horas': [],
    'public.notas': [{ id: 'n1', usuario_id: user }],
    'public.credenciales': [],
  },
};
const now = new Date('2026-11-09T10:00:00Z');
const rejects = (work: Promise<unknown>, code: string) =>
  assert.rejects(work, (error) => error instanceof BackupError && error.code === code);

test('a plain backup round-trips and is summarized', async () => {
  const file = JSON.stringify(buildServerBackup(data, now));
  const result = await readServerBackup(file, user);
  assert.equal(result.kind, 'ok');
  if (result.kind !== 'ok') return;
  assert.deepEqual(result.data, data);
  assert.equal(result.exportadoEn, now.toISOString());
  assert.deepEqual(summarize(result.data), {
    proyectos: 1,
    tareas: 1,
    partes: 0,
    fichajes: 0,
    notas: 1,
    contrasenas: 0,
    ausencias: 0,
  });
});

test('an encrypted backup needs its password and rejects a wrong one', async () => {
  const encrypted = await encryptServerBackup(buildServerBackup(data, now), 'una clave larga');
  const file = JSON.stringify(encrypted);
  assert.equal(encrypted.formato, 'chambapp-servidor-cifrado');
  assert.ok(!file.includes('marcador-proyecto-en-claro'), 'no plaintext data in the file');
  assert.deepEqual(await readServerBackup(file, user), { kind: 'needs-password' });
  await rejects(readServerBackup(file, user, 'otra clave larga'), 'COPIA_CONTRASENA');
  const opened = await readServerBackup(file, user, 'una clave larga');
  assert.equal(opened.kind, 'ok');
  if (opened.kind === 'ok') assert.deepEqual(opened.data, data);
});

test('invalid files, other formats and other users are rejected', async () => {
  const plain = buildServerBackup(data, now);
  await rejects(readServerBackup('no es json', user), 'COPIA_INVALIDA');
  await rejects(readServerBackup(JSON.stringify({ ...plain, version: 2 }), user), 'COPIA_INVALIDA');
  await rejects(
    readServerBackup(JSON.stringify({ ...plain, formato: 'chambapp-local' }), user),
    'COPIA_INVALIDA',
  );
  await rejects(
    readServerBackup(JSON.stringify({ ...plain, datos: { ...data, tablas: { x: 1 } } }), user),
    'COPIA_INVALIDA',
  );
  await rejects(
    readServerBackup(JSON.stringify({ ...plain, usuario_id: 'otro' }), user),
    'COPIA_OTRA_CUENTA',
  );
});

test('every backup that fits the import limit can be read back; larger ones are refused', async () => {
  const { MAX_SERVER_BACKUP_BYTES, MAX_SERVER_DATA_BYTES, fitsImportLimit } =
    await import('../src/lib/serverBackup.ts');
  // An encrypted file is base64 of the payload plus a small envelope: it must fit the read limit.
  assert.ok(MAX_SERVER_BACKUP_BYTES >= Math.ceil((MAX_SERVER_DATA_BYTES * 4) / 3) + 1024 * 1024);
  const big = (bytes: number): ServerData => ({
    ...data,
    tablas: {
      ...data.tablas,
      'public.notas': [{ id: 'n1', usuario_id: user, cifrado: 'x'.repeat(bytes) }],
    },
  });
  const atLimit = big(MAX_SERVER_DATA_BYTES - 2048);
  assert.equal(fitsImportLimit(atLimit), true);
  const encrypted = await encryptServerBackup(buildServerBackup(atLimit, now), 'una clave larga');
  const file = JSON.stringify(encrypted);
  assert.ok(file.length <= MAX_SERVER_BACKUP_BYTES, `${file.length} bytes`);
  const opened = await readServerBackup(file, user, 'una clave larga');
  assert.equal(opened.kind, 'ok');
  const over = big(MAX_SERVER_DATA_BYTES + 1);
  assert.equal(fitsImportLimit(over), false);
  await rejects(
    readServerBackup(JSON.stringify(buildServerBackup(over, now)), user),
    'COPIA_DEMASIADO_GRANDE',
  );
});

test('copies made before the Odoo API key was removed import without that table', async () => {
  const { withoutRemovedTables } = await import('../src/lib/serverBackup.ts');
  const data = {
    formato: 'chambapp-servidor-datos' as const,
    version: 1 as const,
    usuario_id: 'u',
    tablas: { 'public.perfiles': [{ id: 'u' }], 'chambapp_private.odoo_credenciales': [{}] },
  };
  assert.deepEqual(Object.keys(withoutRemovedTables(data).tablas), ['public.perfiles']);
});
