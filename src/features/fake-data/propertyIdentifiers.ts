/**
 * Local, synthetic identifiers. Validation checks format and control characters;
 * it never establishes that a property or supply point exists or is assigned.
 *
 * Cadastral structure and worked examples: Dirección General del Catastro,
 * Temario Bloque VI (OEP 2024), Tema 25, pp. 3–4:
 * https://www.catastro.hacienda.gob.es/documentos/Temario%20Bloque%20VI.%20Catastro%20-%20Proceso%20selectivo%20acceso%20CSGC%20(OEP%202024).pdf
 * Control algorithm: https://trellat.es/validar-la-referencia-catastral-en-javascript/
 * CUPS structure, controls and optional measure suffix: P.O. 10.8, §§4–5:
 * https://www.boe.es/boe/dias/2009/11/30/pdfs/BOE-A-2009-19040.pdf
 * Gas CUPS format: https://www.cnmc.es/ca/node/409621
 */

export type CadastralKind = 'urban' | 'rural';
export type SupplyKind = 'electricity' | 'gas';

type RandomSource = () => number;

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CADASTRAL_CONTROL_LETTERS = 'MQWERTYUIOPASDFGHJKLBZX';
const CADASTRAL_WEIGHTS = [13, 15, 12, 5, 4, 17, 9, 21, 3, 7, 1] as const;
const CUPS_CONTROL_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

function integer(min: number, max: number, random: RandomSource): number {
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1)
    throw new Error('La fuente aleatoria debe devolver valores entre 0 y 1 (sin incluir 1).');
  return min + Math.floor(sample * (max - min + 1));
}

function digits(length: number, random: RandomSource): string {
  return Array.from({ length }, () => String(integer(0, 9, random))).join('');
}

function letters(length: number, random: RandomSource): string {
  return Array.from({ length }, () => LETTERS[integer(0, LETTERS.length - 1, random)]!).join('');
}

function normalize(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

function cadastralControl(body: string): string {
  // Each control uses one seven-character parcel block and the four-character
  // property sequence. Letter values follow the Spanish alphabet, including Ñ:
  // A=1, N=14, O=16, ..., Z=27. Ñ itself is not generated in these formats.
  return [body.slice(0, 7), body.slice(7, 14)]
    .map((block) => {
      const sum = [...`${block}${body.slice(14, 18)}`].reduce((total, char, index) => {
        const value = /\d/.test(char) ? Number(char) : char.charCodeAt(0) - (char <= 'N' ? 64 : 63);
        return total + value * CADASTRAL_WEIGHTS[index]!;
      }, 0);
      return CADASTRAL_CONTROL_LETTERS[sum % 23]!;
    })
    .join('');
}

export function generateCadastralReference(
  kind: CadastralKind,
  random: RandomSource = Math.random,
): string {
  let body: string;
  switch (kind) {
    case 'urban':
      // Parcel (7), map sheet (2 letters, 4 figures, 1 letter), property (4).
      body = `${digits(7, random)}${letters(2, random)}${digits(4, random)}${letters(1, random)}${digits(4, random)}`;
      break;
    case 'rural': {
      // DGC common territory excludes the four provinces with foral cadastres.
      const provinces = Array.from({ length: 52 }, (_, index) => index + 1).filter(
        (province) => ![1, 20, 31, 48].includes(province),
      );
      const province = String(provinces[integer(0, provinces.length - 1, random)]!).padStart(
        2,
        '0',
      );
      const municipality = String(integer(1, 999, random)).padStart(3, '0');
      const sector = letters(1, random);
      const polygon = String(integer(1, 999, random)).padStart(3, '0');
      const parcel = String(integer(1, 8_999, random)).padStart(5, '0');
      body = `${province}${municipality}${sector}${polygon}${parcel}${digits(4, random)}`;
      break;
    }
    default:
      throw new Error('Tipo de referencia catastral desconocido.');
  }
  return `${body}${cadastralControl(body)}`;
}

/** DGC urban/rural format and checksum only; does not consult the Catastro. */
export function validateCadastralReference(value: string): boolean {
  const normalized = normalize(value);
  const urban = /^\d{7}[A-Z]{2}\d{4}[A-Z]\d{4}[A-Z]{2}$/;
  // Older "diseminado" sheets use 00 + 2 letters + 2 figures + a letter.
  const diseminado = /^00\d{5}00[A-Z]{2}\d{2}[A-Z]\d{4}[A-Z]{2}$/;
  const rural = /^\d{5}[A-Z]\d{12}[A-Z]{2}$/;
  return (
    (urban.test(normalized) || diseminado.test(normalized) || rural.test(normalized)) &&
    cadastralControl(normalized.slice(0, 18)) === normalized.slice(18)
  );
}

function cupsControl(body: string): string {
  // Accumulate a remainder instead of converting the 16-figure code to Number:
  // some complete codes exceed JavaScript's exact integer range.
  let remainder = 0;
  for (const digit of body) remainder = (remainder * 10 + Number(digit)) % 529;
  return `${CUPS_CONTROL_LETTERS[Math.floor(remainder / 23)]}${CUPS_CONTROL_LETTERS[remainder % 23]}`;
}

export function generateCups(kind: SupplyKind, random: RandomSource = Math.random): string {
  let distributor: string;
  switch (kind) {
    case 'electricity':
      distributor = '0021';
      break;
    case 'gas':
      distributor = '0230';
      break;
    default:
      throw new Error('Tipo de suministro desconocido.');
  }
  const body = `${distributor}${digits(12, random)}`;
  return `ES${body}${cupsControl(body)}`;
}

/** Spanish CUPS syntax/checksum, optionally with its two-character measure suffix. */
export function validateCups(value: string): boolean {
  const normalized = normalize(value);
  return (
    /^ES\d{16}[TRWAGMYFPDXBNJZSQVHLCKE]{2}(?:\d[FPRCXYZ])?$/.test(normalized) &&
    cupsControl(normalized.slice(2, 18)) === normalized.slice(18, 20)
  );
}
