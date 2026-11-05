import assert from 'node:assert/strict';
import test from 'node:test';
import {
  UnreadableEnvelopeError,
  WrongMasterPasswordError,
  createVault,
  decodeNotePlaintext,
  decryptBytes,
  decryptJson,
  decryptNote,
  encodeNotePlaintext,
  encryptBytes,
  encryptJson,
  encryptNote,
  isEnvelope,
  noteAad,
  rewrapVault,
  unlockVault,
  unlockVaultExtractable,
  exportRawKey,
  importRawKey,
} from '../src/lib/crypto/vault.ts';

// Low iteration count keeps tests fast; production uses VAULT_ITERATIONS (600 000).
const ITERATIONS = 1000;
const user = '11111111-1111-4111-8111-111111111111';
const otherUser = '22222222-2222-4222-8222-222222222222';
const noteA = '33333333-3333-4333-8333-333333333333';
const noteB = '44444444-4444-4444-8444-444444444444';

test('note plaintext encoding keeps title and Markdown byte for byte', () => {
  const note = { titulo: 'Reunión 📝', contenido_md: '﻿# Título\r\n\r\n- [ ] ✓ "x" \\ y\r\n' };
  assert.deepEqual(decodeNotePlaintext(encodeNotePlaintext(note)), note);
  assert.deepEqual(decodeNotePlaintext(encodeNotePlaintext({ titulo: 'a', contenido_md: '' })), {
    titulo: 'a',
    contenido_md: '',
  });
  assert.throws(
    () => decodeNotePlaintext(new Uint8Array([0, 0, 0, 9, 65])),
    UnreadableEnvelopeError,
  );
});

test('master password unlocks the data key; a wrong one is rejected', async () => {
  const vault = await createVault('correct horse battery', user, ITERATIONS);
  assert.equal(vault.iteraciones, ITERATIONS);
  assert.ok(isEnvelope(vault.clave_envuelta));
  assert.match(vault.sal, /^[A-Za-z0-9_-]{22}$/);
  // The key held in memory cannot be exported.
  await assert.rejects(crypto.subtle.exportKey('raw', vault.key));
  const sealed = await encryptJson(vault.key, 'ctx', { secreto: 'valor' });
  const key = await unlockVault('correct horse battery', user, vault);
  assert.deepEqual(await decryptJson(key, 'ctx', sealed), { secreto: 'valor' });
  await assert.rejects(unlockVault('wrong password!!', user, vault), WrongMasterPasswordError);
  // The wrapped key is bound to its account.
  await assert.rejects(
    unlockVault('correct horse battery', otherUser, vault),
    WrongMasterPasswordError,
  );
});

test('changing the master password re-wraps the same data key', async () => {
  const vault = await createVault('primera clave larga', user, ITERATIONS);
  const sealed = await encryptNote(vault.key, user, noteA, { titulo: 'T', contenido_md: 'cuerpo' });
  const rewrapped = await rewrapVault(
    'primera clave larga',
    'segunda clave larga',
    user,
    vault,
    ITERATIONS,
  );
  assert.notEqual(rewrapped.sal, vault.sal);
  await assert.rejects(
    unlockVault('primera clave larga', user, rewrapped),
    WrongMasterPasswordError,
  );
  const key = await unlockVault('segunda clave larga', user, rewrapped);
  assert.deepEqual(await decryptNote(key, user, noteA, sealed), {
    titulo: 'T',
    contenido_md: 'cuerpo',
  });
  await assert.rejects(
    rewrapVault('incorrecta!!!!', 'otra clave larga', user, vault, ITERATIONS),
    WrongMasterPasswordError,
  );
});

test('envelopes are bound to their record, tamper-evident and use a fresh IV', async () => {
  const { key } = await createVault('clave de prueba 123', user, ITERATIONS);
  const note = { titulo: 'Privada', contenido_md: 'secreto' };
  const first = await encryptNote(key, user, noteA, note);
  const second = await encryptNote(key, user, noteA, note);
  assert.notEqual(first, second);
  assert.notEqual(first.split('.')[1], second.split('.')[1]);
  assert.deepEqual(await decryptNote(key, user, noteA, first), note);
  // Moved to another note or account.
  await assert.rejects(decryptNote(key, user, noteB, first), UnreadableEnvelopeError);
  await assert.rejects(decryptNote(key, otherUser, noteA, first), UnreadableEnvelopeError);
  // One flipped character of ciphertext.
  const [version, iv, data] = first.split('.') as [string, string, string];
  const flipped = `${version}.${iv}.${data[0] === 'A' ? 'B' : 'A'}${data.slice(1)}`;
  await assert.rejects(decryptNote(key, user, noteA, flipped), UnreadableEnvelopeError);
  // Another key.
  const other = await createVault('otra clave distinta', user, ITERATIONS);
  await assert.rejects(decryptNote(other.key, user, noteA, first), UnreadableEnvelopeError);
  for (const invalid of ['', 'v2.x.y', 'v1.short.AAAAAAAAAAAAAAAAAAAAAA', `v1.${iv}.${data}=`])
    assert.equal(isEnvelope(invalid), false, invalid);
  await assert.rejects(decryptBytes(key, noteAad(user, noteA), 'v1.bad'), UnreadableEnvelopeError);
});

test('the largest valid note fits the database envelope limit', async () => {
  const { key } = await createVault('clave de prueba 123', user, ITERATIONS);
  for (const contenido_md of [
    '"'.repeat(1_000_000),
    '€'.repeat(333_333),
    '\u0001'.repeat(1_000_000),
  ]) {
    const envelope = await encryptNote(key, user, noteA, {
      titulo: '📝'.repeat(200),
      contenido_md,
    });
    assert.ok(envelope.length < 1_400_000, `${envelope.length}`);
  }
  const raw = await encryptBytes(key, 'x', new Uint8Array(0));
  assert.equal((await decryptBytes(key, 'x', raw)).length, 0);
});

test('the extension key: exported once, re-imported non-extractable, same data key as the app', async () => {
  const vault = await createVault('correct horse battery', user, ITERATIONS);
  const sealed = await encryptJson(vault.key, 'ctx', { secreto: 'valor' });
  await assert.rejects(
    unlockVaultExtractable('wrong password!!', user, vault),
    WrongMasterPasswordError,
  );
  const raw = await exportRawKey(
    await unlockVaultExtractable('correct horse battery', user, vault),
  );
  assert.match(raw, /^[A-Za-z0-9_-]{43}$/);
  const key = await importRawKey(raw);
  await assert.rejects(crypto.subtle.exportKey('raw', key));
  assert.deepEqual(await decryptJson(key, 'ctx', sealed), { secreto: 'valor' });
  const back = await encryptJson(key, 'ctx', { otro: 1 });
  assert.deepEqual(await decryptJson(vault.key, 'ctx', back), { otro: 1 });
  await assert.rejects(importRawKey('AAAA'), UnreadableEnvelopeError);
});
