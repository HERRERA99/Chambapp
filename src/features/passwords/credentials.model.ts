/** Password-manager entry as stored inside its encrypted envelope. */
export type CredentialField = {
  id: string;
  etiqueta: string;
  valor: string;
  secreto: boolean;
};

export type CredentialSecret = {
  nombre: string;
  url: string;
  campos: CredentialField[];
};

export const CREDENTIAL_LIMITS = {
  nombre: 120,
  url: 2000,
  campos: 30,
  etiqueta: 60,
  valor: 1000,
} as const;

/** Server-side ceiling of the envelope column (`credenciales.cifrado`). */
export const MAX_CREDENTIAL_ENVELOPE = 262_144;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const control = /\p{Cc}/u;
const length = (text: string) => [...text].length;

export function newField(etiqueta = '', secreto = false): CredentialField {
  return { id: crypto.randomUUID(), etiqueta, valor: '', secreto };
}

/** New entries start with a user and a hidden password; both can be renamed or removed. */
export function defaultCredential(): CredentialSecret {
  return { nombre: '', url: '', campos: [newField('Usuario'), newField('Contraseña', true)] };
}

/** First problem of an entry, worded for the form; null when it can be saved. */
export function credentialProblem(secret: CredentialSecret): string | null {
  const nombre = secret.nombre.trim();
  if (!nombre) return 'Escribe un nombre para la entrada.';
  if (length(nombre) > CREDENTIAL_LIMITS.nombre)
    return `El nombre admite hasta ${CREDENTIAL_LIMITS.nombre} caracteres.`;
  if (control.test(nombre)) return 'El nombre contiene caracteres no válidos.';
  if (length(secret.url) > CREDENTIAL_LIMITS.url)
    return `La dirección admite hasta ${CREDENTIAL_LIMITS.url} caracteres.`;
  if (control.test(secret.url)) return 'La dirección contiene caracteres no válidos.';
  if (secret.url.trim() && !safeUrl(secret.url))
    return 'La dirección debe empezar por http:// o https://.';
  if (!secret.campos.length) return 'Añade al menos un campo.';
  if (secret.campos.length > CREDENTIAL_LIMITS.campos)
    return `Cada entrada admite hasta ${CREDENTIAL_LIMITS.campos} campos.`;
  for (const field of secret.campos) {
    if (!field.etiqueta.trim()) return 'Todos los campos necesitan un nombre.';
    if (length(field.etiqueta) > CREDENTIAL_LIMITS.etiqueta)
      return `El nombre de un campo admite hasta ${CREDENTIAL_LIMITS.etiqueta} caracteres.`;
    if (length(field.valor) > CREDENTIAL_LIMITS.valor)
      return `El valor de un campo admite hasta ${CREDENTIAL_LIMITS.valor} caracteres.`;
    if (control.test(field.etiqueta) || control.test(field.valor))
      return `«${field.etiqueta.trim()}» contiene saltos de línea o caracteres no válidos.`;
  }
  return null;
}

/** Normalized copy for encryption (trimmed name, URL and labels). */
export function normalizeCredential(secret: CredentialSecret): CredentialSecret {
  return {
    nombre: secret.nombre.trim(),
    url: secret.url.trim(),
    campos: secret.campos.map((field) => ({
      id: field.id,
      etiqueta: field.etiqueta.trim(),
      valor: field.valor,
      secreto: field.secreto,
    })),
  };
}

/** Shape check of a decrypted entry; returns null when it is not a valid entry. */
export function parseCredential(value: unknown): CredentialSecret | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.nombre !== 'string' ||
    typeof record.url !== 'string' ||
    !Array.isArray(record.campos)
  )
    return null;
  const campos: CredentialField[] = [];
  for (const item of record.campos) {
    if (!item || typeof item !== 'object') return null;
    const field = item as Record<string, unknown>;
    if (
      typeof field.id !== 'string' ||
      !uuid.test(field.id) ||
      typeof field.etiqueta !== 'string' ||
      typeof field.valor !== 'string' ||
      typeof field.secreto !== 'boolean'
    )
      return null;
    campos.push({
      id: field.id,
      etiqueta: field.etiqueta,
      valor: field.valor,
      secreto: field.secreto,
    });
  }
  const secret = { nombre: record.nombre, url: record.url, campos };
  return credentialProblem(secret) ? null : secret;
}

/** Only http(s) links are opened. */
export function safeUrl(text: string): string | null {
  try {
    const url = new URL(text.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function fold(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
}

/** Search by name, address, field names and visible (non-secret) values. */
export function credentialMatches(secret: CredentialSecret, query: string): boolean {
  const needle = fold(query.trim());
  if (!needle) return true;
  return [
    secret.nombre,
    secret.url,
    ...secret.campos.flatMap((field) =>
      field.secreto ? [field.etiqueta] : [field.etiqueta, field.valor],
    ),
  ].some((text) => fold(text).includes(needle));
}

export const PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#$%&*+-=?@_';

/** Random password using rejection sampling, so every character is equally likely. */
export function generatePassword(
  size = 20,
  alphabet = PASSWORD_ALPHABET,
  random: (buffer: Uint32Array<ArrayBuffer>) => void = (buffer) => {
    crypto.getRandomValues(buffer);
  },
): string {
  const limit = Math.floor(0x1_0000_0000 / alphabet.length) * alphabet.length;
  let result = '';
  // getRandomValues fills at most 64 KiB per call.
  const buffer = new Uint32Array(Math.min(size * 2, 4096));
  while (result.length < size) {
    random(buffer);
    for (const value of buffer) {
      if (value >= limit) continue;
      result += alphabet[value % alphabet.length];
      if (result.length === size) break;
    }
  }
  return result;
}
