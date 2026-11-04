import type { Note } from '../../domain/models';
import { decryptJson, encryptJson, isEnvelope, noteDraftAad } from '../../lib/crypto/vault.ts';

/** Exact encrypted request whose outcome is still unknown; retried byte for byte. */
export type PendingNoteSave = {
  id: string;
  version?: number;
  cifrado: string;
  boveda_generacion: string;
  proyecto_ids: string[];
  tarea_ids: string[];
};

export type NoteSession = { baseline: Note; draft: Note; pendiente?: PendingNoteSave | null };

type DraftStorage = Pick<Storage, 'getItem'>;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}

function isUuidList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isUuid) && new Set(value).size === value.length;
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value));
}

function isNote(value: unknown): value is Note {
  return (
    isRecord(value) &&
    isUuid(value.id) &&
    isUuid(value.usuario_id) &&
    typeof value.titulo === 'string' &&
    typeof value.contenido_md === 'string' &&
    typeof value.version === 'number' &&
    Number.isSafeInteger(value.version) &&
    value.version >= 0 &&
    isUuidList(value.proyecto_ids) &&
    isUuidList(value.tarea_ids) &&
    isDate(value.creado_en) &&
    isDate(value.actualizado_en)
  );
}

function isPending(value: unknown, id: string): value is PendingNoteSave {
  return (
    isRecord(value) &&
    value.id === id &&
    (value.version === undefined ||
      (typeof value.version === 'number' && Number.isSafeInteger(value.version))) &&
    isEnvelope(value.cifrado) &&
    isUuid(value.boveda_generacion) &&
    isUuidList(value.proyecto_ids) &&
    isUuidList(value.tarea_ids)
  );
}

/** Shape validation of a stored session (after decryption, or a legacy plaintext one). */
export function parseNoteSession(value: unknown): NoteSession | null {
  if (!isRecord(value) || !isNote(value.baseline) || !isNote(value.draft)) return null;
  if (
    value.baseline.id !== value.draft.id ||
    value.baseline.usuario_id !== value.draft.usuario_id ||
    value.baseline.version !== value.draft.version
  )
    return null;
  const pendiente = isPending(value.pendiente, value.baseline.id) ? value.pendiente : null;
  if (value.pendiente != null && !pendiente) return null;
  // Draft text may still fail save validation; retain it so recovery does not discard work.
  return pendiente
    ? { baseline: value.baseline, draft: value.draft, pendiente }
    : { baseline: value.baseline, draft: value.draft };
}

/** Legacy (plaintext) session as written before notes were encrypted. */
export function readNoteSession(key: string, storage?: DraftStorage): NoteSession | null {
  try {
    // Access browser storage inside the guard: blocked storage and SSR both return null.
    const value: unknown = JSON.parse(
      (storage ?? globalThis.sessionStorage).getItem(key) ?? 'null',
    );
    const session = parseNoteSession(value);
    return session && !session.pendiente ? session : null;
  } catch {
    return null;
  }
}

export type RestoredDraft =
  | { kind: 'none' }
  | { kind: 'restored'; session: NoteSession; legacy: boolean }
  | { kind: 'unreadable' };

/**
 * Reads the stored draft: an encrypted session, or a plaintext one written by an
 * earlier version (restored so it can be re-saved encrypted). Anything else is
 * reported as unreadable instead of being dropped silently.
 */
export async function restoreNoteSession(
  storageKey: string,
  key: CryptoKey,
  userId: string,
  storage?: DraftStorage,
): Promise<RestoredDraft> {
  let raw: string | null;
  try {
    raw = (storage ?? globalThis.sessionStorage).getItem(storageKey);
  } catch {
    return { kind: 'none' };
  }
  if (!raw) return { kind: 'none' };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { kind: 'unreadable' };
  }
  if (isRecord(value) && value.v === 1 && isEnvelope(value.sobre)) {
    try {
      const session = parseNoteSession(await decryptJson(key, noteDraftAad(userId), value.sobre));
      if (session && session.baseline.usuario_id === userId)
        return { kind: 'restored', session, legacy: false };
    } catch {
      /* Reported below. */
    }
    return { kind: 'unreadable' };
  }
  const legacy = parseNoteSession(value);
  if (legacy && !legacy.pendiente && legacy.baseline.usuario_id === userId)
    return { kind: 'restored', session: legacy, legacy: true };
  return { kind: 'unreadable' };
}

export async function encryptNoteSession(key: CryptoKey, userId: string, session: NoteSession) {
  return JSON.stringify({ v: 1, sobre: await encryptJson(key, noteDraftAad(userId), session) });
}

export type PendingOutcome = 'confirmed' | 'resend' | 'conflict';

/** What happened to a save whose reply was lost, given the stored row (or null). */
export function reconcilePending(
  pending: Pick<PendingNoteSave, 'version' | 'cifrado'>,
  row: { version: number; cifrado: string | null } | null,
): PendingOutcome {
  if (row && row.cifrado === pending.cifrado) return 'confirmed';
  if (pending.version === undefined) return row ? 'conflict' : 'resend';
  if (row && row.version === pending.version) return 'resend';
  return 'conflict';
}

// Last write per draft key, shared by every editor instance: an older encryption
// that finishes late must not overwrite a newer draft or recreate a discarded one.
const draftWrites = new Map<string, number>();

export function draftWriteMark(key: string): number {
  return draftWrites.get(key) ?? 0;
}

export function nextDraftWrite(key: string): number {
  const sequence = draftWriteMark(key) + 1;
  draftWrites.set(key, sequence);
  return sequence;
}

/** Explicit discard: removes the stored draft and cancels writes still in flight. */
export function clearNoteDraft(key: string, storage?: Pick<Storage, 'removeItem'>) {
  nextDraftWrite(key);
  try {
    (storage ?? globalThis.sessionStorage).removeItem(key);
  } catch {
    /* Storage may be unavailable. */
  }
}
