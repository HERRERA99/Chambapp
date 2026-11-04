import { useEffect, useRef, useState } from 'react';
import type { Note, NoteRow } from '../../domain/models';
import { decryptNote } from '../../lib/crypto/vault';
import { useAuth } from '../auth/useAuth';
import { useWorkspace } from '../workspace/useWorkspace';
import { useVault } from '../vault/useVault';

export type DecryptedNotes = {
  /** `locked` until the vault is unlocked; `decrypting` while the first pass runs. */
  status: 'locked' | 'decrypting' | 'ready';
  notes: Note[];
  /** Notes whose envelope could not be read (damaged or from another key). */
  unreadable: NoteRow[];
};

const MAX_TITLE = 200;
const MAX_BYTES = 1_000_000;

/** Plain note for a stored row; throws when it cannot be decrypted and validated. */
export async function openNoteRow(key: CryptoKey | null, userId: string, row: NoteRow) {
  const { cifrado, boveda_generacion, ...note } = row;
  void boveda_generacion;
  if (cifrado === null) return note;
  if (!key) throw new Error('La bóveda está bloqueada.');
  const plain = await decryptNote(key, userId, row.id, cifrado);
  if (
    !plain.titulo.trim() ||
    [...plain.titulo].length > MAX_TITLE ||
    new TextEncoder().encode(plain.contenido_md).length > MAX_BYTES
  )
    throw new Error('La nota descifrada no es válida.');
  return { ...note, ...plain };
}

type PlainText = { titulo: string; contenido_md: string };

/** Workspace notes decrypted with the unlocked vault key. */
export function useNotes(): DecryptedNotes {
  const { data } = useWorkspace();
  const { user } = useAuth();
  const vault = useVault();
  const rows = data?.notes;
  const key = vault.key;
  const generation = vault.generation;
  // Only decrypted text is cached (per row version and envelope); links, dates and
  // versions always come from the current row, because project or task deletion
  // changes a note's links without changing its version.
  const cache = useRef(new Map<string, PlainText | null>());
  const cacheKey = useRef<CryptoKey | null>(null);
  const [result, setResult] = useState<{
    rows: NoteRow[] | undefined;
    key: CryptoKey | null;
    value: DecryptedNotes;
  } | null>(null);
  // Locking drops every decrypted value and the key reference.
  if (!key && result) setResult(null);

  useEffect(() => {
    if (!key) {
      cache.current = new Map();
      cacheKey.current = null;
      return;
    }
    if (!rows || !user) return;
    if (cacheKey.current !== key) {
      cache.current = new Map();
      cacheKey.current = key;
    }
    let cancelled = false;
    void (async () => {
      const notes: Note[] = [];
      const unreadable: NoteRow[] = [];
      const next = new Map<string, PlainText | null>();
      for (const row of rows) {
        if (cancelled) return;
        const id = `${row.id}:${row.version}:${row.cifrado ?? 'plain'}`;
        let text = cache.current.get(id);
        if (text === undefined) {
          try {
            text =
              row.cifrado !== null && row.boveda_generacion !== generation
                ? null
                : await openNoteRow(key, user.id, row);
          } catch {
            text = null;
          }
        }
        next.set(id, text ? { titulo: text.titulo, contenido_md: text.contenido_md } : null);
        if (text) {
          const { cifrado, boveda_generacion, ...metadata } = row;
          void cifrado;
          void boveda_generacion;
          notes.push({ ...metadata, titulo: text.titulo, contenido_md: text.contenido_md });
        } else unreadable.push(row);
      }
      if (cancelled || cacheKey.current !== key) return;
      cache.current = next;
      setResult({ rows, key, value: { status: 'ready', notes, unreadable } });
    })();
    return () => {
      cancelled = true;
    };
  }, [rows, key, generation, user]);

  if (!key) return { status: 'locked', notes: [], unreadable: [] };
  if (!result || result.key !== key) return { status: 'decrypting', notes: [], unreadable: [] };
  // While a newer workspace snapshot is decrypted, keep showing the previous result.
  return result.value;
}
