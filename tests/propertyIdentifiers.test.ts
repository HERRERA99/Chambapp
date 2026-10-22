import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateCadastralReference,
  generateCups,
  validateCadastralReference,
  validateCups,
} from '../src/features/fake-data/propertyIdentifiers.ts';
import type { CadastralKind, SupplyKind } from '../src/features/fake-data/propertyIdentifiers.ts';

function seededRandom(seed = 42): () => number {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

// Independent BigInt arithmetic protects the 16-digit path from Number rounding.
function cupsControls(body: string): string {
  const letters = 'TRWAGMYFPDXBNJZSQVHLCKE';
  const remainder = BigInt(body) % 529n;
  return `${letters[Number(remainder / 23n)]}${letters[Number(remainder % 23n)]}`;
}

test('cadastral verifier accepts official urban, rural and legacy diseminado worked examples', () => {
  // Dirección General del Catastro, OEP 2024, Bloque VI, Tema 25, pp. 3–4.
  for (const example of ['9770409VH5797S0001DX', '13077A018000390000MS', '002500400PH18B0001JS']) {
    assert.equal(validateCadastralReference(example), true, example);
    assert.equal(
      validateCadastralReference(` ${example.slice(0, 7).toLowerCase()} ${example.slice(7)} `),
      true,
    );
    const differentControl = example.at(-1) === 'M' ? 'Q' : 'M';
    assert.equal(validateCadastralReference(`${example.slice(0, -1)}${differentControl}`), false);
  }
  // The screenshot's placeholder is another independent urban control fixture.
  assert.equal(validateCadastralReference('6489501DF3868G0047ZH'), true);
});

test('cadastral verification rejects truncated, foreign-format and malformed references', () => {
  for (const invalid of [
    '',
    '9770409VH5797S0001D',
    '9770409VH5797S0001DX0',
    '9770409VH5797S0001D!',
    '9770409-VH5797S0001DX',
    '9770409VH5797S00A1DX',
    '13077A018000390000MM',
    '021602300000001001KP', // Álava uses its own foral system.
    '6981962490155524G', // Gipuzkoa uses its own foral system.
    '310000000001550820MA', // Navarra uses its own foral system.
  ])
    assert.equal(validateCadastralReference(invalid), false, invalid);
});

test('generated cadastral references keep urban/rural layouts and detect altered property sequence', () => {
  const random = seededRandom();
  const urbanReferences = new Set<string>();
  const ruralReferences = new Set<string>();
  for (let index = 0; index < 200; index++) {
    for (const kind of ['urban', 'rural'] as const) {
      const reference = generateCadastralReference(kind, random);
      assert.equal(reference.length, 20);
      assert.equal(validateCadastralReference(reference), true);
      if (kind === 'urban') {
        assert.match(reference, /^\d{7}[A-Z]{2}\d{4}[A-Z]\d{4}[A-Z]{2}$/);
        urbanReferences.add(reference);
      } else {
        assert.match(reference, /^\d{5}[A-Z]\d{12}[A-Z]{2}$/);
        const province = Number(reference.slice(0, 2));
        assert.ok(province >= 1 && province <= 52);
        assert.equal([1, 20, 31, 48].includes(province), false);
        assert.ok(Number(reference.slice(2, 5)) > 0);
        assert.ok(Number(reference.slice(6, 9)) > 0);
        assert.ok(Number(reference.slice(9, 14)) > 0);
        ruralReferences.add(reference);
      }
      // The last property digit has weight 1 in both control computations.
      const changedDigit = (Number(reference[17]) + 1) % 10;
      const changed = `${reference.slice(0, 17)}${changedDigit}${reference.slice(18)}`;
      assert.equal(validateCadastralReference(changed), false);
    }
  }
  assert.equal(urbanReferences.size, 200);
  assert.equal(ruralReferences.size, 200);
});

test('CUPS verifier accepts all BOE P.O. 10.8 worked examples and only specified suffixes', () => {
  // BOE-A-2009-19040, P.O. 10.8 §5, PDF page 83 (printed page 101323).
  for (const example of [
    'ES0987543210987654ZF',
    'ES1234123456789012JY1F',
    'ES1234123456789012JY1P',
    'ES9750210987654321CQ1C',
    'ES0999110012345678EK1X',
  ]) {
    assert.equal(validateCups(example), true, example);
    assert.equal(cupsControls(example.slice(2, 18)), example.slice(18, 20));
    assert.equal(validateCups(` ${example.slice(0, 6).toLowerCase()} ${example.slice(6)} `), true);
    const wrongControl = example[19] === 'T' ? 'R' : 'T';
    const changed = `${example.slice(0, 19)}${wrongControl}${example.slice(20)}`;
    assert.equal(validateCups(changed), false);
  }
  for (const suffix of ['0F', '9P', '1R', '2C', '3X', '4Y', '5Z'])
    assert.equal(validateCups(`ES0987543210987654ZF${suffix}`), true);
  for (const suffix of ['F1', '0A', '0T', '00', '1', 'P', '1PP'])
    assert.equal(validateCups(`ES0987543210987654ZF${suffix}`), false);
});

test('CUPS verification rejects invalid country, punctuation, lengths and excluded control letters', () => {
  for (const invalid of [
    '',
    'PT0987543210987654ZF',
    'ES0987543210987654ZI',
    'ES0987543210987654ZO',
    'ES0987543210987654ZU',
    'ES0987543210987654Z0',
    'ES0987543210987654Z',
    'ES0987543210987654ZFF',
    'ES0987-543210987654ZF',
    'ES09875432109876A4ZF',
  ])
    assert.equal(validateCups(invalid), false, invalid);
});

test('CUPS generation differentiates light and gas and preserves exact controls across seeded batches', () => {
  const random = seededRandom();
  const codes = new Set<string>();
  for (let index = 0; index < 200; index++) {
    for (const kind of ['electricity', 'gas'] as const) {
      const cups = generateCups(kind, random);
      assert.match(cups, /^ES\d{16}[A-Z]{2}$/);
      assert.equal(cups.slice(2, 6), kind === 'electricity' ? '0021' : '0230');
      assert.equal(cupsControls(cups.slice(2, 18)), cups.slice(18));
      assert.equal(validateCups(cups), true);
      const changedDigit = (Number(cups[17]) + 1) % 10;
      assert.equal(validateCups(`${cups.slice(0, 17)}${changedDigit}${cups.slice(18)}`), false);
      codes.add(cups);
    }
  }
  assert.equal(codes.size, 400);
});

test('property identifier generators are deterministic, bounded for constant RNGs and reject bad inputs', () => {
  const generators = [
    (random: () => number) => generateCadastralReference('urban', random),
    (random: () => number) => generateCadastralReference('rural', random),
    (random: () => number) => generateCups('electricity', random),
    (random: () => number) => generateCups('gas', random),
  ];
  for (const generate of generators) {
    assert.equal(generate(seededRandom()), generate(seededRandom()));
    for (const sample of [0, 1 - Number.EPSILON]) {
      const identifier = generate(() => sample);
      assert.equal(identifier.length, 20);
      assert.equal(
        identifier.startsWith('ES')
          ? validateCups(identifier)
          : validateCadastralReference(identifier),
        true,
      );
    }
    for (const sample of [-1, 1, NaN, Infinity])
      assert.throws(() => generate(() => sample), /aleatoria/);
  }
  assert.throws(() => generateCadastralReference('unknown' as CadastralKind), /catastral/);
  assert.throws(() => generateCups('unknown' as SupplyKind), /suministro/);
});
