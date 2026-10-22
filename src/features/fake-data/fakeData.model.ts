import {
  DOCUMENT_TYPES,
  EUROPEAN_TAX_COUNTRIES,
  generateDocument,
  generateEuropeanTaxId,
  generateIsin,
  generateLei,
  generatePassport,
  generateSocialSecurity,
} from './identifiers.ts';
import type { DocumentType, TaxCountry } from './identifiers.ts';

export const FAKE_DATA_CATEGORIES = [
  {
    id: 'personal',
    label: 'Personas',
    description: 'Identidad, contacto y dirección de perfiles de ejemplo.',
  },
  {
    id: 'banking',
    label: 'Bancos y tarjetas',
    description: 'Cuentas ficticias y tarjetas públicas para entornos de prueba.',
  },
  {
    id: 'companies',
    label: 'Empresas',
    description: 'Nombres comerciales, información fiscal y datos de contacto.',
  },
  {
    id: 'properties',
    label: 'Inmuebles',
    description: 'Viviendas de ejemplo con características y precios coherentes.',
  },
  {
    id: 'documents',
    label: 'DNI, NIF, NIE y CIF',
    description: 'Documentos españoles con sus caracteres de control.',
  },
  {
    id: 'passport',
    label: 'Pasaportes',
    description: 'Numeración española y fechas de expedición y caducidad.',
  },
  {
    id: 'socialSecurity',
    label: 'Seguridad Social',
    description: 'Números de afiliación españoles con dígitos de control.',
  },
  {
    id: 'europeanTaxIds',
    label: 'NIF europeos',
    description: 'Identificadores fiscales de siete países europeos.',
  },
  {
    id: 'lei',
    label: 'Código LEI',
    description: 'Identificadores de entidades jurídicas y validación de control.',
  },
  {
    id: 'isin',
    label: 'Código ISIN',
    description: 'Identificadores de valores y validación de control.',
  },
] as const;

export type FakeDataCategoryId = (typeof FAKE_DATA_CATEGORIES)[number]['id'];

export interface FakeDataField {
  key: string;
  label: string;
  value: string;
}

export interface FakeDataRecord {
  id: string;
  category: FakeDataCategoryId;
  title: string;
  subtitle: string;
  fields: FakeDataField[];
}

export interface FakeDataOptions {
  random?: () => number;
  referenceDate?: Date;
  documentType?: DocumentType;
  taxCountry?: TaxCountry;
}

export type FakeDataTextCase = 'original' | 'upper' | 'lower' | 'camel';

export const TEST_CARD_SOURCE_URL = 'https://docs.stripe.com/testing#cards';

const firstNames = [
  'Lucía',
  'Hugo',
  'Martina',
  'Mateo',
  'Sofía',
  'Leo',
  'Valeria',
  'Daniel',
  'Paula',
  'Alejandro',
  'Carmen',
  'Pablo',
  'Irene',
  'Adrián',
  'Alba',
  'Nicolás',
] as const;
const surnames = [
  'García',
  'Fernández',
  'López',
  'Martínez',
  'Sánchez',
  'Pérez',
  'Gómez',
  'Ruiz',
  'Navarro',
  'Romero',
  'Torres',
  'Vega',
  'Serrano',
  'Molina',
  'Ortega',
  'Castro',
] as const;
const professions = [
  'Diseñador/a',
  'Desarrollador/a',
  'Docente',
  'Administrativo/a',
  'Arquitecto/a',
  'Técnico/a de soporte',
  'Consultor/a',
  'Comercial',
] as const;
const locations = [
  {
    city: 'Madrid',
    province: 'Madrid',
    postalCodes: ['28001', '28004', '28010'],
    pricePerSquareMeter: 4200,
  },
  {
    city: 'Barcelona',
    province: 'Barcelona',
    postalCodes: ['08001', '08013', '08025'],
    pricePerSquareMeter: 4600,
  },
  {
    city: 'Valencia',
    province: 'Valencia',
    postalCodes: ['46001', '46004', '46010'],
    pricePerSquareMeter: 2600,
  },
  {
    city: 'Sevilla',
    province: 'Sevilla',
    postalCodes: ['41001', '41003', '41010'],
    pricePerSquareMeter: 2300,
  },
  {
    city: 'Málaga',
    province: 'Málaga',
    postalCodes: ['29001', '29010', '29013'],
    pricePerSquareMeter: 3100,
  },
  {
    city: 'Bilbao',
    province: 'Bizkaia',
    postalCodes: ['48001', '48005', '48010'],
    pricePerSquareMeter: 3300,
  },
  {
    city: 'Zaragoza',
    province: 'Zaragoza',
    postalCodes: ['50001', '50004', '50009'],
    pricePerSquareMeter: 1900,
  },
  {
    city: 'A Coruña',
    province: 'A Coruña',
    postalCodes: ['15001', '15004', '15009'],
    pricePerSquareMeter: 2200,
  },
] as const;
const streets = [
  'Calle del Ejemplo',
  'Avenida de la Prueba',
  'Calle de la Demostración',
  'Paseo Ficticio',
] as const;
const companyPrefixes = [
  'Nébula',
  'Horizonte',
  'Brisa',
  'Órbita',
  'Prisma',
  'Nexo',
  'Albor',
  'Lumen',
] as const;
const companyActivities = [
  // CNAE-2025 classes: https://www.boe.es/buscar/act.php?id=BOE-A-2025-587
  {
    suffix: 'Digital',
    sector: 'Tecnología',
    cnae: '6210',
    activity: 'Actividades de programación informática',
  },
  {
    suffix: 'Estudio',
    sector: 'Diseño y comunicación',
    cnae: '7412',
    activity: 'Actividades de diseño gráfico y de comunicación visual',
  },
  {
    suffix: 'Servicios',
    sector: 'Consultoría',
    cnae: '7020',
    activity: 'Otras actividades de consultoría de gestión empresarial',
  },
  {
    suffix: 'Solar',
    sector: 'Energía',
    cnae: '3512',
    activity: 'Producción de energía eléctrica a partir de fuentes renovables',
  },
  {
    suffix: 'Logística',
    sector: 'Transporte y logística',
    cnae: '4941',
    activity: 'Transporte de mercancías por carretera',
  },
  {
    suffix: 'Espacios',
    sector: 'Arquitectura e interiorismo',
    cnae: '7111',
    activity: 'Servicios técnicos de arquitectura',
  },
  { suffix: 'Formación', sector: 'Educación', cnae: '8559', activity: 'Otra educación n.c.o.p.' },
  {
    suffix: 'Market',
    sector: 'Comercio',
    cnae: '4712',
    activity: 'Otro comercio al por menor no especializado',
  },
] as const;
const provinceNames = [
  'Álava',
  'Albacete',
  'Alicante',
  'Almería',
  'Ávila',
  'Badajoz',
  'Illes Balears',
  'Barcelona',
  'Burgos',
  'Cáceres',
  'Cádiz',
  'Castellón',
  'Ciudad Real',
  'Córdoba',
  'A Coruña',
  'Cuenca',
  'Girona',
  'Granada',
  'Guadalajara',
  'Gipuzkoa',
  'Huelva',
  'Huesca',
  'Jaén',
  'León',
  'Lleida',
  'La Rioja',
  'Lugo',
  'Madrid',
  'Málaga',
  'Murcia',
  'Navarra',
  'Ourense',
  'Asturias',
  'Palencia',
  'Las Palmas',
  'Pontevedra',
  'Salamanca',
  'Santa Cruz de Tenerife',
  'Cantabria',
  'Segovia',
  'Sevilla',
  'Soria',
  'Tarragona',
  'Teruel',
  'Toledo',
  'Valencia',
  'Valladolid',
  'Bizkaia',
  'Zamora',
  'Zaragoza',
  'Ceuta',
  'Melilla',
] as const;
// Public sandbox fixtures from Stripe. These are deliberately never random card numbers.
const testCards = [
  { brand: 'Visa', number: '4242 4242 4242 4242', cvcLength: 3 },
  { brand: 'Mastercard', number: '5555 5555 5555 4444', cvcLength: 3 },
  { brand: 'American Express', number: '3782 822463 10005', cvcLength: 4 },
] as const;
const money = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '');
}

function field(key: string, label: string, value: string | number): FakeDataField {
  return { key, label, value: String(value) };
}

function checksumCcc(digits: string): string {
  const weights = [1, 2, 4, 8, 5, 10, 9, 7, 3, 6];
  const remainder =
    11 - ([...digits].reduce((sum, digit, index) => sum + Number(digit) * weights[index]!, 0) % 11);
  return String(remainder === 11 ? 0 : remainder === 10 ? 1 : remainder);
}

function mod97(digits: string): number {
  return [...digits].reduce((remainder, digit) => (remainder * 10 + Number(digit)) % 97, 0);
}

function makeIban(branch: string, account: string): string {
  // 0000 is deliberately used instead of the entity code of a real bank.
  const bankAndBranch = `0000${branch}`;
  const domestic = `${bankAndBranch}${checksumCcc(`00${bankAndBranch}`)}${checksumCcc(account)}${account}`;
  const check = String(98 - mod97(`${domestic}142800`)).padStart(2, '0');
  return `ES${check}${domestic}`.match(/.{1,4}/g)!.join(' ');
}

function formatDate(value: Date): string {
  return `${String(value.getUTCDate()).padStart(2, '0')}/${String(value.getUTCMonth() + 1).padStart(2, '0')}/${value.getUTCFullYear()}`;
}

/** Generate locally: none of these records are fetched from a person, bank or business. */
export function generateFakeData(
  category: FakeDataCategoryId,
  count = 1,
  options: FakeDataOptions = {},
): FakeDataRecord[] {
  if (!FAKE_DATA_CATEGORIES.some((item) => item.id === category))
    throw new Error('Categoría de datos inválida.');
  if (!Number.isInteger(count) || count < 1 || count > 20)
    throw new Error('Elige entre 1 y 20 registros.');
  const referenceDate = options.referenceDate ?? new Date();
  if (!Number.isFinite(referenceDate.getTime())) throw new Error('Fecha de referencia inválida.');
  const documentType = options.documentType ?? 'dni';
  if (!DOCUMENT_TYPES.some((item) => item.value === documentType))
    throw new Error('Tipo de documento inválido.');
  const taxCountry = options.taxCountry ?? 'ES';
  const taxCountryName = EUROPEAN_TAX_COUNTRIES.find((item) => item.value === taxCountry)?.label;
  if (!taxCountryName) throw new Error('País fiscal inválido.');
  const random = options.random ?? Math.random;
  const integer = (min: number, max: number) => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1)
      throw new Error('La fuente aleatoria debe devolver valores entre 0 y 1 (excluido).');
    return Math.floor(value * (max - min + 1)) + min;
  };
  const pick = <T>(values: readonly T[]): T => values[integer(0, values.length - 1)]!;
  const digits = (length: number) => Array.from({ length }, () => integer(0, 9)).join('');
  const personName = () => `${pick(firstNames)} ${pick(surnames)} ${pick(surnames)}`;
  const phone = () => `+34 000 ${digits(3)} ${digits(3)}`;
  const password = () => {
    const groups = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnpqrstuvwxyz', '23456789', '!#%+?'];
    const charset = groups.join('');
    const characters = [
      ...groups.map((group) => pick([...group])),
      ...Array.from({ length: 12 }, () => pick([...charset])),
    ];
    for (let index = characters.length - 1; index > 0; index--) {
      const other = integer(0, index);
      [characters[index], characters[other]] = [characters[other]!, characters[index]!];
    }
    return characters.join('');
  };
  const pastDate = (minYears: number, maxYears: number) =>
    new Date(
      Date.UTC(
        referenceDate.getUTCFullYear() - integer(minYears, maxYears),
        integer(0, 11),
        integer(1, 28),
      ),
    );
  const address = () => {
    const location = pick(locations);
    return {
      location,
      street: `${pick(streets)}, ${integer(1, 180)}`,
      postalCode: pick(location.postalCodes),
    };
  };
  const addressFields = (value: ReturnType<typeof address>) => [
    field('address', 'Dirección', value.street),
    field('postalCode', 'Código postal', value.postalCode),
    field('city', 'Municipio', value.location.city),
    field('province', 'Provincia', value.location.province),
    field(
      'fullAddress',
      'Dirección completa',
      `${value.street}, ${value.postalCode}, ${value.location.city} (${value.location.province}), España`,
    ),
    field('country', 'País', 'España'),
  ];
  const bankingFields = (holder: string) => {
    const card = pick(testCards);
    const futureMonth = referenceDate.getUTCMonth() + integer(12, 48);
    const expiryYear = referenceDate.getUTCFullYear() + Math.floor(futureMonth / 12);
    const expiry = `${String((futureMonth % 12) + 1).padStart(2, '0')}/${String(expiryYear).slice(-2)}`;
    const iban = makeIban(digits(4), digits(10));
    const compactIban = iban.replaceAll(' ', '');
    return [
      field('bankName', 'Banco ficticio', 'Banco Demo'),
      field('holder', 'Titular de ejemplo', holder),
      field('iban', 'IBAN ficticio', iban),
      field(
        'ccc',
        'CCC',
        `${compactIban.slice(4, 8)} ${compactIban.slice(8, 12)} ${compactIban.slice(12, 14)} ${compactIban.slice(14)}`,
      ),
      field('bankCode', 'Código de entidad', compactIban.slice(4, 8)),
      field('branchCode', 'Código de oficina', compactIban.slice(8, 12)),
      field('accountNumber', 'Número de cuenta', compactIban.slice(14)),
      field('bic', 'BIC / SWIFT ficticio', 'DEMOESXX'),
      field('cardBrand', 'Tipo de tarjeta', card.brand),
      field('cardNumber', 'Número de tarjeta de prueba', card.number),
      field('cardExpiry', 'Caducidad', expiry),
      field('cardCvc', 'CVC de prueba', digits(card.cvcLength)),
      field('currency', 'Moneda', 'EUR'),
    ];
  };

  return Array.from({ length: count }, (_, index) => {
    const id = `${category}-${referenceDate.getTime().toString(36)}-${digits(10)}-${index + 1}`;
    if (category === 'personal') {
      const firstName = pick(firstNames);
      const firstSurname = pick(surnames);
      const secondSurname = pick(surnames);
      const allSurnames = `${firstSurname} ${secondSurname}`;
      const fullName = `${firstName} ${allSurnames}`;
      const age = integer(18, 75);
      const month = integer(1, 12);
      const day = integer(1, 28);
      const afterBirthday =
        month < referenceDate.getUTCMonth() + 1 ||
        (month === referenceDate.getUTCMonth() + 1 && day <= referenceDate.getUTCDate());
      const birthYear = referenceDate.getUTCFullYear() - age - (afterBirthday ? 0 : 1);
      const residence = address();
      return {
        id,
        category,
        title: fullName,
        subtitle: `${age} años · ${residence.location.city}`,
        fields: [
          field('firstName', 'Nombre', firstName),
          field('firstSurname', 'Primer apellido', firstSurname),
          field('secondSurname', 'Segundo apellido', secondSurname),
          field('surnames', 'Apellidos', allSurnames),
          field('fullName', 'Nombre completo', fullName),
          field('dni', 'DNI de ejemplo', generateDocument('dni', random)),
          field(
            'birthDate',
            'Fecha de nacimiento',
            `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${birthYear}`,
          ),
          field('age', 'Edad', age),
          field('email', 'Correo electrónico', `${slug(fullName)}.${digits(3)}@example.com`),
          field('phone', 'Teléfono ficticio', phone()),
          field('profession', 'Profesión', pick(professions)),
          field('passport', 'Pasaporte de ejemplo', generatePassport(random)),
          field('socialSecurity', 'Seguridad Social', generateSocialSecurity(random)),
          ...addressFields(residence),
          field(
            'username',
            'Nombre de usuario',
            `${slug(firstName)}.${slug(firstSurname)}.${digits(3)}`,
          ),
          field('password', 'Contraseña de prueba', password()),
          ...bankingFields(fullName),
        ],
      };
    }
    if (category === 'banking') {
      const holder = personName();
      const fields = bankingFields(holder);
      const brand = fields.find((item) => item.key === 'cardBrand')!.value;
      return {
        id,
        category,
        title: holder,
        subtitle: `${brand} de prueba · Banco Demo`,
        fields,
      };
    }
    if (category === 'companies') {
      const activity = pick(companyActivities);
      const name = `${pick(companyPrefixes)} ${activity.suffix} Demo, S.L.`;
      const headquarters = address();
      const companySlug = slug(name);
      return {
        id,
        category,
        title: name,
        subtitle: `${activity.sector} · ${headquarters.location.city}`,
        fields: [
          field('name', 'Razón social de ejemplo', name),
          field('taxId', 'CIF / NIF de ejemplo', generateDocument('cif', random)),
          field('incorporationDate', 'Fecha de constitución', formatDate(pastDate(1, 45))),
          field('cnae', 'CNAE-2025', activity.cnae),
          field('activity', 'Actividad', activity.activity),
          field('sector', 'Sector', activity.sector),
          field('email', 'Correo electrónico', `${companySlug}@example.com`),
          field('phone', 'Teléfono ficticio', phone()),
          field('fax', 'Fax ficticio', phone()),
          field('website', 'Sitio web de ejemplo', `https://example.com/${companySlug}`),
          field('employees', 'Empleados', integer(3, 250)),
          ...addressFields(headquarters),
        ],
      };
    }

    if (category === 'documents') {
      const number = generateDocument(documentType, random);
      const label = DOCUMENT_TYPES.find((item) => item.value === documentType)!.label;
      return {
        id,
        category,
        title: number,
        subtitle: `${label} · España`,
        fields: [
          field('documentType', 'Tipo de documento', label),
          field('documentNumber', 'Número de documento', number),
          field('country', 'País', 'España'),
          field('checkCharacter', 'Carácter de control', number.at(-1)!),
        ],
      };
    }

    if (category === 'passport') {
      const number = generatePassport(random);
      const issued = pastDate(1, 5);
      const expires = new Date(issued);
      expires.setUTCFullYear(expires.getUTCFullYear() + 10);
      return {
        id,
        category,
        title: number,
        subtitle: 'Pasaporte español · Ejemplo',
        fields: [
          field('passport', 'Número de pasaporte', number),
          field('country', 'País emisor', 'España'),
          field('issuedDate', 'Fecha de expedición', formatDate(issued)),
          field('expiryDate', 'Fecha de caducidad', formatDate(expires)),
          field('format', 'Formato', '3 letras y 6 cifras'),
        ],
      };
    }

    if (category === 'socialSecurity') {
      const number = generateSocialSecurity(random);
      const provinceCode = number.slice(0, 2);
      const province = provinceNames[Number(provinceCode) - 1]!;
      return {
        id,
        category,
        title: number,
        subtitle: `Seguridad Social · ${province}`,
        fields: [
          field('socialSecurity', 'Número de afiliación', number),
          field('provinceCode', 'Código de provincia', provinceCode),
          field('province', 'Provincia', province),
          field('affiliationNumber', 'Número secuencial', number.slice(2, 10)),
          field('checkDigits', 'Dígitos de control', number.slice(-2)),
          field('country', 'País', 'España'),
        ],
      };
    }

    if (category === 'europeanTaxIds') {
      const number = generateEuropeanTaxId(taxCountry, random);
      const country = EUROPEAN_TAX_COUNTRIES.find((item) => item.value === taxCountry)!;
      return {
        id,
        category,
        title: number,
        subtitle: `Identificador fiscal · ${taxCountryName}`,
        fields: [
          field('taxId', 'Identificador fiscal', number),
          field('country', 'País', taxCountryName),
          field('countryCode', 'Código de país', taxCountry),
          field('format', 'Formato del identificador', country.format),
        ],
      };
    }

    if (category === 'lei') {
      const lei = generateLei(random);
      return {
        id,
        category,
        title: lei,
        subtitle: 'Identificador de entidad jurídica · Ejemplo',
        fields: [
          field('lei', 'Código LEI', lei),
          field('issuerCode', 'Prefijo de emisor', lei.slice(0, 4)),
          field('reserved', 'Caracteres reservados', lei.slice(4, 6)),
          field('entityIdentifier', 'Identificador de entidad', lei.slice(6, 18)),
          field('checkDigits', 'Dígitos de control', lei.slice(-2)),
          field('controlAlgorithm', 'Algoritmo de control', 'ISO 7064 · MOD 97-10'),
        ],
      };
    }

    if (category === 'isin') {
      const isin = generateIsin(taxCountry, random);
      return {
        id,
        category,
        title: isin,
        subtitle: `Identificador de valores · ${taxCountryName}`,
        fields: [
          field('isin', 'Código ISIN', isin),
          field('country', 'País', taxCountryName),
          field('countryCode', 'Código de país', isin.slice(0, 2)),
          field('securityIdentifier', 'Identificador del valor', isin.slice(2, 11)),
          field('checkDigits', 'Dígito de control', isin.slice(-1)),
          field('controlAlgorithm', 'Algoritmo de control', 'Luhn · Módulo 10'),
        ],
      };
    }

    const residence = address();
    const type = pick(['Piso', 'Apartamento', 'Ático', 'Casa adosada', 'Chalet'] as const);
    const isHouse = type === 'Casa adosada' || type === 'Chalet';
    const bedrooms = integer(isHouse ? 3 : 1, isHouse ? 5 : 4);
    const surface = bedrooms * integer(20, 30) + integer(15, 35);
    const bathrooms = integer(1, Math.min(bedrooms, isHouse ? 3 : 2));
    const operation = pick(['Venta', 'Alquiler'] as const);
    const saleValue = (surface * residence.location.pricePerSquareMeter * integer(85, 115)) / 100;
    const priceValue =
      operation === 'Venta'
        ? Math.round(saleValue / 1000) * 1000
        : Math.round((saleValue * 0.004) / 10) * 10;
    const reference = `DEMO-${digits(4)}-${String(index + 1).padStart(3, '0')}`;
    const price = `${money.format(priceValue)}${operation === 'Alquiler' ? '/mes' : ''}`;
    return {
      id,
      category,
      title: `${type} en ${residence.location.city}`,
      subtitle: `${surface} m² · ${bedrooms} hab. · ${price}`,
      fields: [
        field('reference', 'Referencia de ejemplo', reference),
        field('type', 'Tipo de inmueble', type),
        field('operation', 'Operación', operation),
        ...addressFields(residence),
        field('surface', 'Superficie', `${surface} m²`),
        field('bedrooms', 'Habitaciones', bedrooms),
        field('bathrooms', 'Baños', bathrooms),
        field('price', operation === 'Venta' ? 'Precio de venta' : 'Alquiler mensual', price),
        field('yearBuilt', 'Año de construcción', integer(1960, referenceDate.getUTCFullYear())),
        field('energyRating', 'Calificación energética', pick(['A', 'B', 'C', 'D', 'E', 'F', 'G'])),
      ],
    };
  });
}

const textFieldKeys = new Set([
  'firstName',
  'firstSurname',
  'secondSurname',
  'surnames',
  'fullName',
  'holder',
  'profession',
  'address',
  'fullAddress',
  'city',
  'province',
  'country',
  'name',
  'activity',
  'sector',
  'type',
  'operation',
]);

/** Change presentation text without touching identifiers, credentials or numeric values. */
export function formatFakeDataRecords(
  records: readonly FakeDataRecord[],
  mode: FakeDataTextCase,
): FakeDataRecord[] {
  const transform = (value: string): string => {
    if (mode === 'upper') return value.toLocaleUpperCase('es-ES');
    if (mode === 'lower') return value.toLocaleLowerCase('es-ES');
    if (mode === 'camel') {
      const words = value.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
      return words
        .map((word, index) => {
          const lower = word.toLocaleLowerCase('es-ES');
          return index === 0 ? lower : lower.charAt(0).toLocaleUpperCase('es-ES') + lower.slice(1);
        })
        .join('');
    }
    return value;
  };
  return records.map((record) => ({
    ...record,
    title: ['personal', 'banking', 'companies', 'properties'].includes(record.category)
      ? transform(record.title)
      : record.title,
    subtitle: ['personal', 'companies'].includes(record.category)
      ? transform(record.subtitle)
      : record.subtitle,
    fields: record.fields.map((item) => ({
      ...item,
      value: textFieldKeys.has(item.key) ? transform(item.value) : item.value,
    })),
  }));
}

export function fakeDataToText(records: readonly FakeDataRecord[]): string {
  return records
    .map((record) =>
      [
        `${record.title} · Datos ficticios`,
        ...record.fields.map((item) => `${item.label}: ${item.value}`),
      ].join('\n'),
    )
    .join('\n\n');
}

export function fakeDataToJson(records: readonly FakeDataRecord[]): string {
  return JSON.stringify(
    records.map((record) => ({
      category: record.category,
      synthetic: true,
      ...Object.fromEntries(record.fields.map((item) => [item.key, item.value])),
    })),
    null,
    2,
  );
}

export function fakeDataToCsv(records: readonly FakeDataRecord[]): string {
  if (!records.length) return '';
  const keys = [...new Set(records.flatMap((record) => record.fields.map((item) => item.key)))];
  const escape = (value: string) => {
    // Preserve phones and prevent spreadsheet applications from interpreting a cell as a formula.
    const safe = /^[=+\-@\t\r]/.test(value.trimStart()) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return (
    '\uFEFF' +
    [
      ['category', 'synthetic', ...keys],
      ...records.map((record) => {
        const values = Object.fromEntries(record.fields.map((item) => [item.key, item.value]));
        return [record.category, 'true', ...keys.map((key) => values[key] ?? '')];
      }),
    ]
      .map((row) => row.map(escape).join(';'))
      .join('\r\n')
  );
}
