import { getSupabase } from './client';
import { DataError, readableError } from './errors';
import { isRetryableStatus } from './commandValidation';
import { assertCredential, assertNote, assertVault, withNoteDefaults } from './rowValidation';
import type { CredentialRow, NoteRow, VaultRow } from '../../domain/models';

function fail(error: { message: string; code?: string }, status: number): never {
  throw new DataError(readableError(error), isRetryableStatus(status), error.code, error.message);
}

/** The account's vault, or null before a master password is created. */
export async function loadVault(userId: string, signal?: AbortSignal): Promise<VaultRow | null> {
  let query = getSupabase().from('bovedas').select('*').eq('usuario_id', userId);
  if (signal) query = query.abortSignal(signal);
  const { data, error, status } = await query.maybeSingle();
  if (error) fail(error, status);
  if (!data) return null;
  assertVault(data);
  return data;
}

/** Current stored note, used to resolve a save whose outcome was not confirmed. */
export async function fetchNoteRow(userId: string, id: string): Promise<NoteRow | null> {
  const { data, error, status } = await getSupabase()
    .from('notas_detalle')
    .select('*')
    .eq('usuario_id', userId)
    .eq('id', id)
    .abortSignal(AbortSignal.timeout(20_000))
    .maybeSingle();
  if (error) fail(error, status);
  if (!data) return null;
  const row = withNoteDefaults(data);
  assertNote(row);
  return row;
}

export async function loadCredentials(
  userId: string,
  signal?: AbortSignal,
): Promise<CredentialRow[]> {
  const rows: CredentialRow[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    let query = getSupabase()
      .from('credenciales_detalle')
      .select('*')
      .eq('usuario_id', userId)
      .order('creado_en')
      .order('id')
      .range(from, from + pageSize - 1);
    if (signal) query = query.abortSignal(signal);
    const { data, error, status } = await query;
    if (error) fail(error, status);
    for (const row of data ?? []) {
      assertCredential(row);
      rows.push(row);
    }
    if (!data || data.length < pageSize) return rows;
  }
}

export async function fetchCredentialRow(userId: string, id: string) {
  const { data, error, status } = await getSupabase()
    .from('credenciales')
    .select('*')
    .eq('usuario_id', userId)
    .eq('id', id)
    .abortSignal(AbortSignal.timeout(20_000))
    .maybeSingle();
  if (error) fail(error, status);
  if (!data) return null;
  assertCredential(data);
  return data;
}
