import { getSupabase } from './client';
import { DataError, readableError } from './errors';
import {
  assertAbsence,
  assertAttendance,
  assertEntry,
  assertProfile,
  assertTask,
  assertNote,
  withNoteDefaults,
} from './rowValidation';
import { isRetryableStatus, isValidCommandResponse, rpcForAction } from './commandValidation';
import type { CommandAction, Json, WorkspaceData } from '../../domain/models';
import { isLocalAction } from '../local/engine';
import { mergeLocal, registerCloudCommand, routeCommand } from '../local/runtime';
import { isLocalEdition } from '../edition';
import { setDataGeneration } from '../localGeneration';

type PageResult<T> = {
  data: T[] | null;
  error: { message: string; code?: string } | null;
  status: number;
};

async function readAll<T>(fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>) {
  const rows: T[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error, status } = await fetchPage(from, from + pageSize - 1);
    if (error)
      throw new DataError(
        readableError(error),
        isRetryableStatus(status),
        error.code,
        error.message,
      );
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

/**
 * Runs a command. Commands on projects, tasks and entries go to the store that holds
 * them (this browser or Supabase, see lib/local/router.ts); the rest to Supabase.
 */
export async function executeCommand<T = unknown>(
  action: CommandAction,
  payload: Record<string, Json | undefined> = {},
  signal = AbortSignal.timeout(20_000),
  expectedUserId?: string,
): Promise<T> {
  // Local edition: everything lives in the local database; no browser store.
  if (isLocalEdition) return executeCloudCommand<T>(action, payload, signal, expectedUserId);
  if (isLocalAction(action))
    return (await routeCommand(action, payload, signal, expectedUserId)) as T;
  return executeCloudCommand<T>(action, payload, signal, expectedUserId);
}

/** Moves a project between the browser and Supabase (chambapp_traspasos). */
export async function executeTransfer<T = unknown>(
  action: 'importar_proyecto' | 'purgar_proyecto',
  payload: Record<string, Json | undefined>,
  expectedUserId: string,
): Promise<T> {
  const db = getSupabase();
  const { data: auth, error: authError } = await db.auth.getSession();
  if (authError || auth.session?.user.id !== expectedUserId)
    throw new DataError(
      'La sesión ha cambiado. Vuelve a acceder a tu cuenta para confirmar los cambios pendientes.',
      true,
      'SESION_CAMBIADA',
    );
  const request = db
    .rpc('chambapp_traspasos', { p_accion: action, p_datos: payload as Json })
    .abortSignal(AbortSignal.timeout(60_000));
  request.setHeader('Authorization', `Bearer ${auth.session.access_token}`);
  const { data, error, status } = await request;
  if (error)
    throw new DataError(readableError(error), isRetryableStatus(status), error.code, error.message);
  return data as T;
}

/** Runs a command on Supabase only. */
export async function executeCloudCommand<T = unknown>(
  action: CommandAction,
  payload: Record<string, Json | undefined> = {},
  signal = AbortSignal.timeout(20_000),
  expectedUserId?: string,
): Promise<T> {
  const db = getSupabase();
  const request = db
    .rpc(rpcForAction(action), { p_accion: action, p_datos: payload })
    .abortSignal(signal);
  // The local edition has no sessions: one fixed user, and the data generation
  // (sent by generationFetch) guards against stale requests instead.
  if (expectedUserId && !isLocalEdition) {
    const { data: auth, error: authError } = await db.auth.getSession();
    if (authError || auth.session?.user.id !== expectedUserId)
      throw new DataError(
        'La sesión ha cambiado. Vuelve a acceder a tu cuenta para confirmar los cambios pendientes.',
        true,
        'SESION_CAMBIADA',
      );
    // Pin the token snapshot: a later account switch cannot retarget this RPC.
    request.setHeader('Authorization', `Bearer ${auth.session.access_token}`);
  }
  const { data, error, status } = await request;
  if (error)
    throw new DataError(readableError(error), isRetryableStatus(status), error.code, error.message);
  if (!isValidCommandResponse(action, payload, data))
    throw new DataError(
      'Supabase no ha devuelto una confirmación completa. Reintenta para comprobar el resultado.',
      true,
      'RESPUESTA_INCOMPLETA',
    );
  if (data && typeof data === 'object' && !Array.isArray(data) && data.ok === false) {
    throw new DataError(
      readableError(data.codigo ?? 'Operación rechazada.'),
      false,
      String(data.codigo),
    );
  }
  return data as T;
}

export async function loadWorkspace(
  userId: string,
  cancelSignal?: AbortSignal,
): Promise<WorkspaceData> {
  const db = getSupabase();
  const timeout = AbortSignal.timeout(30_000);
  const signal = cancelSignal ? AbortSignal.any([cancelSignal, timeout]) : timeout;
  let dataGeneration: string | undefined;
  if (isLocalEdition) {
    // First the generation: every later request (and pending operation) uses it.
    const { data, error, status } = await db.rpc('chambapp_copia_estado').abortSignal(signal);
    if (error)
      throw new DataError(
        readableError(error),
        isRetryableStatus(status),
        error.code,
        error.message,
      );
    const state = data as { generacion?: unknown } | null;
    if (typeof state?.generacion !== 'string')
      throw new DataError('La base de datos local no ha devuelto su estado.', true);
    dataGeneration = state.generacion;
    setDataGeneration(dataGeneration);
  }
  const results = await Promise.all([
    db.from('perfiles').select('*').eq('id', userId).abortSignal(signal).single(),
    readAll((from, to) =>
      db
        .from('proyectos')
        .select('*')
        .is('eliminado_en', null)
        .order('creado_en', { ascending: false })
        .order('id')
        .range(from, to)
        .abortSignal(signal),
    ),
    readAll((from, to) =>
      db
        .from('tareas')
        .select('*')
        .is('eliminado_en', null)
        .order('creado_en', { ascending: false })
        .order('id')
        .range(from, to)
        .abortSignal(signal),
    ),
    readAll((from, to) =>
      db
        .from('partes_detalle')
        .select('*')
        .order('inicio_en', { ascending: false })
        .order('id')
        .range(from, to)
        .abortSignal(signal),
    ),
    readAll((from, to) =>
      db
        .from('configuraciones_semanales')
        .select('*')
        .order('vigente_desde', { ascending: false })
        .order('id')
        .range(from, to)
        .abortSignal(signal),
    ),
    readAll((from, to) =>
      db
        .from('dias_configuracion_semanal')
        .select('*')
        .order('configuracion_id')
        .order('dia_semana')
        .range(from, to)
        .abortSignal(signal),
    ),
    readAll((from, to) =>
      db
        .from('jornadas')
        .select('*')
        .order('fecha', { ascending: false })
        .order('id')
        .range(from, to)
        .abortSignal(signal),
    ),
    readAll((from, to) =>
      db
        .from('fichajes_detalle')
        .select('*')
        .order('inicio_en', { ascending: false })
        .order('id')
        .range(from, to)
        .abortSignal(signal),
    ),
    executeCloudCommand<{ hora_servidor: string }>('consultar_cronometro', {}, signal, userId).then(
      (clock) => ({
        ...clock,
        receivedAt: Date.now(),
      }),
    ),
    readAll((from, to) =>
      db
        .from('ausencias')
        .select('*')
        .order('inicio')
        .order('id')
        .range(from, to)
        .abortSignal(signal),
    ),
    readAll((from, to) =>
      db
        .from('notas_detalle')
        .select('*')
        .eq('usuario_id', userId)
        .order('actualizado_en', { ascending: false })
        .order('id')
        .range(from, to)
        .abortSignal(signal),
    ),
  ]);
  const [
    profile,
    projects,
    tasks,
    entries,
    configurations,
    days,
    jornadas,
    fichajes,
    clock,
    absences,
    notes,
  ] = results;
  if (profile.error) throw new DataError(readableError(profile.error));
  assertProfile(profile.data);
  if (
    profile.data.id !== userId ||
    [
      ...projects,
      ...tasks,
      ...entries,
      ...configurations,
      ...jornadas,
      ...fichajes,
      ...absences,
      ...notes,
    ].some((row) => row.usuario_id !== userId)
  )
    throw new DataError(
      'La sesión ha cambiado mientras se cargaban los datos. Actualiza la página.',
      true,
      'SESION_CAMBIADA',
    );
  const cloud: WorkspaceData = {
    profile: profile.data,
    projects,
    tasks: tasks.map((row) => {
      assertTask(row);
      return row;
    }),
    notes: notes.map((stored) => {
      const row = withNoteDefaults(stored);
      assertNote(row);
      return row;
    }),
    entries: entries.map((row) => {
      assertEntry(row);
      return row;
    }),
    configurations,
    days,
    absences: absences.map((row) => {
      assertAbsence(row);
      return row;
    }),
    jornadas,
    fichajes: fichajes.map((row) => {
      assertAttendance(row);
      return row;
    }),
    serverTime: clock.hora_servidor,
    receivedAt: clock.receivedAt,
    ...(dataGeneration ? { dataGeneration } : {}),
  };
  return isLocalEdition ? cloud : mergeLocal(cloud, userId);
}

registerCloudCommand(executeCloudCommand);
