import type { Project, Task } from '../../../src/domain/models';
import { assertTask } from '../../../src/lib/supabase/rowValidation';
import type { EntryRow, ProjectRow, TaskRow } from '../shared/queue';
import { command, fail, requireSession } from './supabase';

async function readAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string; code?: string } | null;
    status: number;
  }>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error, status } = await page(from, from + 499);
    if (error) fail(error, status);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

/** Where the user keeps new projects (perfiles.preferencias.almacenamiento). */
export async function loadStorageMode(expectedUserId?: string): Promise<'nube' | 'local'> {
  const { user, client } = await requireSession(expectedUserId);
  const { data, error, status } = await client
    .from('perfiles')
    .select('preferencias')
    .eq('id', user.id)
    .abortSignal(AbortSignal.timeout(20_000))
    .maybeSingle();
  if (error) fail(error, status);
  const preferences = data?.preferencias as { almacenamiento?: unknown } | null | undefined;
  return preferences?.almacenamiento === 'local' ? 'local' : 'nube';
}

/** Live projects of the signed-in user (archived ones included; callers filter). */
export async function loadProjects(expectedUserId?: string): Promise<Project[]> {
  const { user, client } = await requireSession(expectedUserId);
  return readAll<Project>((from, to) =>
    client
      .from('proyectos')
      .select('*')
      .eq('usuario_id', user.id)
      .is('eliminado_en', null)
      .order('nombre')
      .order('id')
      .range(from, to)
      .abortSignal(AbortSignal.timeout(20_000)),
  );
}

export async function loadTasks(expectedUserId?: string): Promise<Task[]> {
  const { user, client } = await requireSession(expectedUserId);
  const rows = await readAll((from, to) =>
    client
      .from('tareas')
      .select('*')
      .eq('usuario_id', user.id)
      .is('eliminado_en', null)
      .order('creado_en', { ascending: false })
      .order('id')
      .range(from, to)
      .abortSignal(AbortSignal.timeout(20_000)),
  );
  for (const row of rows) assertTask(row);
  return rows as Task[];
}

export async function createProject(nombre: string, expectedUserId?: string): Promise<Project> {
  return command<Project>(
    'crear_proyecto',
    { nombre, descripcion: null, cliente: null, presupuesto_minutos: null },
    expectedUserId,
  );
}

export async function createTask(
  task: {
    proyecto_id: string;
    titulo: string;
    odoo_id: string | null;
    odoo_url: string | null;
  },
  expectedUserId?: string,
): Promise<Task> {
  const created = await command<Task>(
    'crear_tarea',
    { ...task, descripcion: null, estado: 'pendiente', estimacion_minutos: null },
    expectedUserId,
  );
  assertTask(created as never);
  return created;
}

/** Entries of a request, read again right before writing anything to Odoo. */
export async function loadEntryRows(ids: string[], expectedUserId?: string): Promise<EntryRow[]> {
  const { user, client } = await requireSession(expectedUserId);
  const rows: EntryRow[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const { data, error, status } = await client
      .from('partes_detalle')
      .select(
        'id, usuario_id, version, tarea_id, fecha, fin_en, eliminado_en, imputacion_odoo_id, duracion_real_segundos, intervalo_redondeo_minutos',
      )
      .eq('usuario_id', user.id)
      .in('id', ids.slice(index, index + 100))
      .abortSignal(AbortSignal.timeout(20_000));
    if (error) fail(error, status);
    rows.push(...((data ?? []) as EntryRow[]));
  }
  return rows;
}

export async function loadTaskAndProject(
  taskId: string,
  expectedUserId?: string,
): Promise<{ task: TaskRow | null; project: ProjectRow | null }> {
  const { user, client } = await requireSession(expectedUserId);
  const taskResult = await client
    .from('tareas')
    .select('id, usuario_id, proyecto_id, version, odoo_url, eliminado_en')
    .eq('usuario_id', user.id)
    .eq('id', taskId)
    .abortSignal(AbortSignal.timeout(20_000))
    .maybeSingle();
  if (taskResult.error) fail(taskResult.error, taskResult.status);
  const task = (taskResult.data as TaskRow | null) ?? null;
  if (!task) return { task: null, project: null };
  const projectResult = await client
    .from('proyectos')
    .select('id, eliminado_en')
    .eq('usuario_id', user.id)
    .eq('id', task.proyecto_id)
    .abortSignal(AbortSignal.timeout(20_000))
    .maybeSingle();
  if (projectResult.error) fail(projectResult.error, projectResult.status);
  return { task, project: (projectResult.data as ProjectRow | null) ?? null };
}
