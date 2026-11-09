import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accountKey,
  itemAccount,
  normalizeLocalOrigin,
  sameAccount,
} from '../extension/src/shared/backend.ts';

const user = '00000000-0000-4000-8000-000000000001';

test('the local address is a bare http(s) origin', () => {
  assert.equal(normalizeLocalOrigin(' http://127.0.0.1:47800/ '), 'http://127.0.0.1:47800');
  assert.equal(normalizeLocalOrigin('http://localhost:5000'), 'http://localhost:5000');
  for (const bad of [
    'ftp://127.0.0.1',
    'http://user:pass@127.0.0.1:47800',
    'http://127.0.0.1:47800/rest/v1',
    'http://127.0.0.1:47800/?x=1',
    '127.0.0.1:47800',
    '',
  ])
    assert.throws(() => normalizeLocalOrigin(bad), Error, bad);
});

test('local installations and data generations are different accounts', () => {
  const a = accountKey({
    backend: 'local',
    origin: 'http://127.0.0.1:47800',
    installation: 'i-1',
    generation: 'g-1',
  });
  const b = accountKey({
    backend: 'local',
    origin: 'http://127.0.0.1:47801',
    installation: 'i-1',
    generation: 'g-1',
  });
  const restored = accountKey({
    backend: 'local',
    origin: 'http://127.0.0.1:47800',
    installation: 'i-1',
    generation: 'g-2',
  });
  const reinstalled = accountKey({
    backend: 'local',
    origin: 'http://127.0.0.1:47800',
    installation: 'i-2',
    generation: 'g-1',
  });
  const cloud = accountKey({ backend: 'nube', userId: user });
  assert.equal(new Set([a, b, restored, reinstalled, cloud]).size, 5);
  // Same user id everywhere, yet none of them matches another.
  assert.equal(sameAccount(a, restored), false);
  assert.equal(sameAccount(user, a), false, 'a bare user id never names a local account');
  assert.equal(sameAccount(a, a), true);
  assert.equal(sameAccount(user, cloud), true, 'cloud callers may still pass the user id');
  assert.equal(sameAccount(cloud, cloud), true);
});

test('queue items saved before accounts existed belong to their cloud user', () => {
  assert.equal(itemAccount({ request: { userId: user } }), `nube:${user}`);
  assert.equal(itemAccount({ account: 'local:x', request: { userId: user } }), 'local:x');
});
