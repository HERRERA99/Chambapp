/**
 * Synthetic identifiers for local test fixtures. A matching checksum never means
 * that an identifier has been assigned, is active, or belongs to a real person.
 *
 * Reference specifications:
 * NIF/NIE: https://www.interior.gob.es/opencms/es/servicios-al-ciudadano/tramites-y-gestiones/dni/calculo-del-digito-de-control-del-nif-nie/
 * European personal TIN structures: https://www.oecd.org/en/topics/sub-issues/international-standards-on-tax-transparency/tax-identification-numbers.html
 * German checksum: https://www1.osci.de/sixcms/media.php/13/Pr%C3%BCfziffernberechnung.pdf
 * Italian checksum: Decreto 23/12/1976 n. 13813, article 7 (def.finanze.it).
 * Belgian checksum: https://www.ibz.rrn.fgov.be/sites/default/files/documents/fr/registre-national/instructions/liste-TI/TI000_Numero-identification.pdf
 * LEI: https://www.leiroc.org/lei.htm
 * ISIN: https://anna-web.org/identifiers/
 */

export type DocumentType = 'dni' | 'nif' | 'nie' | 'cif';
export type TaxCountry = 'ES' | 'DE' | 'FR' | 'IT' | 'PT' | 'BE' | 'NL';
type RandomSource = () => number;

export const DOCUMENT_TYPES: readonly { value: DocumentType; label: string }[] = [
  { value: 'dni', label: 'DNI' },
  { value: 'nif', label: 'NIF · persona física' },
  { value: 'nie', label: 'NIE' },
  { value: 'cif', label: 'CIF / NIF · sociedad limitada' },
];

export const EUROPEAN_TAX_COUNTRIES: readonly {
  value: TaxCountry;
  label: string;
  format: string;
  description: string;
  note?: string;
}[] = [
  { value: 'ES', label: 'España', format: 'NIF', description: '8 cifras y letra de control.' },
  {
    value: 'DE',
    label: 'Alemania',
    format: 'IdNr',
    description: '11 cifras, con control MOD 11,10.',
  },
  {
    value: 'FR',
    label: 'Francia',
    format: 'SPI',
    description: '13 cifras, inicio de 0 a 3. Solo formato; sin validación de control.',
    note: 'SPI: solo formato; Francia no publica un algoritmo de control.',
  },
  {
    value: 'IT',
    label: 'Italia',
    format: 'Codice fiscale',
    description: '16 caracteres, con letra de control.',
  },
  {
    value: 'PT',
    label: 'Portugal',
    format: 'NIF',
    description: '9 cifras, con control módulo 11.',
  },
  { value: 'BE', label: 'Bélgica', format: 'NN', description: '11 cifras, con control módulo 97.' },
  {
    value: 'NL',
    label: 'Países Bajos',
    format: 'BSN',
    description: '9 cifras, con control módulo 11.',
  },
];

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NIF_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

function integer(min: number, max: number, random: RandomSource): number {
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1)
    throw new Error('La fuente aleatoria debe devolver valores entre 0 y 1 (sin incluir 1).');
  return min + Math.floor(sample * (max - min + 1));
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}

function characters(length: number, alphabet: string, random: RandomSource): string {
  return Array.from({ length }, () => alphabet[integer(0, alphabet.length - 1, random)]!).join('');
}

export function generateDocument(type: DocumentType, random: RandomSource = Math.random): string {
  if (type === 'dni' || type === 'nif') {
    const number = integer(1, 99_999_999, random);
    return `${pad(number, 8)}${NIF_LETTERS[number % 23]}`;
  }
  if (type === 'nie') {
    const prefix = integer(0, 2, random);
    const body = pad(integer(1, 9_999_999, random), 7);
    return `${'XYZ'[prefix]}${body}${NIF_LETTERS[Number(`${prefix}${body}`) % 23]}`;
  }
  if (type === 'cif') {
    // B identifies a sociedad limitada, which has a numeric control character.
    const body = pad(integer(1, 9_999_999, random), 7);
    const total = [...body].reduce((sum, char, index) => {
      const product = Number(char) * (index % 2 === 0 ? 2 : 1);
      return sum + Math.floor(product / 10) + (product % 10);
    }, 0);
    return `B${body}${(10 - (total % 10)) % 10}`;
  }
  throw new Error('Tipo de documento desconocido.');
}

/** Spanish booklet number: three letters and six digits; no MRZ or validity claim. */
export function generatePassport(random: RandomSource = Math.random): string {
  return `${characters(3, ALPHABET, random)}${pad(integer(1, 999_999, random), 6)}`;
}

export function generateSocialSecurity(random: RandomSource = Math.random): string {
  const province = integer(1, 52, random);
  const account = integer(1, 99_999_999, random);
  // Legacy accounts below ten million use a seven-digit base for the control,
  // although the displayed sequence is always padded to eight positions.
  const base = province * (account < 10_000_000 ? 10_000_000 : 100_000_000) + account;
  return `${pad(province, 2)}${pad(account, 8)}${pad(base % 97, 2)}`;
}

function generateGermanTaxId(random: RandomSource): string {
  // One of the first ten digits occurs twice, one is absent, the other eight
  // occur once. This is a valid subset of the German allocation patterns.
  const pool = [...'0123456789'];
  const missing = integer(0, 9, random);
  pool.splice(missing, 1);
  pool.push(pool[integer(0, 8, random)]!);
  for (let index = pool.length - 1; index > 0; index--) {
    const other = integer(0, index, random);
    [pool[index], pool[other]] = [pool[other]!, pool[index]!];
  }
  if (pool[0] === '0') {
    const other = pool.findIndex((digit) => digit !== '0');
    [pool[0], pool[other]] = [pool[other]!, pool[0]!];
  }
  let product = 10;
  for (const digit of pool) {
    const sum = (Number(digit) + product) % 10 || 10;
    product = (2 * sum) % 11;
  }
  const check = 11 - product;
  return `${pool.join('')}${check === 10 ? 0 : check}`;
}

function generateItalianTaxId(random: RandomSource): string {
  // Fictitious DEMO surname/name components, a possible birth date, and Rome's
  // municipality code. It has no association with the generated Spanish profile.
  const year = pad(integer(30, 99, random), 2);
  const month = 'ABCDEHLMPRST'[integer(0, 11, random)]!;
  const day = integer(1, 28, random) + integer(0, 1, random) * 40;
  const body = `DMODMO${year}${month}${pad(day, 2)}H501`;
  const odd = [
    1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23,
  ];
  const sum = [...body].reduce((total, char, index) => {
    const value = /\d/.test(char) ? Number(char) : char.charCodeAt(0) - 65;
    return total + (index % 2 === 0 ? odd[value]! : value);
  }, 0);
  return `${body}${ALPHABET[sum % 26]}`;
}

function generatePortugueseTaxId(random: RandomSource): string {
  const body = `${integer(1, 2, random)}${pad(integer(0, 9_999_999, random), 7)}`;
  const remainder =
    [...body].reduce((sum, digit, index) => sum + Number(digit) * (9 - index), 0) % 11;
  return `${body}${remainder < 2 ? 0 : 11 - remainder}`;
}

function generateBelgianTaxId(random: RandomSource): string {
  const year = integer(1930, 2007, random);
  const body = `${pad(year % 100, 2)}${pad(integer(1, 12, random), 2)}${pad(integer(1, 28, random), 2)}${pad(integer(1, 998, random), 3)}`;
  const base = Number(`${year >= 2000 ? '2' : ''}${body}`);
  return `${body}${pad(97 - (base % 97), 2)}`;
}

function generateDutchTaxId(random: RandomSource): string {
  const prefix = String(integer(1_000_000, 9_999_999, random));
  const last = integer(0, 9, random);
  // At most one choice of eighth digit produces the forbidden remainder 10.
  // Advance that digit once instead of retrying the RNG indefinitely.
  for (let offset = 0; offset < 2; offset++) {
    const body = `${prefix}${(last + offset) % 10}`;
    const check =
      [...body].reduce((sum, digit, index) => sum + Number(digit) * (9 - index), 0) % 11;
    if (check !== 10) return `${body}${check}`;
  }
  throw new Error('No se pudo generar el identificador neerlandés.');
}

export function generateEuropeanTaxId(
  country: TaxCountry,
  random: RandomSource = Math.random,
): string {
  switch (country) {
    case 'ES':
      return generateDocument('nif', random);
    case 'DE':
      return generateGermanTaxId(random);
    case 'FR':
      // France publishes the SPI structure, not a public checksum algorithm.
      return `${integer(0, 3, random)}${integer(1, 9, random)}${characters(11, '0123456789', random)}`;
    case 'IT':
      return generateItalianTaxId(random);
    case 'PT':
      return generatePortugueseTaxId(random);
    case 'BE':
      return generateBelgianTaxId(random);
    case 'NL':
      return generateDutchTaxId(random);
    default:
      throw new Error('País fiscal desconocido.');
  }
}

function expandLetters(value: string): string {
  return [...value]
    .map((char) => (/\d/.test(char) ? char : String(char.charCodeAt(0) - 55)))
    .join('');
}

function mod97(value: string): number {
  let remainder = 0;
  for (const digit of expandLetters(value)) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder;
}

export function generateLei(random: RandomSource = Math.random): string {
  // 0000 is our synthetic prefix, not an issuing LOU. The 00 reserve is retained.
  const body = `000000DEMO${characters(8, ALPHANUMERIC, random)}`;
  return `${body}${pad(98 - mod97(`${body}00`), 2)}`;
}

/** Checks current LEI structure and MOD 97-10 only; does not query GLEIF. */
export function validateLei(value: string): boolean {
  const normalized = value.replace(/\s+/g, '').toUpperCase();
  return (
    /^[A-Z0-9]{4}00[A-Z0-9]{12}\d{2}$/.test(normalized) &&
    !['00', '01', '99'].includes(normalized.slice(-2)) &&
    mod97(normalized) === 1
  );
}

// ISO 3166-1 alpha-2 plus international ISIN prefixes recognised by ANNA.
const ISIN_COUNTRY_CODES = new Set(
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW XS EU EZ'.split(
    ' ',
  ),
);

function luhnTotal(value: string): number {
  return [...expandLetters(value)].reverse().reduce((sum, char, index) => {
    const product = Number(char) * (index % 2 === 1 ? 2 : 1);
    return sum + Math.floor(product / 10) + (product % 10);
  }, 0);
}

export function generateIsin(countryCode = 'ES', random: RandomSource = Math.random): string {
  const country = countryCode.toUpperCase();
  if (!ISIN_COUNTRY_CODES.has(country)) throw new Error('Código de país ISIN desconocido.');
  const body = `${country}DEMO${characters(5, '0123456789', random)}`;
  return `${body}${(10 - (luhnTotal(`${body}0`) % 10)) % 10}`;
}

/** Checks country prefix, ISO 6166 structure and Luhn only; no allocation lookup. */
export function validateIsin(value: string): boolean {
  const normalized = value.replace(/\s+/g, '').toUpperCase();
  return (
    /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(normalized) &&
    ISIN_COUNTRY_CODES.has(normalized.slice(0, 2)) &&
    luhnTotal(normalized) % 10 === 0
  );
}
