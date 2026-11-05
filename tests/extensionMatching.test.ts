import assert from 'node:assert/strict';
import test from 'node:test';
import { displayHost, matchCredentials, matchSite } from '../extension/src/shared/matching.ts';
import { pickLoginFields } from '../extension/src/shared/fields.ts';

test('matchSite: exact host, ignoring one www.', () => {
  assert.equal(matchSite('https://example.com', 'https://example.com/login'), 'exact');
  assert.equal(matchSite('https://www.example.com', 'https://example.com/'), 'exact');
  assert.equal(matchSite('https://example.com', 'https://www.example.com/a?b'), 'exact');
  assert.equal(matchSite('https://EXAMPLE.com', 'http://example.com'), 'exact');
});

test('matchSite: subdomains of the stored host are related, never the other way round', () => {
  assert.equal(matchSite('https://empresa.com', 'https://login.empresa.com'), 'subdomain');
  assert.equal(matchSite('https://login.empresa.com', 'https://empresa.com'), null);
  assert.equal(matchSite('https://empresa.com', 'https://notempresa.com'), null);
});

test('matchSite: tenants of shared hosts never match each other', () => {
  assert.equal(
    matchSite('https://chambapp-tracker.vercel.app', 'https://attacker.vercel.app'),
    null,
  );
  assert.equal(matchSite('https://me.github.io', 'https://you.github.io'), null);
  assert.equal(matchSite('https://empresa.odoo.com', 'https://otra.odoo.com'), null);
  assert.equal(matchSite('https://shop.co.uk', 'https://evil.co.uk'), null);
  // A stored public suffix only relates (with confirmation), it is never exact.
  assert.equal(matchSite('https://vercel.app', 'https://x.vercel.app'), 'subdomain');
});

test('matchSite: IPs and localhost need the same port; non-http never matches', () => {
  assert.equal(matchSite('http://127.0.0.1:5173', 'http://127.0.0.1:5173/login'), 'exact');
  assert.equal(matchSite('http://127.0.0.1:5173', 'http://127.0.0.1:8080/'), null);
  assert.equal(matchSite('http://localhost', 'http://localhost:3000'), null);
  assert.equal(matchSite('https://example.com:8443', 'https://example.com/'), null);
  assert.equal(matchSite('https://example.com', 'https://example.com:8443/'), 'exact');
  assert.equal(matchSite('https://example.com', 'chrome://settings'), null);
  assert.equal(matchSite('ftp://example.com', 'https://example.com'), null);
  assert.equal(matchSite('', 'https://example.com'), null);
});

test('matchCredentials splits exact and related entries', () => {
  const items = [
    { id: 1, url: 'https://empresa.com' },
    { id: 2, url: 'https://sso.empresa.com' },
    { id: 3, url: '' },
    { id: 4, url: 'https://otro.com' },
  ];
  const result = matchCredentials(items, 'https://sso.empresa.com/login');
  assert.deepEqual(
    result.exact.map((item) => item.id),
    [2],
  );
  assert.deepEqual(
    result.related.map((item) => item.id),
    [1],
  );
  assert.equal(displayHost('https://Login.Empresa.com:8443/x'), 'login.empresa.com:8443');
  assert.equal(displayHost('about:blank'), null);
});

test('pickLoginFields prefers labelled fields and falls back to the first of each kind', () => {
  const field = (id: string, etiqueta: string, secreto: boolean) => ({ id, etiqueta, secreto });
  const picked = pickLoginFields([
    field('a', 'Notas', false),
    field('b', 'Correo', false),
    field('c', 'PIN', true),
    field('d', 'Contraseña', true),
  ]);
  assert.equal(picked.username?.id, 'b');
  assert.equal(picked.password?.id, 'd');
  const fallback = pickLoginFields([field('x', 'Cuenta', false), field('y', 'Token', true)]);
  assert.equal(fallback.username?.id, 'x');
  assert.equal(fallback.password?.id, 'y');
  assert.deepEqual(pickLoginFields([]), { username: null, password: null });
});
