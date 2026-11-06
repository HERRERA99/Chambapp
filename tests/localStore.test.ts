import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalStore, memoryStorage } from '../src/lib/local/store.ts';
import { LocalCommandError } from '../src/lib/local/types.ts';
import type { LocalSnapshot } from '../src/lib/local/types.ts';

const user = '00000000-0000-4000-8000-000000000001';
const key = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);

const addProject = (name: string) => (snapshot: LocalSnapshot) => {
  const next = structuredClone(snapshot);
  next.proyectos.push({ nombre: name } as LocalSnapshot['proyectos'][number]);
  return { snapshot: next, result: next.proyectos.length };
};

test('stores the snapshot encrypted and reads it back', async () => {
  const storage = memoryStorage();
  const store = new LocalStore(storage, user, await key(), 'g1');
  assert.equal(await store.load(), null);
  assert.equal(await store.mutate(addProject('Kialens')), 1);
  const raw = JSON.stringify([...storage.records.values()]);
  assert.ok(!raw.includes('Kialens'), 'nothing readable is stored');
  const loaded = await store.load();
  assert.equal(loaded?.revision, 1);
  assert.equal(loaded?.snapshot.proyectos[0]?.nombre, 'Kialens');
});

test('two tabs writing at once: both changes survive (compare-and-swap + rerun)', async () => {
  const storage = memoryStorage();
  const shared = await key();
  const tabA = new LocalStore(storage, user, shared, 'g1');
  const tabB = new LocalStore(storage, user, shared, 'g1');
  await Promise.all([tabA.mutate(addProject('A')), tabB.mutate(addProject('B'))]);
  const loaded = await tabA.load();
  assert.deepEqual(loaded?.snapshot.proyectos.map((row) => row.nombre).sort(), ['A', 'B']);
  assert.equal(loaded?.revision, 2);
});

test('gives up with DATOS_LOCALES_OCUPADOS when another writer always wins', async () => {
  const storage = memoryStorage();
  const store = new LocalStore(storage, user, await key(), 'g1');
  await store.mutate(addProject('A'));
  const original = storage.compareAndSet.bind(storage);
  storage.compareAndSet = async () => false;
  await assert.rejects(
    store.mutate(addProject('B')),
    (error: unknown) =>
      error instanceof LocalCommandError && error.code === 'DATOS_LOCALES_OCUPADOS',
  );
  storage.compareAndSet = original;
  // A failed change does not block the queue.
  assert.equal(await store.mutate(addProject('C')), 2);
});

test('another vault generation or key cannot read the data', async () => {
  const storage = memoryStorage();
  await new LocalStore(storage, user, await key(), 'g1').mutate(addProject('A'));
  const unreadable = (error: unknown) =>
    error instanceof LocalCommandError && error.code === 'DATOS_LOCALES_ILEGIBLES';
  await assert.rejects(new LocalStore(storage, user, await key(), 'g2').load(), unreadable);
  await assert.rejects(new LocalStore(storage, user, await key(), 'g1').load(), unreadable);
});

test('a change that returns the same snapshot writes nothing; destroy removes the record', async () => {
  const storage = memoryStorage();
  const store = new LocalStore(storage, user, await key(), 'g1');
  await store.mutate(addProject('A'));
  await store.mutate((snapshot) => ({ snapshot, result: null }));
  assert.equal((await store.load())?.revision, 1);
  await store.destroy();
  assert.equal(await store.exists(), false);
});
