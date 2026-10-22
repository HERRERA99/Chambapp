import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FAKE_DATA_CATEGORIES,
  fakeDataToCsv,
  fakeDataToJson,
  fakeDataToText,
  formatFakeDataRecords,
  generateFakeData,
} from '../src/features/fake-data/fakeData.model.ts';
import {
  DOCUMENT_TYPES,
  EUROPEAN_TAX_COUNTRIES,
  validateIsin,
  validateLei,
} from '../src/features/fake-data/identifiers.ts';
import {
  validateCadastralReference,
  validateCups,
} from '../src/features/fake-data/propertyIdentifiers.ts';
import type {
  FakeDataCategoryId,
  FakeDataRecord,
} from '../src/features/fake-data/fakeData.model.ts';

const referenceDate = new Date('2026-10-22T10:00:00Z');

function seededRandom(seed = 42): () => number {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

function values(record: FakeDataRecord): Record<string, string> {
  return Object.fromEntries(record.fields.map((item) => [item.key, item.value]));
}

function generate(category: FakeDataCategoryId, count = 20, seed = 42) {
  return generateFakeData(category, count, { referenceDate, random: seededRandom(seed) });
}

test('all categories generate complete deterministic batches with stable keys and distinct record IDs', () => {
  for (const category of FAKE_DATA_CATEGORIES) {
    const records = generate(category.id);
    assert.equal(records.length, 20);
    assert.deepEqual(records, generate(category.id));
    assert.equal(new Set(records.map((record) => record.id)).size, records.length);
    assert.notDeepEqual(records, generate(category.id, 20, 17));
    const keys = records[0]!.fields.map((item) => item.key);
    for (const record of records) {
      assert.equal(record.category, category.id);
      assert.ok(record.title);
      assert.ok(record.subtitle);
      assert.deepEqual(
        record.fields.map((item) => item.key),
        keys,
      );
      assert.equal(new Set(keys).size, keys.length);
      assert.ok(record.fields.every((item) => item.label && item.value));
    }
  }
  const fixed = generateFakeData('personal', 20, { referenceDate, random: () => 0 });
  assert.equal(new Set(fixed.map((record) => record.id)).size, fixed.length);
});

test('rejects invalid counts, categories, dates and invalid random sources', () => {
  for (const count of [0, -1, 21, 1.5, NaN, Infinity])
    assert.throws(() => generateFakeData('personal', count), /1 y 20/);
  assert.equal(generateFakeData('personal', 1).length, 1);
  assert.equal(generateFakeData('personal').length, 1);
  assert.throws(() => generateFakeData('unknown' as FakeDataCategoryId), /Categoría/);
  assert.throws(() => generateFakeData('personal', 1, { referenceDate: new Date(NaN) }), /Fecha/);
  for (const value of [-0.01, 1, NaN, Infinity])
    assert.throws(() => generateFakeData('personal', 1, { random: () => value }), /aleatoria/);
});

test('personal profiles have adult birth dates, valid DNI letters and Yopmail contact details by default', () => {
  for (const record of generate('personal')) {
    const profile = values(record);
    assert.match(profile.fullName!, /^\S+ \S+ \S+$/);
    assert.match(profile.dni!, /^\d{8}[A-Z]$/);
    const dniNumber = Number(profile.dni!.slice(0, 8));
    assert.equal(profile.dni!.at(-1), 'TRWAGMYFPDXBNJZSQVHLCKE'[dniNumber % 23]);
    assert.match(profile.email!, /^[a-z0-9.]+@yopmail\.com$/);
    assert.match(profile.phone!, /^[67]\d{8}$/);
    const [day, month, year] = profile.birthDate!.split('/').map(Number);
    const birthday = new Date(Date.UTC(year!, month! - 1, day!));
    let age = referenceDate.getUTCFullYear() - birthday.getUTCFullYear();
    if (
      referenceDate.getUTCMonth() < birthday.getUTCMonth() ||
      (referenceDate.getUTCMonth() === birthday.getUTCMonth() &&
        referenceDate.getUTCDate() < birthday.getUTCDate())
    )
      age--;
    assert.equal(Number(profile.age), age);
    assert.ok(age >= 18 && age <= 75);
    assert.equal(
      profile.fullName,
      `${profile.firstName} ${profile.firstSurname} ${profile.secondSurname}`,
    );
    assert.equal(profile.surnames, `${profile.firstSurname} ${profile.secondSurname}`);
    assert.equal(profile.holder, profile.fullName);
    assert.match(profile.passport!, /^[A-Z]{3}\d{6}$/);
    assert.match(profile.socialSecurity!, /^\d{12}$/);
    assert.match(profile.username!, /^[a-z]+\.[a-z]+\.\d{3}$/);
    assert.equal(profile.password!.length, 16);
    assert.match(profile.password!, /[A-Z]/);
    assert.match(profile.password!, /[a-z]/);
    assert.match(profile.password!, /[0-9]/);
    assert.match(profile.password!, /[!#%+?]/);
  }
});

test('Spanish postal codes, towns and provinces remain correlated and streets visibly mark test data', () => {
  const expected: Record<string, [string, string]> = {
    Madrid: ['Madrid', '28'],
    Barcelona: ['Barcelona', '08'],
    Valencia: ['Valencia', '46'],
    Sevilla: ['Sevilla', '41'],
    Málaga: ['Málaga', '29'],
    Bilbao: ['Bizkaia', '48'],
    Zaragoza: ['Zaragoza', '50'],
    'A Coruña': ['A Coruña', '15'],
  };
  for (const category of ['personal', 'companies'] as const) {
    for (const record of generate(category)) {
      const address = values(record);
      assert.ok(expected[address.city!]);
      assert.equal(address.province, expected[address.city!]![0]);
      assert.equal(address.postalCode!.slice(0, 2), expected[address.city!]![1]);
      assert.match(address.postalCode!, /^\d{5}$/);
      assert.equal(address.country, 'España');
      assert.match(address.address!, /Ejemplo|Prueba|Demostración|Ficticio/);
      assert.equal(
        address.fullAddress,
        `${address.address}, ${address.postalCode}, ${address.city} (${address.province}), España`,
      );
    }
  }
});

test('bank IBAN and Spanish domestic check digits validate while the bank remains fictional', () => {
  function domesticDigit(digits: string): string {
    const weights = [1, 2, 4, 8, 5, 10, 9, 7, 3, 6];
    const sum = [...digits].reduce(
      (total, digit, index) => total + Number(digit) * weights[index]!,
      0,
    );
    const result = 11 - (sum % 11);
    return String(result === 11 ? 0 : result === 10 ? 1 : result);
  }
  for (const record of generate('banking')) {
    const bank = values(record);
    const iban = bank.iban!.replaceAll(' ', '');
    assert.match(iban, /^ES\d{22}$/);
    assert.equal(iban.slice(4, 8), '0000');
    const rearranged = `${iban.slice(4)}1428${iban.slice(2, 4)}`;
    assert.equal(BigInt(rearranged) % 97n, 1n);
    assert.equal(iban[12], domesticDigit(`00${iban.slice(4, 12)}`));
    assert.equal(iban[13], domesticDigit(iban.slice(14)));
    assert.equal(bank.bankName, 'Banco Demo');
    assert.equal(bank.bic, 'DEMOESXX');
    assert.equal(bank.currency, 'EUR');
    assert.equal(bank.ccc!.replaceAll(' ', ''), iban.slice(4));
    assert.equal(bank.bankCode, iban.slice(4, 8));
    assert.equal(bank.branchCode, iban.slice(8, 12));
    assert.equal(bank.accountNumber, iban.slice(14));
  }
});

test('bank cards use only verified public sandbox fixtures, future expiry and appropriate CVC length', () => {
  const fixtures: Record<string, [string, number]> = {
    Visa: ['4242424242424242', 3],
    Mastercard: ['5555555555554444', 3],
    'American Express': ['378282246310005', 4],
  };
  const brands = new Set<string>();
  for (const record of generate('banking')) {
    const card = values(record);
    const fixture = fixtures[card.cardBrand!];
    assert.ok(fixture);
    brands.add(card.cardBrand!);
    assert.equal(card.cardNumber!.replaceAll(' ', ''), fixture[0]);
    assert.match(card.cardCvc!, new RegExp(`^\\d{${fixture[1]}}$`));
    const [month, year] = card.cardExpiry!.split('/').map(Number);
    assert.ok(month! >= 1 && month! <= 12);
    assert.ok(Date.UTC(2000 + year!, month! - 1, 1) > referenceDate.getTime());
  }
  assert.equal(brands.size, 3);
});

test('companies provide valid NIF control digits and clearly fictitious names and contacts', () => {
  const activities: Record<string, string> = {
    '6210': 'Actividades de programación informática',
    '7412': 'Actividades de diseño gráfico y de comunicación visual',
    '7020': 'Otras actividades de consultoría de gestión empresarial',
    '3512': 'Producción de energía eléctrica a partir de fuentes renovables',
    '4941': 'Transporte de mercancías por carretera',
    '7111': 'Servicios técnicos de arquitectura',
    '8559': 'Otra educación n.c.o.p.',
    '4712': 'Otro comercio al por menor no especializado',
  };
  for (const record of generate('companies')) {
    const company = values(record);
    assert.match(company.name!, /Demo, S\.L\.$/);
    assert.match(company.taxId!, /^B\d{8}$/);
    const digits = company.taxId!.slice(1, 8).split('').map(Number);
    const oddSum = [0, 2, 4, 6].reduce((total, index) => {
      const product = digits[index]! * 2;
      return total + Math.floor(product / 10) + (product % 10);
    }, 0);
    const evenSum = digits[1]! + digits[3]! + digits[5]!;
    assert.equal(Number(company.taxId!.at(-1)), (10 - ((oddSum + evenSum) % 10)) % 10);
    assert.match(company.email!, /@yopmail\.com$/);
    assert.match(company.website!, /^https:\/\/example\.com\//);
    assert.match(company.phone!, /^[89]\d{8}$/);
    assert.match(company.fax!, /^[89]\d{8}$/);
    assert.equal(company.activity, activities[company.cnae!]);
    const [day, month, year] = company.incorporationDate!.split('/').map(Number);
    assert.ok(Date.UTC(year!, month! - 1, day!) < referenceDate.getTime());
    assert.ok(Number(company.employees) >= 3 && Number(company.employees) <= 250);
  }
});

test('all requested document and finance tools are available while preserving the original categories', () => {
  assert.deepEqual(
    FAKE_DATA_CATEGORIES.map((item) => item.id),
    [
      'personal',
      'banking',
      'companies',
      'properties',
      'cups',
      'documents',
      'passport',
      'socialSecurity',
      'europeanTaxIds',
      'lei',
      'isin',
    ],
  );
});

test('document choice selects DNI, NIF, NIE or CIF for the entire generated batch', () => {
  for (const documentType of DOCUMENT_TYPES) {
    const records = generateFakeData('documents', 20, {
      documentType: documentType.value,
      referenceDate,
      random: seededRandom(),
    });
    for (const record of records) {
      const document = values(record);
      assert.equal(document.documentType, documentType.label);
      assert.equal(document.documentNumber, record.title);
      assert.equal(document.country, 'España');
      assert.equal(document.checkCharacter, document.documentNumber!.at(-1));
      assert.match(
        document.documentNumber!,
        documentType.value === 'nie'
          ? /^[XYZ]\d{7}[A-Z]$/
          : documentType.value === 'cif'
            ? /^B\d{8}$/
            : /^\d{8}[A-Z]$/,
      );
    }
  }
});

test('passport issue dates precede the reference date and expiry follows it ten years later', () => {
  const parseDate = (date: string) => {
    const [day, month, year] = date.split('/').map(Number);
    return new Date(Date.UTC(year!, month! - 1, day!));
  };
  for (const record of generate('passport')) {
    const passport = values(record);
    assert.match(passport.passport!, /^[A-Z]{3}\d{6}$/);
    const issued = parseDate(passport.issuedDate!);
    const expiry = parseDate(passport.expiryDate!);
    assert.ok(issued < referenceDate);
    assert.ok(expiry > referenceDate);
    assert.equal(expiry.getUTCFullYear() - issued.getUTCFullYear(), 10);
    assert.equal(expiry.getUTCMonth(), issued.getUTCMonth());
    assert.equal(expiry.getUTCDate(), issued.getUTCDate());
  }
});

test('Social Security cards expose province, sequence and controls from the generated number', () => {
  for (const record of generate('socialSecurity')) {
    const affiliation = values(record);
    assert.equal(affiliation.socialSecurity, record.title);
    assert.match(affiliation.socialSecurity!, /^\d{12}$/);
    assert.equal(affiliation.provinceCode, affiliation.socialSecurity!.slice(0, 2));
    assert.ok(Number(affiliation.provinceCode) >= 1 && Number(affiliation.provinceCode) <= 52);
    assert.equal(affiliation.affiliationNumber, affiliation.socialSecurity!.slice(2, 10));
    assert.equal(affiliation.checkDigits, affiliation.socialSecurity!.slice(-2));
    assert.ok(affiliation.province);
  }
});

test('European country selection applies to tax IDs and ISIN records with valid generated checks', () => {
  for (const country of EUROPEAN_TAX_COUNTRIES) {
    const options = { referenceDate, random: seededRandom(), taxCountry: country.value };
    const tax = values(generateFakeData('europeanTaxIds', 1, options)[0]!);
    assert.equal(tax.countryCode, country.value);
    assert.equal(tax.country, country.label);
    assert.equal(tax.format, country.format);
    assert.ok(tax.taxId);
    const record = generateFakeData('isin', 1, options)[0]!;
    const isin = values(record);
    assert.equal(isin.countryCode, country.value);
    assert.equal(isin.country, country.label);
    assert.equal(isin.isin, record.title);
    assert.ok(validateIsin(isin.isin!));
    assert.equal(isin.securityIdentifier, isin.isin!.slice(2, 11));
    assert.equal(isin.checkDigits, isin.isin!.slice(-1));
  }
  for (const record of generate('lei')) {
    const lei = values(record);
    assert.equal(lei.lei, record.title);
    assert.ok(validateLei(lei.lei!));
    assert.equal(lei.issuerCode, lei.lei!.slice(0, 4));
    assert.equal(lei.reserved, '00');
    assert.equal(lei.entityIdentifier, lei.lei!.slice(6, 18));
    assert.equal(lei.checkDigits, lei.lei!.slice(-2));
  }
});

test('text casing transforms human-readable text, preserves codes and credentials, and leaves source data intact', () => {
  const records = generate('personal', 2);
  const original = structuredClone(records);
  assert.deepEqual(formatFakeDataRecords(records, 'original'), records);
  for (const mode of ['upper', 'lower', 'camel'] as const) {
    const formatted = formatFakeDataRecords(records, mode);
    for (const [index, record] of formatted.entries()) {
      const source = values(records[index]!);
      const result = values(record);
      assert.equal(record.id, records[index]!.id);
      assert.equal(result.holder, result.fullName);
      assert.equal(record.title, result.fullName);
      for (const key of [
        'dni',
        'passport',
        'socialSecurity',
        'birthDate',
        'age',
        'email',
        'phone',
        'postalCode',
        'username',
        'password',
        'bankName',
        'iban',
        'ccc',
        'bankCode',
        'branchCode',
        'accountNumber',
        'bic',
        'cardBrand',
        'cardNumber',
        'cardExpiry',
        'cardCvc',
        'currency',
      ])
        assert.equal(result[key], source[key], `${mode}: ${key}`);
      const json = JSON.parse(fakeDataToJson([record]));
      assert.equal(json[0].fullName, result.fullName);
      assert.ok(fakeDataToText([record]).includes(result.fullName!));
      assert.ok(fakeDataToCsv([record]).includes(result.fullName!));
    }
    for (const category of [
      'documents',
      'passport',
      'socialSecurity',
      'europeanTaxIds',
      'lei',
      'isin',
      'properties',
      'cups',
    ] as const) {
      const source = generate(category, 1);
      assert.equal(formatFakeDataRecords(source, mode)[0]!.title, source[0]!.title);
    }
  }
  assert.deepEqual(records, original);
  const name: FakeDataRecord = {
    id: 'unicode',
    category: 'personal',
    title: 'Ángela Núñez de León',
    subtitle: 'Ejemplo',
    fields: [{ key: 'fullName', label: 'Nombre completo', value: 'Ángela Núñez de León' }],
  };
  assert.equal(values(formatFakeDataRecords([name], 'camel')[0]!).fullName, 'ángelaNúñezDeLeón');
  assert.equal(values(formatFakeDataRecords([name], 'upper')[0]!).fullName, 'ÁNGELA NÚÑEZ DE LEÓN');
  assert.equal(values(formatFakeDataRecords([name], 'lower')[0]!).fullName, 'ángela núñez de león');
});

test('urban and rural cadastral records expose components from the same generated reference', () => {
  for (const cadastralKind of ['urban', 'rural'] as const) {
    const records = generateFakeData('properties', 20, {
      cadastralKind,
      referenceDate,
      random: seededRandom(),
    });
    for (const record of records) {
      const property = values(record);
      const reference = property.cadastralReference!;
      assert.ok(validateCadastralReference(reference));
      assert.equal(record.title, reference);
      assert.equal(property.cadastralKind, cadastralKind === 'urban' ? 'Urbana' : 'Rústica');
      assert.equal(property.propertyNumber, reference.slice(14, 18));
      assert.equal(property.checkCharacters, reference.slice(18, 20));
      assert.equal(property.country, 'España');
      assert.equal(property.price, undefined);
      assert.equal(property.surface, undefined);
      assert.equal(property.bedrooms, undefined);
      for (const mode of ['upper', 'lower', 'camel'] as const) {
        const formatted = formatFakeDataRecords([record], mode)[0]!;
        const presentation = values(formatted);
        assert.equal(formatted.title, reference);
        for (const key of [
          'cadastralReference',
          'parcel',
          'sheet',
          'municipality',
          'sector',
          'polygon',
          'propertyNumber',
          'checkCharacters',
        ])
          assert.equal(presentation[key], property[key]);
      }
      if (cadastralKind === 'urban') {
        assert.equal(property.parcel, reference.slice(0, 7));
        assert.equal(property.sheet, reference.slice(7, 14));
        assert.equal(property.polygon, undefined);
      } else {
        assert.equal(property.province, reference.slice(0, 2));
        assert.equal(property.municipality, reference.slice(2, 5));
        assert.equal(property.sector, reference.slice(5, 6));
        assert.equal(property.polygon, reference.slice(6, 9));
        assert.equal(property.parcel, reference.slice(9, 14));
        assert.equal(property.sheet, undefined);
      }
      const exported = JSON.parse(fakeDataToJson([record]))[0];
      assert.equal(exported.cadastralReference, reference);
      assert.ok(fakeDataToCsv([record]).includes(reference));
      assert.ok(fakeDataToText([record]).includes(reference));
    }
  }
});

test('electricity and gas CUPS records expose exact code components and preserve them on export', () => {
  for (const supplyKind of ['electricity', 'gas'] as const) {
    const records = generateFakeData('cups', 20, {
      supplyKind,
      referenceDate,
      random: seededRandom(),
    });
    for (const record of records) {
      const supply = values(record);
      assert.ok(validateCups(supply.cups!));
      assert.equal(record.title, supply.cups);
      assert.equal(supply.supplyKind, supplyKind === 'electricity' ? 'Luz' : 'Gas');
      assert.equal(supply.country, 'España');
      assert.equal(supply.distributorCode, supply.cups!.slice(2, 6));
      assert.equal(supply.supplyNumber, supply.cups!.slice(6, 18));
      assert.equal(supply.checkCharacters, supply.cups!.slice(18, 20));
      for (const mode of ['upper', 'lower', 'camel'] as const) {
        const formatted = formatFakeDataRecords([record], mode)[0]!;
        const presentation = values(formatted);
        assert.equal(formatted.title, supply.cups);
        for (const key of ['cups', 'distributorCode', 'supplyNumber', 'checkCharacters'])
          assert.equal(presentation[key], supply[key]);
      }
      const exported = JSON.parse(fakeDataToJson([record]))[0];
      assert.equal(exported.cups, supply.cups);
      assert.ok(fakeDataToCsv([record]).includes(supply.cups!));
      assert.ok(fakeDataToText([record]).includes(supply.cups!));
    }
  }
});

test('profile email domains can use Yopmail or example.com and reject unsupported domains', () => {
  for (const category of ['personal', 'companies'] as const) {
    for (const emailDomain of ['yopmail.com', 'example.com'] as const) {
      const records = generateFakeData(category, 20, {
        emailDomain,
        referenceDate,
        random: seededRandom(),
      });
      for (const record of records) {
        const email = values(record).email!;
        assert.ok(email.endsWith(`@${emailDomain}`));
        for (const mode of ['upper', 'lower', 'camel'] as const)
          assert.equal(values(formatFakeDataRecords([record], mode)[0]!).email, email);
      }
    }
  }
  assert.throws(
    () => generateFakeData('personal', 1, { emailDomain: 'gmail.com' as 'yopmail.com' }),
    /Dominio de correo/,
  );
  assert.throws(
    () => generateFakeData('properties', 1, { cadastralKind: 'unknown' as 'urban' }),
    /referencia catastral/,
  );
  assert.throws(
    () => generateFakeData('cups', 1, { supplyKind: 'unknown' as 'gas' }),
    /suministro/,
  );
});

test('text and JSON exports preserve fields and mark generated records as fictional', () => {
  const records = generate('personal', 2);
  const text = fakeDataToText(records);
  const json = JSON.parse(fakeDataToJson(records));
  assert.equal(json.length, 2);
  assert.equal(json[0].synthetic, true);
  assert.equal(json[0].category, 'personal');
  for (const item of records[0]!.fields) {
    assert.equal(json[0][item.key], item.value);
    assert.ok(text.includes(`${item.label}: ${item.value}`));
  }
  assert.ok(text.includes('Datos ficticios'));
  assert.ok(text.includes(records[1]!.title));
  assert.equal(fakeDataToText([]), '');
  assert.equal(fakeDataToJson([]), '[]');
});

test('CSV includes UTF-8 BOM, semicolons, escaped cells and neutralizes spreadsheet formula prefixes', () => {
  const records: FakeDataRecord[] = [
    {
      id: 'test',
      category: 'personal',
      title: 'Demo',
      subtitle: 'Prueba',
      fields: [
        { key: 'name', label: 'Nombre', value: 'Nombre; "Demo"\nApellidos' },
        { key: 'phone', label: 'Teléfono', value: '+34 000 123 456' },
        { key: 'formula', label: 'Prueba', value: ' =SUM(A1)' },
      ],
    },
  ];
  const csv = fakeDataToCsv(records);
  assert.ok(csv.startsWith('\uFEFF"category";"synthetic";"name";"phone";"formula"\r\n'));
  assert.ok(csv.includes('"Nombre; ""Demo""\nApellidos"'));
  assert.ok(csv.includes('"\'+34 000 123 456"'));
  assert.ok(csv.includes('"\' =SUM(A1)"'));
  assert.equal(fakeDataToCsv([]), '');
});
