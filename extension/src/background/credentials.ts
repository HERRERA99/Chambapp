import type { CredentialRow } from '../../../src/domain/models';
import { DataError } from '../../../src/lib/supabase/errors';
import { assertCredential } from '../../../src/lib/supabase/rowValidation';
import {
  credentialProblem,
  encryptCredential,
  MAX_CREDENTIAL_ENVELOPE,
  normalizeCredential,
  openCredential,
  parseCredential,
} from '../../../src/features/passwords/credentials.model';
import type {
  CredentialSecret,
  OpenCredential,
} from '../../../src/features/passwords/credentials.model';
import type { CredentialView } from '../shared/messages';
import { command, fail, requireSession, requireUser, db } from './supabase';
import { assertCurrentGeneration, assertSameEpoch, lock, unlockedKey, VAULT_LOCKED } from './vault';
import { loadProjects } from './workspace';

/** Decrypted entries, kept only in the worker's memory while it runs. */
let cache: { userId: string; generation: string; items: OpenCredential[] } | null = null;

export function clearCredentialCache() {
  cache = null;
}

/** Unlocked key, after checking that the server vault is still this one. */
async function requireKey() {
  const user = await requireUser();
  const unlocked = await unlockedKey(user.id);
  if (!unlocked) {
    cache = null;
    throw new Error(VAULT_LOCKED);
  }
  await assertCurrentGeneration(user.id, unlocked.generation);
  assertSameEpoch(unlocked.epoch);
  return { user, ...unlocked };
}

async function loadRows(userId: string): Promise<CredentialRow[]> {
  const rows: CredentialRow[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error, status } = await (
      await db()
    )
      .from('credenciales_detalle')
      .select('*')
      .eq('usuario_id', userId)
      .order('creado_en')
      .order('id')
      .range(from, from + 499)
      .abortSignal(AbortSignal.timeout(20_000));
    if (error) fail(error, status);
    for (const row of data ?? []) {
      assertCredential(row);
      rows.push(row);
    }
    if (!data || data.length < 500) return rows;
  }
}

async function items(refresh: boolean) {
  const { user, key, generation, epoch } = await requireKey();
  let opened = cache?.userId === user.id && cache.generation === generation ? cache.items : null;
  if (refresh || !opened) {
    const rows = await loadRows(user.id);
    opened = await Promise.all(rows.map((row) => openCredential(key, user.id, generation, row)));
    // Locked meanwhile: nothing decrypted is kept or returned.
    assertSameEpoch(epoch);
    cache = { userId: user.id, generation, items: opened };
  }
  assertSameEpoch(epoch);
  return { user, key, generation, epoch, items: opened };
}

export async function listCredentials(): Promise<{
  items: CredentialView[];
  projects: { id: string; nombre: string }[];
}> {
  const { items: opened } = await items(true);
  const projects = await loadProjects();
  const names = new Map(projects.map((project) => [project.id, project.nombre]));
  return {
    projects: projects
      .filter((project) => !project.archivado_en)
      .map((project) => ({ id: project.id, nombre: project.nombre })),
    items: opened
      .filter((item) => names.has(item.row.proyecto_id))
      .map(({ row, secret }) => ({
        id: row.id,
        version: row.version,
        proyectoId: row.proyecto_id,
        proyecto: names.get(row.proyecto_id) ?? '',
        readable: !!secret,
        nombre: secret?.nombre ?? 'No se puede leer',
        url: secret?.url ?? '',
        campos: (secret?.campos ?? []).map((field) => ({
          id: field.id,
          etiqueta: field.etiqueta,
          secreto: field.secreto,
          valor: field.secreto ? null : field.valor,
        })),
      })),
  };
}

export async function findCredential(id: string): Promise<OpenCredential> {
  const { items: opened, epoch } = await items(false);
  assertSameEpoch(epoch);
  const found = opened.find((item) => item.row.id === id);
  if (!found) throw new Error('La entrada ya no existe.');
  if (!found.secret) throw new Error('Esta entrada no se puede leer con la clave actual.');
  return found;
}

export async function credentialValue(id: string, fieldId: string) {
  const { secret } = await findCredential(id);
  const field = secret!.campos.find((item) => item.id === fieldId);
  if (!field) throw new Error('El campo ya no existe.');
  return field.valor;
}

/** Creates or edits an entry with the same checks and envelope as the app. */
async function storedRow(userId: string, id: string): Promise<CredentialRow | null> {
  const { data, error, status } = await (
    await db()
  )
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

export async function saveCredential(input: {
  id: string;
  version: number | null;
  proyectoId: string;
  secret: CredentialSecret;
}) {
  // The account this save belongs to: the write is refused if it changes meanwhile.
  const { account } = await requireSession();
  const { user, key, generation } = await requireKey();
  const parsed = parseCredential(input.secret);
  const problem = parsed ? credentialProblem(parsed) : 'La entrada no es válida.';
  if (problem || !parsed) throw new Error(problem ?? 'La entrada no es válida.');
  const projects = await loadProjects();
  if (!projects.some((project) => project.id === input.proyectoId && !project.archivado_en))
    throw new Error('Elige un proyecto activo.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.id))
    throw new Error('La entrada no es válida.');
  const id = input.id;
  const normalized = normalizeCredential(parsed);
  const version = input.version;
  if (version === null) {
    // A new entry: if an earlier attempt with this id did commit, do not create it twice.
    const existing = await storedRow(user.id, id);
    if (existing) {
      const opened = await openCredential(key, user.id, generation, existing);
      const same =
        existing.proyecto_id === input.proyectoId &&
        JSON.stringify(opened.secret) === JSON.stringify(normalized);
      cache = null;
      if (same) return { id: existing.id, version: existing.version };
      // Saved earlier and changed since (app or another device): never overwrite it blindly.
      throw new Error(
        'Esta entrada ya se guardó y después cambió en otro sitio. Ciérrala y ábrela de nuevo.',
      );
    }
  }
  const cifrado = await encryptCredential(key, user.id, id, normalized);
  if (cifrado.length > MAX_CREDENTIAL_ENVELOPE) throw new Error('La entrada es demasiado grande.');
  const payload = {
    id,
    ...(version !== null ? { version } : {}),
    proyecto_id: input.proyectoId,
    boveda_generacion: generation,
    cifrado,
  };
  let saved: CredentialRow;
  try {
    saved = await command<CredentialRow>('guardar_credencial', payload, account);
  } catch (cause) {
    if (cause instanceof DataError && /BOVEDA/.test(`${cause.code} ${cause.rawMessage}`))
      await lock();
    throw cause;
  }
  cache = null;
  return { id: saved.id, version: saved.version };
}
