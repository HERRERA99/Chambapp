// Commands on projects, tasks and time entries kept in this browser. A port of the
// Supabase functions chambapp_private.operar / operar_legacy / imputaciones and their
// triggers (validar_fila, validar_arbol, sincronizar/limpiar_imputacion_odoo and the
// table constraints), with the same error codes and response shapes. Pure: it never
// changes its input and returns a new snapshot.
import { DateTime } from 'luxon';
import { isOdooId, isOdooUrl } from '../../domain/odoo.ts';
import { roundDuration, roundingIntervals } from '../../domain/time.ts';
import type { CommandAction, Json, TimeEntry } from '../../domain/models.ts';
import { LocalCommandError } from './types.ts';
import type {
  LocalImputation,
  LocalPart,
  LocalProject,
  LocalSnapshot,
  LocalTask,
} from './types.ts';

type Payload = { [key: string]: Json | undefined };
type Result = { [key: string]: Json | undefined };

/** Interval of a live cloud entry (an open one has fin_en null). */
export type CloudInterval = { id: string; inicio_en: string; fin_en: string | null };

export type EngineContext = {
  userId: string;
  now: Date;
  profile: { zona_horaria: string; intervalo_redondeo_minutos: number };
  /** Cloud workdays already loaded: an entry on one of these days takes its id and zone. */
  cloudJornadas: readonly { id: string; fecha: string; zona_horaria: string }[];
  /** Live cloud entries: local entries may not overlap them. */
  cloudEntries: readonly CloudInterval[];
  newId: () => string;
};

export const LOCAL_ACTIONS = [
  'crear_proyecto',
  'editar_proyecto',
  'eliminar_proyecto',
  'crear_tarea',
  'editar_tarea',
  'eliminar_tarea',
  'crear_parte',
  'editar_parte',
  'eliminar_parte',
  'iniciar',
  'detener',
  'consultar_operacion',
  'consultar_cronometro',
  'imputar_partes',
  'deshacer_imputacion',
] as const satisfies readonly CommandAction[];
export type LocalAction = (typeof LOCAL_ACTIONS)[number];

export const isLocalAction = (action: string): action is LocalAction =>
  (LOCAL_ACTIONS as readonly string[]).includes(action);

const fail = (code: string): never => {
  throw new LocalCommandError(code);
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const has = (payload: Payload, key: string) =>
  Object.prototype.hasOwnProperty.call(payload, key) && payload[key] !== undefined;

/** `p_datos ->> key`: text or null; anything else is invalid. */
function text(payload: Payload, key: string): string | null {
  const value = payload[key];
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fail('DATOS_INVALIDOS');
}

function integer(payload: Payload, key: string): number | null {
  const value = text(payload, key);
  if (value === null) return null;
  if (!/^-?\d{1,15}$/.test(value.trim())) fail('DATOS_INVALIDOS');
  return Number(value.trim());
}

function bool(payload: Payload, key: string): boolean | null {
  const value = payload[key];
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 'false') return value === 'true';
  return fail('DATOS_INVALIDOS');
}

function id(payload: Payload, key: string): string | null {
  const value = text(payload, key);
  if (value === null) return null;
  if (!uuid.test(value)) fail('DATOS_INVALIDOS');
  return value.toLowerCase();
}

/** `(p_datos ->> 'version')::bigint`. */
function version(payload: Payload): number | null {
  return integer(payload, 'version');
}

/** Any instant Postgres would read as timestamptz. */
function instant(payload: Payload, key: string): Date | null {
  const value = text(payload, key);
  if (value === null) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail('DATOS_INVALIDOS');
  return new Date(parsed);
}

/** chambapp_private.instante_fichaje: an instant that names its zone. */
function zonedInstant(payload: Payload, key: string): Date | null {
  const value = text(payload, key);
  if (value === null) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?([Zz]|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    fail('ZONA_HORARIA_REQUERIDA');
  return new Date(Date.parse(value));
}

const iso = (date: Date) => date.toISOString();
const clone = <T>(value: T): T => structuredClone(value);
const trimmedLength = (value: string) => [...value.trim()].length;

function checkProject(row: LocalProject) {
  if (trimmedLength(row.nombre) < 1 || trimmedLength(row.nombre) > 200) fail('DATOS_INVALIDOS');
  if (row.cliente !== null && (trimmedLength(row.cliente) < 1 || trimmedLength(row.cliente) > 200))
    fail('DATOS_INVALIDOS');
  if (row.presupuesto_minutos !== null && row.presupuesto_minutos < 0) fail('DATOS_INVALIDOS');
}

function checkTask(row: LocalTask) {
  if (trimmedLength(row.titulo) < 1 || trimmedLength(row.titulo) > 300) fail('DATOS_INVALIDOS');
  if (!['pendiente', 'en_curso', 'completada'].includes(row.estado)) fail('DATOS_INVALIDOS');
  if (row.estimacion_minutos !== null && row.estimacion_minutos < 0) fail('DATOS_INVALIDOS');
  if (row.odoo_id !== null && !isOdooId(row.odoo_id)) fail('tareas_odoo_id_formato');
  if (row.odoo_url !== null && !isOdooUrl(row.odoo_url)) fail('tareas_odoo_url_formato');
}

// ---------------------------------------------------------------- derived view

/** Day of an instant in a zone (Postgres `(ts at time zone zone)::date`). */
export function dayIn(instantIso: string, zone: string): string {
  const day = DateTime.fromISO(instantIso, { zone: 'utc' }).setZone(zone).toISODate();
  if (!day) return fail('ZONA_HORARIA_INVALIDA');
  return day;
}

/** The row as `partes_detalle` shows it (time entry with project, day and durations). */
export function entryView(part: LocalPart, task: LocalTask): TimeEntry {
  const real =
    part.fin_en === null ? null : (Date.parse(part.fin_en) - Date.parse(part.inicio_en)) / 1000;
  return {
    ...part,
    proyecto_id: task.proyecto_id,
    odoo_id: task.odoo_id,
    odoo_url: task.odoo_url,
    inicio_imputado_en: part.inicio_en,
    fin_imputado_en: part.fin_en,
    duracion_real_segundos: real,
    duracion_imputada_segundos:
      real === null ? null : roundDuration(real, part.intervalo_redondeo_minutos),
  };
}

/** Live entries as `partes_detalle` returns them (not deleted, task not deleted). */
export function entriesView(snapshot: LocalSnapshot): TimeEntry[] {
  const tasks = new Map(snapshot.tareas.map((task) => [task.id, task]));
  return snapshot.partes.flatMap((part) => {
    const task = tasks.get(part.tarea_id);
    return part.eliminado_en === null && task && task.eliminado_en === null
      ? [entryView(part, task)]
      : [];
  });
}

// ---------------------------------------------------------------- engine

type State = {
  snapshot: LocalSnapshot;
  context: EngineContext;
  now: string;
};

function project(state: State, projectId: string | null) {
  return state.snapshot.proyectos.find((row) => row.id === projectId);
}
function task(state: State, taskId: string | null) {
  return state.snapshot.tareas.find((row) => row.id === taskId);
}
function part(state: State, partId: string | null) {
  return state.snapshot.partes.find((row) => row.id === partId);
}

/** validar_fila for an update: identity is fixed, version and timestamp move on. */
function bump<T extends { version: number; actualizado_en: string }>(state: State, row: T) {
  row.version += 1;
  row.actualizado_en = state.now;
}

/** Workday of a day: the cloud one if loaded, else a stable local id (obtener_jornada). */
function workday(state: State, fecha: string, zone: string) {
  const cloud = state.context.cloudJornadas.find((day) => day.fecha === fecha);
  if (cloud) return { id: cloud.id, zona_horaria: cloud.zona_horaria };
  const local = state.snapshot.jornadas_locales[fecha];
  if (local) return local;
  const created = { id: state.context.newId(), zona_horaria: zone };
  state.snapshot.jornadas_locales[fecha] = created;
  return created;
}

/**
 * Day and workday of a new entry: the day of `start` in the profile zone, and that
 * day's workday (which keeps its own zone), as obtener_jornada does.
 */
function placeEntry(state: State, start: string) {
  const fecha = dayIn(start, state.context.profile.zona_horaria);
  return { fecha, ...workday(state, fecha, state.context.profile.zona_horaria) };
}

const end = (value: string | null) => (value === null ? Infinity : Date.parse(value));

/** exclude using gist tstzrange(inicio_en, fin_en, '[)'): no overlap, local or cloud. */
function checkOverlap(state: State, row: LocalPart) {
  const start = Date.parse(row.inicio_en);
  const finish = end(row.fin_en);
  const overlaps = (other: { id: string; inicio_en: string; fin_en: string | null }) =>
    other.id !== row.id && start < end(other.fin_en) && Date.parse(other.inicio_en) < finish;
  if (
    state.snapshot.partes.some((other) => other.eliminado_en === null && overlaps(other)) ||
    state.context.cloudEntries.some(overlaps)
  )
    fail('PARTES_SOLAPADOS');
}

/** validar_fila for partes_horas (live rows). */
function checkPart(state: State, row: LocalPart, previous: LocalPart | null) {
  if (!Number.isFinite(Date.parse(row.inicio_en))) fail('DATOS_INVALIDOS');
  if (row.fin_en !== null && !(Date.parse(row.fin_en) > Date.parse(row.inicio_en)))
    fail('FECHA_INICIO_INVALIDA');
  if (!(roundingIntervals as readonly number[]).includes(row.intervalo_redondeo_minutos))
    fail('DATOS_INVALIDOS');
  if (row.eliminado_en !== null) return;
  const parent = task(state, row.tarea_id);
  const parentProject = parent ? project(state, parent.proyecto_id) : undefined;
  if (!parent || !parentProject) return fail('TAREA_NO_DISPONIBLE');
  const changedTask = !previous || previous.tarea_id !== row.tarea_id;
  if (
    parent.eliminado_en !== null ||
    parentProject.eliminado_en !== null ||
    (changedTask && (parent.archivado_en !== null || parentProject.archivado_en !== null))
  )
    fail('TAREA_NO_DISPONIBLE');
  const now = Date.parse(state.now);
  if (Date.parse(row.inicio_en) > now || (row.fin_en !== null && Date.parse(row.fin_en) > now))
    fail('INTERVALO_REAL_FUTURO');
  if (previous && previous.fin_en !== null && row.fin_en === null) fail('NO_REABRIR_PARTE');
  checkOverlap(state, row);
  if (
    row.fin_en === null &&
    state.snapshot.partes.some(
      (other) => other.id !== row.id && other.eliminado_en === null && other.fin_en === null,
    )
  )
    fail('CRONOMETRO_ACTIVO');
}

/** validar_arbol: nothing live under a deleted parent, no open timer under an archived one. */
function checkTree(state: State) {
  const projects = new Map(state.snapshot.proyectos.map((row) => [row.id, row]));
  const tasks = new Map(state.snapshot.tareas.map((row) => [row.id, row]));
  for (const row of state.snapshot.tareas)
    if (row.eliminado_en === null && projects.get(row.proyecto_id)?.eliminado_en !== null)
      fail('HIJOS_ACTIVOS_EN_PADRE_ELIMINADO_O_ARCHIVADO');
  for (const row of state.snapshot.partes) {
    if (row.eliminado_en !== null) continue;
    const parent = tasks.get(row.tarea_id);
    const grand = parent ? projects.get(parent.proyecto_id) : undefined;
    if (
      !parent ||
      !grand ||
      parent.eliminado_en !== null ||
      grand.eliminado_en !== null ||
      (row.fin_en === null && (parent.archivado_en !== null || grand.archivado_en !== null))
    )
      fail('HIJOS_ACTIVOS_EN_PADRE_ELIMINADO_O_ARCHIVADO');
  }
}

/** sincronizar_imputacion_odoo for the legacy `imputado_en_odoo` flag and moves. */
function syncImputation(state: State, row: LocalPart, previous: LocalPart | null, flag: boolean) {
  const create = () => {
    const imputation: LocalImputation = {
      id: state.context.newId(),
      usuario_id: state.context.userId,
      tarea_id: row.tarea_id,
      fecha: row.fecha,
      jornada_id: row.jornada_id,
      estado: 'manual',
      creado_en: state.now,
    };
    state.snapshot.imputaciones.push(imputation);
    row.imputacion_odoo_id = imputation.id;
  };
  if (flag && (!previous || !previous.imputado_en_odoo)) create();
  else if (!flag && previous?.imputado_en_odoo) row.imputacion_odoo_id = null;
  else if (
    previous &&
    row.imputacion_odoo_id !== null &&
    (row.tarea_id !== previous.tarea_id || row.fecha !== previous.fecha)
  )
    create();
  row.imputado_en_odoo = row.imputacion_odoo_id !== null;
}

/** limpiar_imputacion_odoo: an imputation no entry refers to (tombstones included) goes. */
function pruneImputations(state: State) {
  const used = new Set(state.snapshot.partes.map((row) => row.imputacion_odoo_id));
  state.snapshot.imputaciones = state.snapshot.imputaciones.filter((row) => used.has(row.id));
}

function liveTimer(state: State) {
  return state.snapshot.partes.find((row) => row.fin_en === null && row.eliminado_en === null);
}

const OPERATION_TTL_MS = 30 * 24 * 3600 * 1000;

function sameParameters(a: Payload, b: Payload) {
  return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
}
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, sortKeys(entry)]),
    );
  return value;
}

const asJson = (value: unknown) => clone(value) as Result;

// ---------------------------------------------------------------- actions

function createProject(state: State, payload: Payload): Result {
  const row: LocalProject = {
    id: state.context.newId(),
    usuario_id: state.context.userId,
    nombre: text(payload, 'nombre') ?? fail('DATOS_INVALIDOS'),
    descripcion: text(payload, 'descripcion'),
    cliente: text(payload, 'cliente'),
    presupuesto_minutos: integer(payload, 'presupuesto_minutos'),
    archivado_en: null,
    eliminado_en: null,
    creado_en: state.now,
    actualizado_en: state.now,
    version: 1,
  };
  checkProject(row);
  state.snapshot.proyectos.push(row);
  return asJson(row);
}

function editProject(state: State, payload: Payload): Result {
  const row = project(state, id(payload, 'id'));
  if (!row || row.eliminado_en !== null) return fail('PROYECTO_NO_DISPONIBLE');
  if (version(payload) !== row.version) fail('CONFLICTO_VERSION');
  if (has(payload, 'nombre')) row.nombre = text(payload, 'nombre') ?? fail('DATOS_INVALIDOS');
  if (has(payload, 'descripcion')) row.descripcion = text(payload, 'descripcion');
  if (has(payload, 'cliente')) row.cliente = text(payload, 'cliente');
  if (has(payload, 'presupuesto_minutos'))
    row.presupuesto_minutos = integer(payload, 'presupuesto_minutos');
  if (has(payload, 'archivado'))
    row.archivado_en = bool(payload, 'archivado') ? (row.archivado_en ?? state.now) : null;
  checkProject(row);
  bump(state, row);
  return asJson(row);
}

function createTask(state: State, payload: Payload): Result {
  const projectId = id(payload, 'proyecto_id');
  const row: LocalTask = {
    id: state.context.newId(),
    usuario_id: state.context.userId,
    proyecto_id: projectId ?? fail('PROYECTO_NO_DISPONIBLE'),
    titulo: text(payload, 'titulo') ?? fail('DATOS_INVALIDOS'),
    descripcion: text(payload, 'descripcion'),
    estado: (text(payload, 'estado') ?? 'pendiente') as LocalTask['estado'],
    estimacion_minutos: integer(payload, 'estimacion_minutos'),
    odoo_id: text(payload, 'odoo_id'),
    odoo_url: text(payload, 'odoo_url'),
    archivado_en: null,
    eliminado_en: null,
    creado_en: state.now,
    actualizado_en: state.now,
    version: 1,
  };
  checkTask(row);
  const parent = project(state, row.proyecto_id);
  if (!parent || parent.eliminado_en !== null || parent.archivado_en !== null)
    fail('PROYECTO_NO_DISPONIBLE');
  state.snapshot.tareas.push(row);
  return asJson(row);
}

function editTask(state: State, payload: Payload): Result {
  const row = task(state, id(payload, 'id'));
  if (!row || row.eliminado_en !== null) return fail('TAREA_NO_DISPONIBLE');
  if (version(payload) !== row.version) fail('CONFLICTO_VERSION');
  const previousProject = row.proyecto_id;
  if (has(payload, 'titulo')) row.titulo = text(payload, 'titulo') ?? fail('DATOS_INVALIDOS');
  if (has(payload, 'descripcion')) row.descripcion = text(payload, 'descripcion');
  if (has(payload, 'estado'))
    row.estado = (text(payload, 'estado') ?? fail('DATOS_INVALIDOS')) as LocalTask['estado'];
  if (has(payload, 'estimacion_minutos'))
    row.estimacion_minutos = integer(payload, 'estimacion_minutos');
  if (has(payload, 'proyecto_id'))
    row.proyecto_id = id(payload, 'proyecto_id') ?? fail('PROYECTO_NO_DISPONIBLE');
  if (has(payload, 'odoo_id')) row.odoo_id = text(payload, 'odoo_id');
  if (has(payload, 'odoo_url')) row.odoo_url = text(payload, 'odoo_url');
  if (has(payload, 'archivado'))
    row.archivado_en = bool(payload, 'archivado') ? (row.archivado_en ?? state.now) : null;
  checkTask(row);
  const parent = project(state, row.proyecto_id);
  if (!parent) return fail('MOVER_ENTRE_ALMACENES');
  if (
    parent.eliminado_en !== null ||
    (parent.archivado_en !== null && row.proyecto_id !== previousProject)
  )
    fail('PROYECTO_NO_DISPONIBLE');
  bump(state, row);
  return asJson(row);
}

function createPart(state: State, payload: Payload): Result {
  const start = instant(payload, 'inicio_en');
  const finish = instant(payload, 'fin_en');
  if (!start || !finish) return fail('INTERVALO_COMPLETO_REQUERIDO');
  if (has(payload, 'imputado_en_odoo') && typeof payload.imputado_en_odoo !== 'boolean')
    fail('IMPUTACION_ODOO_INVALIDA');
  const place = placeEntry(state, iso(start));
  const row: LocalPart = {
    id: state.context.newId(),
    usuario_id: state.context.userId,
    tarea_id: id(payload, 'tarea_id') ?? fail('TAREA_NO_DISPONIBLE'),
    jornada_id: place.id,
    fecha: place.fecha,
    zona_horaria: place.zona_horaria,
    inicio_en: iso(start),
    fin_en: iso(finish),
    intervalo_redondeo_minutos: state.context.profile.intervalo_redondeo_minutos,
    modo_redondeo: 'superior',
    descripcion: text(payload, 'descripcion'),
    imputado_en_odoo: false,
    imputacion_odoo_id: null,
    eliminado_en: null,
    creado_en: state.now,
    actualizado_en: state.now,
    version: 1,
  };
  checkPart(state, row, null);
  syncImputation(state, row, null, bool(payload, 'imputado_en_odoo') ?? false);
  state.snapshot.partes.push(row);
  return asJson(row);
}

function editPart(state: State, payload: Payload): Result {
  if (has(payload, 'imputado_en_odoo') && typeof payload.imputado_en_odoo !== 'boolean')
    fail('IMPUTACION_ODOO_INVALIDA');
  const row = part(state, id(payload, 'id'));
  if (!row || row.eliminado_en !== null) return fail('PARTE_NO_DISPONIBLE');
  if (version(payload) !== row.version) fail('CONFLICTO_VERSION');
  const previous = clone(row);
  if (has(payload, 'inicio_en'))
    row.inicio_en = iso(instant(payload, 'inicio_en') ?? fail('DATOS_INVALIDOS'));
  if (has(payload, 'fin_en') || payload.fin_en === null) {
    const finish = instant(payload, 'fin_en');
    row.fin_en = finish === null ? null : iso(finish);
  }
  // The day follows the start, in the zone of the entry's current workday.
  const zone = row.zona_horaria;
  const fecha = dayIn(row.inicio_en, zone);
  if (fecha !== row.fecha) {
    const day = workday(state, fecha, zone);
    if (day.zona_horaria !== zone && text(payload, 'confirmar_zona') !== day.zona_horaria)
      fail(`CONFIRMAR_CAMBIO_ZONA:${day.zona_horaria}`);
    row.fecha = fecha;
    row.jornada_id = day.id;
    row.zona_horaria = day.zona_horaria;
  }
  if (has(payload, 'tarea_id')) {
    row.tarea_id = id(payload, 'tarea_id') ?? fail('TAREA_NO_DISPONIBLE');
    if (!task(state, row.tarea_id)) fail('MOVER_ENTRE_ALMACENES');
  }
  if (has(payload, 'descripcion')) row.descripcion = text(payload, 'descripcion');
  checkPart(state, row, previous);
  syncImputation(
    state,
    row,
    previous,
    has(payload, 'imputado_en_odoo')
      ? payload.imputado_en_odoo === true
      : previous.imputado_en_odoo,
  );
  bump(state, row);
  pruneImputations(state);
  return asJson(row);
}

function remove(state: State, action: LocalAction, payload: Payload): Result {
  const entity = id(payload, 'id');
  const expected = version(payload);
  const discard = bool(payload, 'descartar_activo') ?? false;
  if (action === 'eliminar_proyecto') {
    const row = project(state, entity);
    if (!row) return fail('PROYECTO_NO_DISPONIBLE');
    if (row.eliminado_en !== null) return asJson(row);
    if (expected !== row.version) fail('CONFLICTO_VERSION');
  } else if (action === 'eliminar_tarea') {
    const row = task(state, entity);
    if (!row) return fail('TAREA_NO_DISPONIBLE');
    if (row.eliminado_en !== null) return asJson(row);
    if (expected !== row.version) fail('CONFLICTO_VERSION');
  } else {
    const row = part(state, entity);
    if (!row) return fail('PARTE_NO_DISPONIBLE');
    if (row.eliminado_en !== null) return asJson(row);
    if (expected !== row.version) fail('CONFLICTO_VERSION');
  }
  if (action !== 'eliminar_parte' && !(bool(payload, 'confirmar_cascada') ?? false))
    fail('CONFIRMACION_CASCADA_REQUERIDA');
  const taskIds = new Set(
    action === 'eliminar_tarea'
      ? [entity]
      : action === 'eliminar_proyecto'
        ? state.snapshot.tareas.filter((row) => row.proyecto_id === entity).map((row) => row.id)
        : [],
  );
  const affected = (row: LocalPart) =>
    action === 'eliminar_parte' ? row.id === entity : taskIds.has(row.tarea_id);
  if (
    !discard &&
    state.snapshot.partes.some(
      (row) => row.fin_en === null && row.eliminado_en === null && affected(row),
    )
  )
    fail('DETENER_O_DESCARTAR_ACTIVO');
  // Each soft delete is an update (validar_fila): the version moves once, then the row is final.
  const tombstone = <
    T extends { eliminado_en: string | null; version: number; actualizado_en: string },
  >(
    row: T,
  ) => {
    row.eliminado_en = state.now;
    bump(state, row);
  };
  for (const row of state.snapshot.partes)
    if (row.eliminado_en === null && affected(row)) tombstone(row);
  if (action === 'eliminar_parte') return asJson(part(state, entity));
  for (const row of state.snapshot.tareas)
    if (row.eliminado_en === null && taskIds.has(row.id)) tombstone(row);
  if (action === 'eliminar_tarea') return asJson(task(state, entity));
  const row = project(state, entity)!;
  tombstone(row);
  return asJson(row);
}

function start(state: State, payload: Payload): Result {
  const running = liveTimer(state);
  const cloudRunning = state.context.cloudEntries.find((row) => row.fin_en === null);
  if (running) return { ok: false, codigo: 'CRONOMETRO_ACTIVO', parte: asJson(running) };
  if (cloudRunning) return { ok: false, codigo: 'CRONOMETRO_ACTIVO', parte: asJson(cloudRunning) };
  const begin = has(payload, 'inicio_en')
    ? (zonedInstant(payload, 'inicio_en') ?? fail('ENTRADA_REQUERIDA'))
    : new Date(state.now);
  if (begin.getTime() > Date.parse(state.now)) fail('INTERVALO_REAL_FUTURO');
  const place = placeEntry(state, iso(begin));
  const row: LocalPart = {
    id: state.context.newId(),
    usuario_id: state.context.userId,
    tarea_id: id(payload, 'tarea_id') ?? fail('TAREA_NO_DISPONIBLE'),
    jornada_id: place.id,
    fecha: place.fecha,
    zona_horaria: place.zona_horaria,
    inicio_en: iso(begin),
    fin_en: null,
    intervalo_redondeo_minutos: state.context.profile.intervalo_redondeo_minutos,
    modo_redondeo: 'superior',
    descripcion: text(payload, 'descripcion'),
    imputado_en_odoo: false,
    imputacion_odoo_id: null,
    eliminado_en: null,
    creado_en: state.now,
    actualizado_en: state.now,
    version: 1,
  };
  checkPart(state, row, null);
  state.snapshot.partes.push(row);
  return { ok: true, parte: asJson(row), hora_servidor: state.now };
}

function stop(state: State, payload: Payload): Result {
  const row = part(state, id(payload, 'parte_id'));
  if (!row) return fail('PARTE_NO_DISPONIBLE');
  if (row.eliminado_en !== null)
    return { ok: false, codigo: 'PARTE_ELIMINADO', parte: asJson(row) };
  if (row.fin_en === null) {
    const previous = clone(row);
    row.fin_en = iso(new Date(Math.max(Date.parse(state.now), Date.parse(row.inicio_en) + 1)));
    checkPart(state, row, previous);
    bump(state, row);
  }
  return { ok: true, parte: asJson(row), hora_servidor: state.now };
}

/** iniciar/detener are idempotent by operacion_id. */
function timer(state: State, action: 'iniciar' | 'detener', payload: Payload): Result {
  const operation = id(payload, 'operacion_id');
  if (!operation) return fail('OPERACION_ID_REQUERIDO');
  const known = state.snapshot.operaciones[operation];
  if (known) {
    if (known.tipo !== action || !sameParameters(known.parametros, payload))
      fail('OPERACION_ID_REUTILIZADO');
    return clone(known.resultado);
  }
  const result = action === 'iniciar' ? start(state, payload) : stop(state, payload);
  const resultPart = result.parte as { id?: string } | undefined;
  state.snapshot.operaciones[operation] = {
    tipo: action,
    parametros: clone(payload),
    parte_id: typeof resultPart?.id === 'string' ? resultPart.id : null,
    resultado: clone(result),
    creado_en: state.now,
  };
  return result;
}

function impute(state: State, payload: Payload): Result {
  const list = payload.partes;
  if (!Array.isArray(list) || list.length < 1 || list.length > 1000)
    return fail('IMPUTACION_DATOS_INVALIDOS');
  const requested = list.map((entry) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      Array.isArray(entry) ||
      typeof entry.id !== 'string' ||
      !uuid.test(entry.id) ||
      typeof entry.version !== 'number' ||
      !Number.isSafeInteger(entry.version) ||
      entry.version < 1
    )
      return fail('IMPUTACION_DATOS_INVALIDOS');
    return { id: entry.id.toLowerCase(), version: entry.version };
  });
  if (new Set(requested.map((entry) => entry.id)).size !== requested.length)
    fail('IMPUTACION_DATOS_INVALIDOS');
  const rows = requested.map((entry) => part(state, entry.id));
  if (rows.some((row) => !row || row.eliminado_en !== null)) fail('PARTE_NO_DISPONIBLE');
  const parts = rows as LocalPart[];
  if (requested.some((entry, index) => parts[index]!.version !== entry.version))
    fail('CONFLICTO_VERSION');
  if (parts.some((row) => row.fin_en === null)) fail('PARTE_EN_CURSO');
  if (parts.some((row) => row.imputacion_odoo_id !== null)) fail('PARTE_YA_IMPUTADO');
  if (new Set(parts.map((row) => `${row.tarea_id}|${row.fecha}`)).size !== 1)
    fail('PARTES_DE_DISTINTO_GRUPO');
  const first = parts[0]!;
  const imputation: LocalImputation = {
    id: state.context.newId(),
    usuario_id: state.context.userId,
    tarea_id: first.tarea_id,
    fecha: first.fecha,
    jornada_id: first.jornada_id,
    estado: 'manual',
    creado_en: state.now,
  };
  state.snapshot.imputaciones.push(imputation);
  for (const row of parts) {
    row.imputacion_odoo_id = imputation.id;
    row.imputado_en_odoo = true;
    bump(state, row);
  }
  const ordered = [...parts].sort(
    (a, b) => a.inicio_en.localeCompare(b.inicio_en) || a.id.localeCompare(b.id),
  );
  return {
    id: imputation.id,
    tarea_id: imputation.tarea_id,
    jornada_id: imputation.jornada_id,
    estado: imputation.estado,
    partes: ordered.map((row) => ({
      id: row.id,
      version: row.version,
      imputacion_odoo_id: row.imputacion_odoo_id,
      imputado_en_odoo: row.imputado_en_odoo,
    })),
  };
}

function undoImputation(state: State, payload: Payload): Result {
  const value = payload.id;
  if (typeof value !== 'string' || !uuid.test(value)) return fail('IMPUTACION_DATOS_INVALIDOS');
  const imputation = state.snapshot.imputaciones.find((row) => row.id === value.toLowerCase());
  if (!imputation) return fail('IMPUTACION_NO_DISPONIBLE');
  // Tombstones keep their reference; the imputation goes once nothing refers to it.
  const freed = state.snapshot.partes
    .filter((row) => row.imputacion_odoo_id === imputation.id && row.eliminado_en === null)
    .sort((a, b) => a.inicio_en.localeCompare(b.inicio_en) || a.id.localeCompare(b.id));
  for (const row of freed) {
    row.imputacion_odoo_id = null;
    row.imputado_en_odoo = false;
    bump(state, row);
  }
  pruneImputations(state);
  return {
    id: imputation.id,
    partes: freed.map((row) => ({
      id: row.id,
      version: row.version,
      imputacion_odoo_id: null,
      imputado_en_odoo: false,
    })),
  };
}

function lookupOperation(state: State, payload: Payload): Result {
  const operation = id(payload, 'operacion_id');
  const known = operation ? state.snapshot.operaciones[operation] : undefined;
  if (!known) return { encontrada: false, hora_servidor: state.now };
  const current = known.parte_id ? part(state, known.parte_id) : undefined;
  return {
    encontrada: true,
    resultado: clone(known.resultado),
    parte_actual: current ? asJson(current) : null,
    hora_servidor: state.now,
  };
}

/** True when the action does not change the snapshot. */
export const isReadOnly = (action: LocalAction) =>
  action === 'consultar_operacion' || action === 'consultar_cronometro';

/**
 * Runs one command on a copy of `snapshot`. Throws LocalCommandError with the same
 * codes as Supabase; the input is never modified.
 */
export function runLocalCommand(
  snapshot: LocalSnapshot,
  action: LocalAction,
  payload: Payload,
  context: EngineContext,
): { snapshot: LocalSnapshot; result: Result } {
  if (snapshot.usuario_id !== context.userId) fail('SESION_REQUERIDA');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('DATOS_INVALIDOS');
  const state: State = { snapshot: clone(snapshot), context, now: iso(context.now) };
  let result: Result;
  switch (action) {
    case 'crear_proyecto':
      result = createProject(state, payload);
      break;
    case 'editar_proyecto':
      result = editProject(state, payload);
      break;
    case 'crear_tarea':
      result = createTask(state, payload);
      break;
    case 'editar_tarea':
      result = editTask(state, payload);
      break;
    case 'crear_parte':
      result = createPart(state, payload);
      break;
    case 'editar_parte':
      result = editPart(state, payload);
      break;
    case 'eliminar_proyecto':
    case 'eliminar_tarea':
    case 'eliminar_parte':
      result = remove(state, action, payload);
      break;
    case 'iniciar':
    case 'detener':
      result = timer(state, action, payload);
      break;
    case 'consultar_operacion':
      return { snapshot, result: lookupOperation(state, payload) };
    case 'consultar_cronometro': {
      const running = liveTimer(state);
      return {
        snapshot,
        result: { parte: running ? asJson(running) : null, hora_servidor: state.now },
      };
    }
    case 'imputar_partes':
      result = impute(state, payload);
      break;
    case 'deshacer_imputacion':
      result = undoImputation(state, payload);
      break;
  }
  checkTree(state);
  // Timer idempotency records are kept for 30 days.
  const cutoff = Date.parse(state.now) - OPERATION_TTL_MS;
  for (const [key, operation] of Object.entries(state.snapshot.operaciones))
    if (Date.parse(operation.creado_en) < cutoff) delete state.snapshot.operaciones[key];
  state.snapshot.meta = {
    ...state.snapshot.meta,
    actualizado_en: state.now,
    cambios_desde_copia: true,
  };
  return { snapshot: state.snapshot, result };
}
