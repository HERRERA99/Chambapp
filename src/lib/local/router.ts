// Sends each command to the store that holds its data: the browser (local) or
// Supabase (cloud). Projects are created where the user's preference says; tasks
// and entries follow their project. The two stores share one timeline: one open
// timer and no overlapping entries across both.
import { DataError, readableError } from '../supabase/errors.ts';
import type { CommandAction, Json } from '../../domain/models.ts';
import { isLocalAction, isReadOnly, runLocalCommand } from './engine.ts';
import type { CloudInterval, EngineContext, LocalAction } from './engine.ts';
import { LocalCommandError } from './types.ts';
import type { LocalSnapshot } from './types.ts';

type Payload = { [key: string]: Json | undefined };

import type { StorageMode } from './preferences.ts';
export type { StorageMode };
/**
 * - sin-clave: the vault key is not in this tab and this browser has no local data.
 * - bloqueado: there is local data but the key is not in this tab.
 * - sin-datos: the key is here and there is no local data yet.
 * - abierto: the key is here and the data is loaded.
 * - error: the data cannot be read (another vault generation).
 * - no-disponible: the browser has no usable IndexedDB.
 */
export type LocalState =
  'sin-clave' | 'bloqueado' | 'sin-datos' | 'abierto' | 'error' | 'no-disponible';

/** What the router knows about the cloud data (from the last workspace load). */
export type CloudView = {
  projectIds: ReadonlySet<string>;
  taskIds: ReadonlySet<string>;
  /** Live cloud entries with their task and interval. */
  entries: readonly (CloudInterval & { tarea_id: string })[];
  imputationIds: ReadonlySet<string>;
  jornadas: EngineContext['cloudJornadas'];
};

export type LocalAccess = {
  state: LocalState;
  /** Current snapshot while the data is open. */
  snapshot: LocalSnapshot | null;
  /** Stores a change (see LocalStore.mutate); only while open or with no data yet. */
  mutate: <T>(
    change: (snapshot: LocalSnapshot) => { snapshot: LocalSnapshot; result: T },
  ) => Promise<T>;
};

export type RouterDeps = {
  userId: string;
  cloud: (action: CommandAction, payload: Payload) => Promise<unknown>;
  local: () => LocalAccess;
  cloudView: () => CloudView;
  mode: () => StorageMode;
  profile: () => EngineContext['profile'];
  now?: () => Date;
  newId?: () => string;
};

/** Closed or busy local data is temporary: callers keep pending intents and retry. */
const RETRYABLE = new Set(['DATOS_LOCALES_BLOQUEADOS', 'DATOS_LOCALES_OCUPADOS']);
const toDataError = (code: string) =>
  new DataError(readableError(code), RETRYABLE.has(code), code, code);

const text = (value: Json | undefined) => (typeof value === 'string' ? value : null);

function localIds(snapshot: LocalSnapshot | null) {
  return {
    projects: new Set(snapshot?.proyectos.map((row) => row.id)),
    tasks: new Set(snapshot?.tareas.map((row) => row.id)),
    parts: new Set(snapshot?.partes.map((row) => row.id)),
    imputations: new Set(snapshot?.imputaciones.map((row) => row.id)),
    operations: new Set(Object.keys(snapshot?.operaciones ?? {})),
  };
}

type Target = 'local' | 'nube';

export function createCommandRouter(deps: RouterDeps) {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());

  /** Where an id lives: the cloud if it knows it, else local (locked data counts as local). */
  function placeOf(
    id: string | null,
    cloudSet: ReadonlySet<string>,
    localSet: ReadonlySet<string>,
    access: LocalAccess,
  ): Target {
    if (!id || cloudSet.has(id)) return 'nube';
    if (localSet.has(id)) return 'local';
    // Unknown here: if the local data is closed it may be there, so do not guess.
    if (access.state === 'bloqueado' || access.state === 'error') return 'local';
    return 'nube';
  }

  function targetOf(action: LocalAction, payload: Payload, access: LocalAccess): Target {
    const cloud = deps.cloudView();
    const local = localIds(access.snapshot);
    const cloudParts = new Set(cloud.entries.map((row) => row.id));
    switch (action) {
      case 'crear_proyecto': {
        const destination = text(payload.destino);
        return destination === 'local' || destination === 'nube' ? destination : deps.mode();
      }
      case 'editar_proyecto':
      case 'eliminar_proyecto':
        return placeOf(text(payload.id), cloud.projectIds, local.projects, access);
      case 'crear_tarea':
        return placeOf(text(payload.proyecto_id), cloud.projectIds, local.projects, access);
      case 'editar_tarea':
      case 'eliminar_tarea':
        return placeOf(text(payload.id), cloud.taskIds, local.tasks, access);
      case 'crear_parte':
      case 'iniciar':
        return placeOf(text(payload.tarea_id), cloud.taskIds, local.tasks, access);
      case 'editar_parte':
      case 'eliminar_parte':
        return placeOf(text(payload.id), cloudParts, local.parts, access);
      case 'detener':
        return placeOf(text(payload.parte_id), cloudParts, local.parts, access);
      case 'imputar_partes': {
        const ids = Array.isArray(payload.partes)
          ? payload.partes.map((part) =>
              part && typeof part === 'object' && !Array.isArray(part) ? text(part.id) : null,
            )
          : [];
        const places = new Set(ids.map((id) => placeOf(id, cloudParts, local.parts, access)));
        if (places.size > 1) throw toDataError('PARTES_DE_DISTINTO_GRUPO');
        return places.has('local') ? 'local' : 'nube';
      }
      case 'deshacer_imputacion':
        return placeOf(text(payload.id), cloud.imputationIds, local.imputations, access);
      case 'consultar_operacion':
        return local.operations.has(text(payload.operacion_id) ?? '') ? 'local' : 'nube';
      case 'consultar_cronometro':
        return 'nube';
    }
  }

  function engineContext(): EngineContext {
    const cloud = deps.cloudView();
    return {
      userId: deps.userId,
      now: now(),
      profile: deps.profile(),
      cloudJornadas: cloud.jornadas,
      cloudEntries: cloud.entries,
      newId,
    };
  }

  async function runLocal(action: LocalAction, payload: Payload, access: LocalAccess) {
    if (access.state === 'bloqueado' || access.state === 'sin-clave')
      throw toDataError('DATOS_LOCALES_BLOQUEADOS');
    if (access.state === 'error') throw toDataError('DATOS_LOCALES_ILEGIBLES');
    if (access.state === 'no-disponible') throw toDataError('DATOS_LOCALES_NO_DISPONIBLES');
    const { destino: _destination, ...clean } = payload;
    void _destination;
    try {
      if (isReadOnly(action) && access.snapshot)
        return runLocalCommand(access.snapshot, action, clean, engineContext()).result;
      return await access.mutate((snapshot) =>
        runLocalCommand(snapshot, action, clean, engineContext()),
      );
    } catch (cause) {
      if (cause instanceof LocalCommandError) throw toDataError(cause.code);
      throw cause;
    }
  }

  /** Interval a cloud write would give an entry, to check it against local entries. */
  function cloudInterval(action: LocalAction, payload: Payload) {
    if (action === 'crear_parte')
      return { id: '', inicio_en: text(payload.inicio_en), fin_en: text(payload.fin_en) };
    if (action === 'iniciar')
      return { id: '', inicio_en: text(payload.inicio_en) ?? now().toISOString(), fin_en: null };
    if (action === 'editar_parte') {
      const current = deps.cloudView().entries.find((row) => row.id === payload.id);
      if (!current) return null;
      return {
        id: current.id,
        inicio_en: payload.inicio_en === undefined ? current.inicio_en : text(payload.inicio_en),
        fin_en: payload.fin_en === undefined ? current.fin_en : text(payload.fin_en),
      };
    }
    return null;
  }

  /** The shared timeline: a cloud write may not overlap a local entry or start a second timer. */
  function checkAgainstLocal(
    action: LocalAction,
    payload: Payload,
    snapshot: LocalSnapshot | null,
  ) {
    if (!snapshot) return null;
    const live = snapshot.partes.filter((row) => row.eliminado_en === null);
    const open = live.find((row) => row.fin_en === null);
    if (action === 'iniciar' && open)
      return { ok: false, codigo: 'CRONOMETRO_ACTIVO', parte: structuredClone(open) } as Payload;
    const interval = cloudInterval(action, payload);
    if (!interval?.inicio_en) return null;
    const start = Date.parse(interval.inicio_en);
    const end = interval.fin_en === null ? Infinity : Date.parse(interval.fin_en);
    if (!Number.isFinite(start)) return null;
    const overlaps = live.some((row) => {
      const rowEnd = row.fin_en === null ? Infinity : Date.parse(row.fin_en);
      return start < rowEnd && Date.parse(row.inicio_en) < end;
    });
    if (overlaps) throw toDataError('PARTES_SOLAPADOS');
    return null;
  }

  return async function route(action: CommandAction, payload: Payload = {}): Promise<unknown> {
    if (!isLocalAction(action)) return deps.cloud(action, payload);
    const access = deps.local();
    if (action === 'consultar_cronometro') {
      const cloud = (await deps.cloud(action, payload)) as Payload;
      const open = access.snapshot?.partes.find(
        (row) => row.fin_en === null && row.eliminado_en === null,
      );
      return cloud.parte === null && open ? { ...cloud, parte: structuredClone(open) } : cloud;
    }
    const target = targetOf(action, payload, access);
    if (target === 'local') return runLocal(action, payload, access);
    const blocked = checkAgainstLocal(action, payload, access.snapshot);
    if (blocked) return blocked;
    const { destino: _destination, ...clean } = payload;
    void _destination;
    return deps.cloud(action, clean);
  };
}

export type CommandRoute = ReturnType<typeof createCommandRouter>;
