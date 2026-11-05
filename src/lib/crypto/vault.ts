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
const ENVELOPE = /^v1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{22,})$/;
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

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) throw new UnreadableEnvelopeError();
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

export function isEnvelope(value: unknown): value is string {
  return typeof value === 'string' && ENVELOPE.test(value);
}

function parseEnvelope(envelope: string): {
  iv: Uint8Array<ArrayBuffer>;
  data: Uint8Array<ArrayBuffer>;
} {
  const match = ENVELOPE.exec(envelope);
  if (!match) throw new UnreadableEnvelopeError();
  const iv = fromBase64Url(match[1]!);
  const data = fromBase64Url(match[2]!);
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
