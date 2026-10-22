import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJson, compareJson } from '../src/features/developer/json.model.ts';
import { generatePlainText } from '../src/features/fake-data/plainText.ts';
test('JSON comparison ignores object order but preserves arrays, types and null', () => {
  assert.deepEqual(compareJson({ a: 1, b: null }, { b: null, a: 1 }), []);
  assert.equal(compareJson([1, 2], [2, 1]).length, 2);
  assert.equal(compareJson(1, '1')[0]?.kind, 'Modificado');
  assert.equal(compareJson(null, {})[0]?.kind, 'Modificado');
});
test('JSON comparison detects missing fields and escapes pointers', () => {
  assert.deepEqual(
    compareJson({ 'a/b': 1, '~': false }, { 'a/b': 2, new: null }).map((d) => [d.path, d.kind]),
    [
      ['/a~1b', 'Modificado'],
      ['/~0', 'Eliminado'],
      ['/new', 'Añadido'],
    ],
  );
  assert.equal(compareJson(JSON.parse('{"__proto__":1}'), {})[0]?.kind, 'Eliminado');
});
test('parser accepts scalar roots and rejects malformed and excessive input', () => {
  assert.equal(parseJson('null'), null);
  assert.throws(() => parseJson('{'));
  assert.throws(() => parseJson(' '));
  assert.throws(() => parseJson('['.repeat(62) + '0' + ']'.repeat(62)));
  assert.throws(() => parseJson(JSON.stringify(Array(5001).fill(1))));
});
test('plain text respects exact requested character count and bounds', () => {
  for (const n of [1, 17, 500, 100000]) assert.equal(generatePlainText(n).length, n);
  for (const n of [0, -1, 1.5, 100001, NaN]) assert.throws(() => generatePlainText(n));
});
