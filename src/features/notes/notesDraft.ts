import type { Note } from '../../domain/models';

export type NoteSession = { baseline: Note; draft: Note };

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

export function readNoteSession(key: string, storage?: DraftStorage): NoteSession | null {
  try {
    // Access browser storage inside the guard: blocked storage and SSR both return null.
    const value: unknown = JSON.parse(
      (storage ?? globalThis.sessionStorage).getItem(key) ?? 'null',
    );
    if (!isRecord(value) || !isNote(value.baseline) || !isNote(value.draft)) return null;
    if (
      value.baseline.id !== value.draft.id ||
      value.baseline.usuario_id !== value.draft.usuario_id ||
      value.baseline.version !== value.draft.version
    )
      return null;
    // Draft text may still fail save validation; retain it so recovery does not discard work.
    return { baseline: value.baseline, draft: value.draft };
  } catch {
    return null;
  }
}
