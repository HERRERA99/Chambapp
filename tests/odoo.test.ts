import assert from 'node:assert/strict';
import test from 'node:test';
import { isOdooId, isOdooUrl, normalizeOdooId, normalizeOdooUrl } from '../src/domain/odoo.ts';

test('optional Odoo metadata can be cleared independently and task IDs normalize to uppercase', () => {
  assert.equal(normalizeOdooId(' t443212 '), 'T443212');
  assert.equal(normalizeOdooId('T00042'), 'T00042');
  assert.equal(normalizeOdooId('   '), null);
  assert.equal(normalizeOdooUrl('   '), null);
  for (const invalid of ['443212', 'T', 'T44.32', 'T-42', 'T 42', 'TASK42', 'T٤٢'])
    assert.throws(() => normalizeOdooId(invalid), /T seguido de números/);
  assert.equal(isOdooId('t42'), false);
  assert.equal(isOdooId('T42 '), false);
  assert.equal(isOdooId('T' + '4'.repeat(64)), false);
});

test('Odoo navigation preserves task query strings and hash routes', () => {
  const url = 'https://odoo.example.com/web#id=443212&model=project.task&view_type=form';
  assert.equal(normalizeOdooUrl(` ${url} `), url);
  assert.equal(isOdooUrl(url), true);
  assert.equal(isOdooUrl('http://localhost:8069/odoo/project.task/443212'), true);
  assert.equal(isOdooUrl('https://odoo.example.com/odoo/action-123/443212?menu_id=42'), true);
});

test('Odoo URL normalization stores canonical IDNA and IPv4 hosts', () => {
  assert.equal(
    normalizeOdooUrl('https://área.example.com/web#id=443212&model=project.task'),
    'https://xn--rea-dla.example.com/web#id=443212&model=project.task',
  );
  assert.equal(
    normalizeOdooUrl('http://2130706433:8069/web#id=42'),
    'http://127.0.0.1:8069/web#id=42',
  );
  assert.equal(
    normalizeOdooUrl('HTTPS://ODOO.EXAMPLE.COM:443/web?menu_id=42#id=443212'),
    'https://odoo.example.com/web?menu_id=42#id=443212',
  );
  assert.throws(
    () => normalizeOdooUrl('https://odoo.example.com/' + 'ñ'.repeat(340)),
    /2048 caracteres/,
  );
});

test('Odoo links reject executable schemes, credentials and parser-repaired unsafe URLs', () => {
  for (const invalid of [
    'javascript:alert(1)',
    'data:text/html,test',
    '//odoo.example.com/web',
    'odoo.example.com/web',
    'https:odoo.example.com',
    'https://user:password@odoo.example.com/web',
    'https://user@odoo.example.com/web',
    'https://odoo.example.com/a b',
    'https://odoo.example.com/\nweb',
    'https://odoo.example.com/\u0000web',
    'https://odoo.example.com\\@other.example/web',
    'https://',
    'https://odoo.example.com:99999/web',
    'https://%zz/web',
    'https://[a::b::c]/web',
    'https://odoo.example.com/' + 'a'.repeat(2048),
  ]) {
    assert.equal(isOdooUrl(invalid), false, invalid);
    assert.throws(() => normalizeOdooUrl(invalid), /enlace completo/);
  }
  assert.equal(isOdooUrl(null), false);
  assert.equal(isOdooUrl({ href: 'https://odoo.example.com' }), false);
});
