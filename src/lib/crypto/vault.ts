/**
 * Client-side encryption for notes and credentials (WebCrypto only).
 *
 * - A random data key (DEK, AES-GCM-256) encrypts every record.
 * - The DEK is stored wrapped with a key derived from the master password
 *   (PBKDF2-SHA-256 → AES-GCM-256). The server never sees either key.
 * - Every envelope is bound to its record through AES-GCM additional data, so
 *   moving ciphertext to another row or account makes decryption fail.
 */

export const VAULT_ITERATIONS = 600_000;
export const MIN_MASTER_PASSWORD_LENGTH = 12;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export class WrongMasterPasswordError extends Error {
  constructor() {
    super('La clave maestra no es correcta.');
    this.name = 'WrongMasterPasswordError';
  }
}

export class UnreadableEnvelopeError extends Error {
  constructor() {
    super('No se pudo descifrar este contenido.');
    this.name = 'UnreadableEnvelopeError';
  }
}

export type WrappedVault = { sal: string; iteraciones: number; clave_envuelta: string };

/** Native base64 (Chrome 140+, Firefox 133+, Safari 18.2+): much faster on large data. */
type NativeBase64 = {
  toBase64?: (this: Uint8Array, options: { alphabet: 'base64url'; omitPadding: boolean }) => string;
};
type NativeFromBase64 = {
  fromBase64?: (text: string, options: { alphabet: 'base64url' }) => Uint8Array<ArrayBuffer>;
};

export function toBase64Url(bytes: Uint8Array): string {
  const native = (Uint8Array.prototype as NativeBase64).toBase64;
  if (native) return native.call(bytes, { alphabet: 'base64url', omitPadding: true });
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Only base64url characters (a loop: a regular expression overflows on large inputs). */
function isBase64Url(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (!(
      (code >= 48 && code <= 57) || // 0-9
      (code >= 65 && code <= 90) || // A-Z
      (code >= 97 && code <= 122) || // a-z
      code === 45 || // -
      code === 95 // _
    ))
      return false;
  }
  return true;
}

/**
 * `v1.<iv: 16 base64url>.<data: 22+ base64url>`, parsed without a regular expression:
 * V8 runs out of stack matching one on envelopes of several MB (large local data).
 */
function splitEnvelope(value: string): [string, string] | null {
  const first = value.indexOf('.');
  const second = value.indexOf('.', first + 1);
  if (
    first !== 2 ||
    !value.startsWith('v1.') ||
    second !== 19 ||
    value.indexOf('.', second + 1) !== -1
  )
    return null;
  const iv = value.slice(3, 19);
  const data = value.slice(20);
  return data.length >= 22 && isBase64Url(iv) && isBase64Url(data) ? [iv, data] : null;
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!isBase64Url(text) || text.length % 4 === 1) throw new UnreadableEnvelopeError();
  const native = (Uint8Array as NativeFromBase64).fromBase64;
  if (native) {
    try {
      return native(text, { alphabet: 'base64url' });
    } catch {
      throw new UnreadableEnvelopeError();
    }
  }
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function random(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

export const vaultAad = (userId: string) => `chambapp:boveda:v1:${userId}`;
export const noteAad = (userId: string, noteId: string) => `chambapp:nota:v1:${userId}:${noteId}`;
export const credentialAad = (userId: string, credentialId: string) =>
  `chambapp:credencial:v1:${userId}:${credentialId}`;
export const noteDraftAad = (userId: string) => `chambapp:borrador-nota:v1:${userId}`;
/** Projects, tasks and entries kept in this browser (IndexedDB), under the vault data key. */
export const localDataAad = (userId: string) => `chambapp:local:v1:${userId}`;
/** Backup file of the local data, under a key derived from a password chosen for it. */
export const localBackupAad = (userId: string) => `chambapp:copia-local:v1:${userId}`;

export function isEnvelope(value: unknown): value is string {
  return typeof value === 'string' && splitEnvelope(value) !== null;
}

function parseEnvelope(envelope: string): {
  iv: Uint8Array<ArrayBuffer>;
  data: Uint8Array<ArrayBuffer>;
} {
  const parts = splitEnvelope(envelope);
  if (!parts) throw new UnreadableEnvelopeError();
  const iv = fromBase64Url(parts[0]);
  const data = fromBase64Url(parts[1]);
  if (iv.length !== 12 || data.length < 16) throw new UnreadableEnvelopeError();
  return { iv, data };
}

function joinEnvelope(iv: Uint8Array, data: ArrayBuffer): string {
  return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(data))}`;
}

async function deriveKek(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

async function wrap(dek: CryptoKey, password: string, userId: string, iterations: number) {
  const salt = random(16);
  const kek = await deriveKek(password, salt, iterations);
  const iv = random(12);
  const wrapped = await crypto.subtle.wrapKey('raw', dek, kek, {
    name: 'AES-GCM',
    iv,
    additionalData: encoder.encode(vaultAad(userId)),
  });
  return {
    sal: toBase64Url(salt),
    iteraciones: iterations,
    clave_envuelta: joinEnvelope(iv, wrapped),
  };
}

async function unwrap(
  password: string,
  userId: string,
  vault: WrappedVault,
  extractable: boolean,
): Promise<CryptoKey> {
  let salt: Uint8Array<ArrayBuffer>;
  let parsed: ReturnType<typeof parseEnvelope>;
  try {
    salt = fromBase64Url(vault.sal);
    parsed = parseEnvelope(vault.clave_envuelta);
  } catch {
    throw new UnreadableEnvelopeError();
  }
  const kek = await deriveKek(password, salt, vault.iteraciones);
  try {
    return await crypto.subtle.unwrapKey(
      'raw',
      parsed.data,
      kek,
      { name: 'AES-GCM', iv: parsed.iv, additionalData: encoder.encode(vaultAad(userId)) },
      { name: 'AES-GCM', length: 256 },
      extractable,
      ['encrypt', 'decrypt'],
    );
  } catch {
    throw new WrongMasterPasswordError();
  }
}

/** Random salt for `derivePasswordKey`, base64url. */
export function newSalt(): string {
  return toBase64Url(random(16));
}

/**
 * AES-GCM key derived from a password (PBKDF2-SHA-256), for data that must not
 * depend on the vault, such as a backup file.
 */
export async function derivePasswordKey(password: string, salt: string, iterations: number) {
  let saltBytes: Uint8Array<ArrayBuffer>;
  try {
    saltBytes = fromBase64Url(salt);
  } catch {
    throw new UnreadableEnvelopeError();
  }
  if (saltBytes.length < 16 || !Number.isSafeInteger(iterations) || iterations < 100_000)
    throw new UnreadableEnvelopeError();
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** New vault: a fresh data key wrapped with the master password. */
export async function createVault(
  password: string,
  userId: string,
  iterations = VAULT_ITERATIONS,
): Promise<WrappedVault & { key: CryptoKey }> {
  const extractable = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const wrapped = await wrap(extractable, password, userId, iterations);
  // The key kept in memory cannot be exported.
  const key = await unwrap(password, userId, wrapped, false);
  return { ...wrapped, key };
}

/** Data key for an existing vault; throws WrongMasterPasswordError. */
export function unlockVault(password: string, userId: string, vault: WrappedVault) {
  return unwrap(password, userId, vault, false);
}

/**
 * Data key that can be exported once, for the browser extension: it keeps the
 * raw key only in its in-memory session storage. The app never uses this.
 */
export function unlockVaultExtractable(password: string, userId: string, vault: WrappedVault) {
  return unwrap(password, userId, vault, true);
}

export async function exportRawKey(key: CryptoKey): Promise<string> {
  return toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}

/** Non-extractable data key from its raw bytes. */
export async function importRawKey(raw: string): Promise<CryptoKey> {
  const bytes = fromBase64Url(raw);
  if (bytes.length !== 32) throw new UnreadableEnvelopeError();
  return crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/** Same data key wrapped with a new master password (records are not re-encrypted). */
export async function rewrapVault(
  oldPassword: string,
  newPassword: string,
  userId: string,
  vault: WrappedVault,
  iterations = VAULT_ITERATIONS,
): Promise<WrappedVault> {
  const dek = await unwrap(oldPassword, userId, vault, true);
  return wrap(dek, newPassword, userId, iterations);
}

export async function encryptBytes(key: CryptoKey, aad: string, bytes: Uint8Array<ArrayBuffer>) {
  const iv = random(12);
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(aad) },
    key,
    bytes,
  );
  return joinEnvelope(iv, data);
}

export async function decryptBytes(key: CryptoKey, aad: string, envelope: string) {
  const { iv, data } = parseEnvelope(envelope);
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: encoder.encode(aad) },
        key,
        data,
      ),
    );
  } catch {
    throw new UnreadableEnvelopeError();
  }
}

export function encryptJson(key: CryptoKey, aad: string, value: unknown) {
  return encryptBytes(key, aad, encoder.encode(JSON.stringify(value)));
}

export async function decryptJson(key: CryptoKey, aad: string, envelope: string): Promise<unknown> {
  const bytes = await decryptBytes(key, aad, envelope);
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    throw new UnreadableEnvelopeError();
  }
}

/** `[u32 BE title length][title UTF-8][content UTF-8]`: no JSON escaping overhead. */
export function encodeNotePlaintext(note: { titulo: string; contenido_md: string }) {
  const title = encoder.encode(note.titulo);
  const content = encoder.encode(note.contenido_md);
  const bytes = new Uint8Array(4 + title.length + content.length);
  new DataView(bytes.buffer).setUint32(0, title.length);
  bytes.set(title, 4);
  bytes.set(content, 4 + title.length);
  return bytes;
}

export function decodeNotePlaintext(bytes: Uint8Array): { titulo: string; contenido_md: string } {
  if (bytes.length < 4) throw new UnreadableEnvelopeError();
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (4 + length > bytes.length) throw new UnreadableEnvelopeError();
  try {
    return {
      titulo: decoder.decode(bytes.subarray(4, 4 + length)),
      contenido_md: decoder.decode(bytes.subarray(4 + length)),
    };
  } catch {
    throw new UnreadableEnvelopeError();
  }
}

export function encryptNote(
  key: CryptoKey,
  userId: string,
  noteId: string,
  note: { titulo: string; contenido_md: string },
) {
  return encryptBytes(key, noteAad(userId, noteId), encodeNotePlaintext(note));
}

export async function decryptNote(
  key: CryptoKey,
  userId: string,
  noteId: string,
  envelope: string,
) {
  return decodeNotePlaintext(await decryptBytes(key, noteAad(userId, noteId), envelope));
}
