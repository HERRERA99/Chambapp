import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DOCUMENT_TYPES,
  EUROPEAN_TAX_COUNTRIES,
  generateDocument,
  generateEuropeanTaxId,
  generateIsin,
  generateLei,
  generatePassport,
  generateSocialSecurity,
  validateIsin,
  validateLei,
} from '../src/features/fake-data/identifiers.ts';
import type { DocumentType, TaxCountry } from '../src/features/fake-data/identifiers.ts';

function seededRandom(seed = 42): () => number {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

const nifLetters = 'TRWAGMYFPDXBNJZSQVHLCKE';

function mod97(value: string): number {
  const decimal = value.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
  return Number(BigInt(decimal) % 97n);
}

function checkLuhn(value: string): boolean {
  const digits = value.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
  let total = 0;
  for (let index = 0; index < digits.length; index++) {
    let digit = Number(digits[index]);
    if ((digits.length - index) % 2 === 0) digit *= 2;
    total += digit > 9 ? digit - 9 : digit;
  }
  return total % 10 === 0;
}

test('Spanish documents cover DNI/NIF, NIE prefixes and S.L. NIF control characters', () => {
  const random = seededRandom();
  const prefixes = new Set<string>();
  for (let index = 0; index < 200; index++) {
    for (const { value: type } of DOCUMENT_TYPES) {
      const document = generateDocument(type, random);
      if (type === 'cif') {
        assert.match(document, /^B\d{8}$/);
        const digits = [...document.slice(1, 8)].map(Number);
        const odd = [0, 2, 4, 6].reduce((sum, offset) => {
          const doubled = digits[offset]! * 2;
          return sum + (doubled > 9 ? doubled - 9 : doubled);
        }, 0);
        const even = digits[1]! + digits[3]! + digits[5]!;
        assert.equal(Number(document[8]), (10 - ((odd + even) % 10)) % 10);
      } else {
        let body = document.slice(0, -1);
        if (type === 'nie') {
          assert.match(document, /^[XYZ]\d{7}[A-Z]$/);
          prefixes.add(document[0]!);
          body = `${'XYZ'.indexOf(body[0]!)}${body.slice(1)}`;
        } else assert.match(document, /^\d{8}[A-Z]$/);
        assert.equal(document.at(-1), nifLetters[Number(body) % 23]);
      }
    }
  }
  assert.deepEqual([...prefixes].sort(), ['X', 'Y', 'Z']);
  // Interior's published example 12345678Z, independently chosen numeric body.
  assert.equal(
    generateDocument('dni', () => (12_345_678 - 1) / 99_999_999),
    '12345678Z',
  );
  assert.equal(generateDocument('dni', seededRandom()), generateDocument('nif', seededRandom()));
});

test('passport and Social Security generators support leading zeros and both control branches', () => {
  const random = seededRandom();
  for (let index = 0; index < 200; index++) {
    assert.match(generatePassport(random), /^[A-Z]{3}\d{6}$/);
    const nss = generateSocialSecurity(random);
    assert.match(nss, /^\d{12}$/);
    const province = Number(nss.slice(0, 2));
    const account = Number(nss.slice(2, 10));
    assert.ok(province >= 1 && province <= 52);
    const base = `${province}${String(account).padStart(account < 10_000_000 ? 7 : 8, '0')}`;
    assert.equal(Number(nss.slice(-2)), Number(BigInt(base) % 97n));
  }
  const withParts = (province: number, account: number) => {
    const samples = [(province - 1) / 52, (account - 1) / 99_999_999];
    return generateSocialSecurity(() => samples.shift()!);
  };
  assert.equal(withParts(28, 12_345_678), '281234567840');
  const short = withParts(28, 1_234_567);
  assert.equal(short.slice(0, 10), '2801234567');
  assert.equal(Number(short.slice(-2)), 281_234_567 % 97);
  assert.notEqual(Number(short.slice(-2)), 2_801_234_567 % 97);
  for (const account of [9_999_999, 10_000_000]) {
    const nss = withParts(28, account);
    assert.equal(
      Number(nss.slice(-2)),
      (28 * (account < 10_000_000 ? 10_000_000 : 100_000_000) + account) % 97,
    );
  }
  assert.equal(
    generateSocialSecurity(() => 0),
    '010000000177',
  );
});

test('European identifiers use distinct personal-tax formats and independently checked control rules', () => {
  const random = seededRandom();
  assert.equal(EUROPEAN_TAX_COUNTRIES.length, 7);
  assert.match(
    EUROPEAN_TAX_COUNTRIES.find((country) => country.value === 'FR')!.note!,
    /solo formato/,
  );
  const belgianCenturies = new Set<boolean>();
  for (let index = 0; index < 200; index++) {
    for (const { value: country } of EUROPEAN_TAX_COUNTRIES) {
      const value = generateEuropeanTaxId(country, random);
      switch (country) {
        case 'ES':
          assert.match(value, /^\d{8}[A-Z]$/);
          assert.equal(value.at(-1), nifLetters[Number(value.slice(0, -1)) % 23]);
          break;
        case 'DE': {
          assert.match(value, /^[1-9]\d{10}$/);
          const frequencies = [...new Set(value.slice(0, 10))].map(
            (digit) => value.slice(0, 10).split(digit).length - 1,
          );
          assert.equal(frequencies.length, 9);
          assert.equal(frequencies.filter((count) => count === 2).length, 1);
          let product = 10;
          for (const digit of value.slice(0, 10)) {
            let sum = Number(digit) + product;
            while (sum > 10) sum -= 10;
            product = (sum * 2) % 11;
          }
          assert.equal(Number(value.at(-1)), (11 - product) % 10);
          break;
        }
        case 'FR':
          assert.match(value, /^[0-3]\d{12}$/);
          assert.notEqual(Number(value), 0);
          break;
        case 'IT': {
          assert.match(value, /^DMODMO\d{2}[ABCDEHLMPRST]\d{2}H501[A-Z]$/);
          const oddValues = Object.fromEntries(
            [...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((char, offset) => [
              char,
              [
                1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20,
                11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23,
              ][offset]!,
            ]),
          );
          const total = [...value.slice(0, 15)].reduce((sum, char, offset) => {
            if (offset % 2 === 0) return sum + oddValues[char]!;
            return sum + ('0123456789'.includes(char) ? Number(char) : char.charCodeAt(0) - 65);
          }, 0);
          assert.equal(value.at(-1), String.fromCharCode(65 + (total % 26)));
          const day = Number(value.slice(9, 11));
          assert.ok((day >= 1 && day <= 28) || (day >= 41 && day <= 68));
          break;
        }
        case 'PT': {
          assert.match(value, /^[12]\d{8}$/);
          const sum = [...value.slice(0, 8)].reduce(
            (total, digit, offset) => total + Number(digit) * (9 - offset),
            0,
          );
          const check = 11 - (sum % 11);
          assert.equal(Number(value[8]), check > 9 ? 0 : check);
          break;
        }
        case 'BE': {
          assert.match(value, /^\d{11}$/);
          const since2000 = Number(value.slice(0, 2)) <= 7;
          belgianCenturies.add(since2000);
          const body = `${since2000 ? '2' : ''}${value.slice(0, 9)}`;
          assert.equal(Number(value.slice(-2)), 97 - Number(BigInt(body) % 97n));
          assert.ok(Number(value.slice(2, 4)) >= 1 && Number(value.slice(2, 4)) <= 12);
          assert.ok(Number(value.slice(4, 6)) >= 1 && Number(value.slice(4, 6)) <= 28);
          break;
        }
        case 'NL': {
          assert.match(value, /^[1-9]\d{8}$/);
          const sum = [...value].reduce(
            (total, digit, offset) => total + Number(digit) * (offset === 8 ? -1 : 9 - offset),
            0,
          );
          assert.equal(sum % 11, 0);
          break;
        }
      }
    }
  }
  assert.equal(belgianCenturies.size, 2);
});

test('LEI validator accepts published examples and rejects changed controls, reserves and invalid text', () => {
  for (const example of ['506700GE1G29325QX363', '529900T8BM49AURSDO55']) {
    assert.equal(validateLei(example), true);
    assert.equal(mod97(example), 1);
    assert.equal(validateLei(` ${example.toLowerCase().slice(0, 4)} ${example.slice(4)} `), true);
    assert.equal(validateLei(`${example.slice(0, -1)}${(Number(example.at(-1)) + 1) % 10}`), false);
  }
  const invalidReserve = '000001DEMO00000000';
  const withChecksum = `${invalidReserve}${String(98 - mod97(`${invalidReserve}00`)).padStart(2, '0')}`;
  assert.equal(mod97(withChecksum), 1);
  assert.equal(validateLei(withChecksum), false);
  for (const invalid of [
    '',
    '00000000000000000001',
    '506700GE1G29325QX399',
    '506700GE1G29325QX36!',
    '506700GE1G29325QX3630',
  ])
    assert.equal(validateLei(invalid), false);
});

test('ISIN validator checks published fixtures, expanded-letter Luhn and recognized country codes', () => {
  for (const example of ['US0378331005', 'GB0002634946', 'ES0178430E18']) {
    assert.equal(checkLuhn(example), true);
    assert.equal(validateIsin(example), true);
    assert.equal(validateIsin(` ${example.toLowerCase().slice(0, 2)} ${example.slice(2)} `), true);
    assert.equal(
      validateIsin(`${example.slice(0, -1)}${(Number(example.at(-1)) + 1) % 10}`),
      false,
    );
  }
  for (const invalid of [
    '',
    'QQ0000000007',
    'US037833100A',
    'US037833100',
    'US03783310055',
    'US0378-31005',
  ])
    assert.equal(validateIsin(invalid), false);
  assert.throws(() => generateIsin('QQ'), /país/);
});

test('synthetic LEIs and ISINs retain demo markers and mathematical validity across seeded batches', () => {
  const random = seededRandom();
  for (let index = 0; index < 200; index++) {
    const lei = generateLei(random);
    assert.match(lei, /^000000DEMO[A-Z0-9]{8}\d{2}$/);
    assert.equal(validateLei(lei), true);
    assert.equal(mod97(lei), 1);
    for (const { value: country } of EUROPEAN_TAX_COUNTRIES) {
      const isin = generateIsin(country, random);
      assert.match(isin, new RegExp(`^${country}DEMO\\d{6}$`));
      assert.equal(validateIsin(isin), true);
      assert.equal(checkLuhn(isin), true);
    }
  }
  assert.equal(generateLei(seededRandom()), generateLei(seededRandom()));
  assert.equal(generateIsin('ES', seededRandom()), generateIsin('ES', seededRandom()));
});

test('all generators terminate for constant RNGs, remain deterministic, and reject bad sources', () => {
  const generators = [
    ...DOCUMENT_TYPES.map(
      ({ value }) =>
        (random: () => number) =>
          generateDocument(value, random),
    ),
    ...EUROPEAN_TAX_COUNTRIES.map(
      ({ value }) =>
        (random: () => number) =>
          generateEuropeanTaxId(value, random),
    ),
    generatePassport,
    generateSocialSecurity,
    generateLei,
    (random: () => number) => generateIsin('ES', random),
  ];
  for (const generate of generators) {
    assert.equal(generate(seededRandom()), generate(seededRandom()));
    assert.ok(generate(() => 0));
    assert.ok(generate(() => 1 - Number.EPSILON));
    for (const sample of [-1, 1, NaN, Infinity])
      assert.throws(() => generate(() => sample), /aleatoria/);
  }
  assert.throws(() => generateDocument('unknown' as DocumentType), /documento/);
  assert.throws(() => generateEuropeanTaxId('XX' as TaxCountry), /País/);
});
