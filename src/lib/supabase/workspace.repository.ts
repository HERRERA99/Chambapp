import { getSupabase } from './client';
import { DataError, readableError } from './errors';
import { assertEntry, assertProfile, assertTask } from './rowValidation';
import { isRetryableStatus, isValidCommandResponse } from './commandValidation';
import type { CommandAction, Json, WorkspaceData } from '../../domain/models';

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

export async function executeCommand<T = unknown>(
  action: CommandAction,
  payload: Record<string, Json | undefined> = {},
  signal = AbortSignal.timeout(20_000),
  expectedUserId?: string,
): Promise<T> {
  const db = getSupabase();
  const request = db
    .rpc('chambapp_operar', { p_accion: action, p_datos: payload })
    .abortSignal(signal);
  if (expectedUserId) {
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
    executeCommand<{ hora_servidor: string }>('consultar_cronometro', {}, signal, userId).then(
      (clock) => ({
        ...clock,
        receivedAt: Date.now(),
      }),
    ),
  ]);
  const [profile, projects, tasks, entries, configurations, days, jornadas, clock] = results;
  if (profile.error) throw new DataError(readableError(profile.error));
  assertProfile(profile.data);
  if (
    profile.data.id !== userId ||
    [...projects, ...tasks, ...entries, ...configurations, ...jornadas].some(
      (row) => row.usuario_id !== userId,
    )
  )
    throw new DataError(
      'La sesión ha cambiado mientras se cargaban los datos. Actualiza la página.',
      true,
      'SESION_CAMBIADA',
    );
  return {
    profile: profile.data,
    projects,
    tasks: tasks.map((row) => {
      assertTask(row);
      return row;
    }),
    entries: entries.map((row) => {
      assertEntry(row);
      return row;
    }),
    configurations,
    days,
    jornadas,
    serverTime: clock.hora_servidor,
    receivedAt: clock.receivedAt,
  };
}
