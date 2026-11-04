import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CREDENTIAL_LIMITS,
  MAX_CREDENTIAL_ENVELOPE,
  PASSWORD_ALPHABET,
  credentialMatches,
  credentialProblem,
  defaultCredential,
  generatePassword,
  normalizeCredential,
  parseCredential,
  safeUrl,
} from '../src/features/passwords/credentials.model.ts';
import type { CredentialSecret } from '../src/features/passwords/credentials.model.ts';
import { createVault, credentialAad, encryptJson } from '../src/lib/crypto/vault.ts';
import { noteSearchExcerpt } from '../src/features/notes/notes.model.ts';

const user = '11111111-1111-4111-8111-111111111111';

test('a new entry has a user field and a hidden password field', () => {
  const entry = defaultCredential();
  assert.equal(entry.nombre, '');
  assert.deepEqual(
    entry.campos.map(({ etiqueta, valor, secreto }) => ({ etiqueta, valor, secreto })),
    [
      { etiqueta: 'Usuario', valor: '', secreto: false },
      { etiqueta: 'Contraseña', valor: '', secreto: true },
    ],
  );
  assert.notEqual(entry.campos[0]!.id, entry.campos[1]!.id);
});

test('entries validate names, addresses, field limits and control characters', () => {
  const valid: CredentialSecret = {
    ...defaultCredential(),
    nombre: ' VPN cliente ',
    url: 'https://vpn.example.com',
  };
  valid.campos.push({ ...valid.campos[0]!, id: crypto.randomUUID(), etiqueta: 'Dominio' });
  valid.campos.push({
    ...valid.campos[0]!,
    id: crypto.randomUUID(),
    etiqueta: 'PIN',
    secreto: true,
  });
  assert.equal(credentialProblem(valid), null);
  assert.deepEqual(parseCredential(normalizeCredential(valid)), normalizeCredential(valid));
  assert.equal(normalizeCredential(valid).nombre, 'VPN cliente');
  const field = valid.campos[0]!;
  for (const invalid of [
    { ...valid, nombre: '  ' },
    { ...valid, nombre: 'x'.repeat(121) },
    { ...valid, url: 'javascript:alert(1)' },
    { ...valid, url: 'ftp://example.com' },
    { ...valid, campos: [] },
    { ...valid, campos: Array.from({ length: 31 }, () => ({ ...field, id: crypto.randomUUID() })) },
    { ...valid, campos: [{ ...field, etiqueta: '' }] },
    { ...valid, campos: [{ ...field, etiqueta: 'x'.repeat(61) }] },
    { ...valid, campos: [{ ...field, valor: 'x'.repeat(1001) }] },
    { ...valid, campos: [{ ...field, valor: 'linea\nsegunda' }] },
    { ...valid, campos: [{ ...field, valor: 'tab\there' }] },
  ])
    assert.notEqual(credentialProblem(invalid), null, JSON.stringify(invalid).slice(0, 80));
  assert.equal(parseCredential({ ...valid, campos: [{ ...field, secreto: 'no' }] }), null);
  assert.equal(parseCredential(null), null);
  assert.equal(safeUrl('https://a.example/x?y=1'), 'https://a.example/x?y=1');
  assert.equal(safeUrl('javascript:alert(1)'), null);
});

test('the largest valid entry fits the database envelope limit', async () => {
  const { key } = await createVault('clave de prueba 123', user, 1000);
  const worst = (char: string): CredentialSecret => ({
    nombre: char.repeat(CREDENTIAL_LIMITS.nombre),
    url: char.repeat(CREDENTIAL_LIMITS.url),
    campos: Array.from({ length: CREDENTIAL_LIMITS.campos }, () => ({
      id: crypto.randomUUID(),
      etiqueta: char.repeat(CREDENTIAL_LIMITS.etiqueta),
      valor: char.repeat(CREDENTIAL_LIMITS.valor),
      secreto: true,
    })),
  });
  for (const char of ['"', '\\', '😀', '€', ' ']) {
    const envelope = await encryptJson(key, credentialAad(user, crypto.randomUUID()), worst(char));
    assert.ok(envelope.length < MAX_CREDENTIAL_ENVELOPE, `${char}: ${envelope.length}`);
  }
});

test('search uses names, addresses, labels and visible values but never hidden values', () => {
  const entry: CredentialSecret = {
    nombre: 'Panel Odoo',
    url: 'https://erp.example.com',
    campos: [
      { id: crypto.randomUUID(), etiqueta: 'Usuario', valor: 'aitor.angulo', secreto: false },
      { id: crypto.randomUUID(), etiqueta: 'Contraseña', valor: 'SuperSecreta', secreto: true },
    ],
  };
  for (const query of ['', 'odoo', 'ERP.example', 'aitor', 'contrasena'])
    assert.equal(credentialMatches(entry, query), true, query);
  assert.equal(credentialMatches(entry, 'supersecreta'), false);
});

test('generated passwords use the alphabet uniformly without modulo bias', () => {
  const password = generatePassword();
  assert.equal(password.length, 20);
  assert.ok([...password].every((char) => PASSWORD_ALPHABET.includes(char)));
  assert.notEqual(generatePassword(), generatePassword());
  // Values at or above the largest multiple of the alphabet size are discarded.
  const alphabet = 'abcdefg';
  const limit = Math.floor(0x1_0000_0000 / 7) * 7;
  const sequence = [limit, limit + 1, 0, 1, 2, 0xffff_ffff, 3, 4];
  let index = 0;
  const fake = (buffer: Uint32Array<ArrayBuffer>) => {
    for (let i = 0; i < buffer.length; i += 1) buffer[i] = sequence[index++ % sequence.length]!;
  };
  assert.equal(generatePassword(5, alphabet, fake), 'abcde');
  const counts = new Map<string, number>();
  for (const char of generatePassword(70_000, alphabet))
    counts.set(char, (counts.get(char) ?? 0) + 1);
  for (const char of alphabet) assert.ok(Math.abs(counts.get(char)! - 10_000) < 600, char);
});

test('note search excerpts show the match inside the body', () => {
  const body = `${'Introducción. '.repeat(20)}La reunión con el cliente fue bien. ${'fin '.repeat(40)}`;
  const parts = noteSearchExcerpt(body, 'REUNION');
  const match = parts.find((part) => part.match);
  assert.equal(match?.text, 'reunión');
  assert.ok(parts[0]!.text.startsWith('…'));
  assert.ok(parts.at(-1)!.text.endsWith('…'));
  assert.ok(parts.map((part) => part.text).join('').length <= 104);
  assert.deepEqual(noteSearchExcerpt('Texto corto', ''), [{ text: 'Texto corto', match: false }]);
  assert.deepEqual(noteSearchExcerpt('', 'x'), []);
  assert.deepEqual(
    noteSearchExcerpt('Café ÁRBOL 📝 cosas', 'arbol 📝').find((p) => p.match),
    {
      text: 'ÁRBOL 📝',
      match: true,
    },
  );
  assert.deepEqual(noteSearchExcerpt('sin coincidencia', 'zzz'), [
    { text: 'sin coincidencia', match: false },
  ]);
});
