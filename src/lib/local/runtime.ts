// The local data of the signed-in account in this tab. Holds the vault data key in
// memory from the first unlock until sign-out, "Bloquear todo" or a vault change
// (the vault's own idle lock does not close the local data), loads and stores the
// snapshot, tells other tabs about changes and routes commands (see router.ts).
import type { CommandAction, Json, Profile, TimeEntry, WorkspaceData } from '../../domain/models';
import { estimateServerTime } from '../../domain/attendance';
import { DataError, readableError } from '../supabase/errors';
import { entriesView } from './engine';
import { createCommandRouter } from './router';
import type { CloudView, LocalAccess, LocalState } from './router';
import { indexedDbStorage, LocalStore, requestPersistence } from './store';
import type { SnapshotStorage } from './store';
import { LocalCommandError } from './types';
import { backupReminderDays as reminderOf, storageMode as modeOf } from './preferences';
import type { LocalSnapshot } from './types';

type Payload = { [key: string]: Json | undefined };
type CloudCommand = (
  action: CommandAction,
  payload: Payload,
  signal?: AbortSignal,
  expectedUserId?: string,
) => Promise<unknown>;

export type LocalSummary = {
  estado: LocalState;
  proyectos: number;
  tareas: number;
  partes: number;
  actualizadoEn: string | null;
  ultimaCopiaEn: string | null;
  cambiosDesdeCopia: boolean;
  persistente: boolean | null;
  /** Projects half-way through a move between the stores. */
  traspasosPendientes: number;
};

type Session = { userId: string; key: CryptoKey; generation: string };

const emptyView: CloudView = {
  projectIds: new Set(),
  taskIds: new Set(),
  entries: [],
  imputationIds: new Set(),
  jornadas: [],
};

const listeners = new Set<() => void>();
let storage: SnapshotStorage | null = null;
let session: Session | null = null;
let store: LocalStore | null = null;
let snapshot: LocalSnapshot | null = null;
let state: LocalState = 'sin-clave';
let currentUser: string | null = null;
let cloudView: CloudView = emptyView;
let profile: Pick<Profile, 'zona_horaria' | 'intervalo_redondeo_minutos' | 'preferencias'> | null =
  null;
let clock: { serverTime: string; receivedAt: number } | null = null;
let persistent: boolean | null = null;
let channel: BroadcastChannel | null = null;
let cloudCommand: CloudCommand | null = null;

function notify() {
  for (const listener of listeners) listener();
}

function getStorage() {
  storage ??= indexedDbStorage();
  return storage;
}

/** For tests and tools: use another storage (memory) instead of IndexedDB. */
export function useLocalStorageBackend(backend: SnapshotStorage) {
  storage = backend;
}

function openChannel() {
  if (channel || typeof BroadcastChannel === 'undefined') return;
  channel = new BroadcastChannel('chambapp-local');
  channel.onmessage = (event: MessageEvent<{ userId?: string }>) => {
    if (event.data?.userId && event.data.userId === currentUser) void reload();
  };
}

function announce() {
  try {
    channel?.postMessage({ userId: currentUser });
  } catch {
    // Other tabs refresh on their next load anyway.
  }
}

/** Loads the snapshot (or the record's presence when the key is missing). */
async function reload() {
  if (!currentUser) return;
  try {
    if (!session || session.userId !== currentUser) {
      snapshot = null;
      state = (await getStorage().read(currentUser)) ? 'bloqueado' : 'sin-clave';
    } else {
      const loaded = await store!.load();
      snapshot = loaded?.snapshot ?? null;
      state = loaded ? 'abierto' : 'sin-datos';
    }
  } catch (cause) {
    snapshot = null;
    state =
      cause instanceof LocalCommandError && cause.code === 'DATOS_LOCALES_NO_DISPONIBLES'
        ? 'no-disponible'
        : 'error';
  }
  notify();
}

/** The account shown in this tab; another account's key is dropped. */
export async function setLocalUser(userId: string | null) {
  if (userId === currentUser) return;
  currentUser = userId;
  if (session && session.userId !== userId) closeLocalData();
  snapshot = null;
  state = 'sin-clave';
  cloudView = emptyView;
  profile = null;
  lastCloud = null;
  if (userId) {
    openChannel();
    await reload();
  } else notify();
}

/** Called when the vault is unlocked or created in this tab. */
export async function provideLocalKey(userId: string, key: CryptoKey, generation: string) {
  if (userId !== currentUser) return;
  if (session?.key === key && session.generation === generation) return;
  session = { userId, key, generation };
  store = new LocalStore(getStorage(), userId, key, generation);
  await reload();
}

/** The vault was reset or replaced: the old key cannot read anything new. */
export function onVaultGeneration(generation: string | null) {
  if (session && session.generation !== generation) {
    closeLocalData();
    void reload();
  }
}

/** "Bloquear todo", sign-out: forgets the key in this tab. */
export function closeLocalData() {
  session = null;
  store = null;
  snapshot = null;
  if (state === 'abierto' || state === 'sin-datos') state = 'bloqueado';
  notify();
}

export function subscribeLocal(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const localState = () => state;
export const localSnapshot = () => snapshot;
export const hasLocalKey = () => !!session && session.userId === currentUser;

function now() {
  return clock
    ? new Date(estimateServerTime(clock.serverTime, clock.receivedAt, Date.now()))
    : new Date();
}

/** Stores a change to the snapshot and tells the other tabs. */
export async function mutateLocal<T>(
  change: (current: LocalSnapshot) => { snapshot: LocalSnapshot; result: T },
): Promise<T> {
  if (!store || !session || session.userId !== currentUser)
    throw new DataError(
      readableError('DATOS_LOCALES_BLOQUEADOS'),
      true,
      'DATOS_LOCALES_BLOQUEADOS',
    );
  const result = await store.mutate(change);
  const loaded = await store.load();
  snapshot = loaded?.snapshot ?? null;
  state = loaded ? 'abierto' : 'sin-datos';
  if (persistent === null && snapshot) persistent = await requestPersistence();
  announce();
  notify();
  return result;
}

/** Removes this account's local data from this browser. */
export async function destroyLocalData() {
  if (!currentUser) return;
  if (store) await store.destroy();
  else await getStorage().remove(currentUser);
  snapshot = null;
  state = session ? 'sin-datos' : 'sin-clave';
  announce();
  notify();
}

export async function askPersistence() {
  persistent = await requestPersistence();
  notify();
  return persistent;
}

function access(): LocalAccess {
  return { state, snapshot, mutate: mutateLocal };
}

/** Cloud data the router needs, refreshed on every workspace load. */
function noteCloud(data: WorkspaceData) {
  cloudView = {
    projectIds: new Set(data.projects.map((row) => row.id)),
    taskIds: new Set(data.tasks.map((row) => row.id)),
    entries: data.entries.map((row) => ({
      id: row.id,
      tarea_id: row.tarea_id,
      inicio_en: row.inicio_en,
      fin_en: row.fin_en,
    })),
    imputationIds: new Set(
      data.entries.flatMap((row) => (row.imputacion_odoo_id ? [row.imputacion_odoo_id] : [])),
    ),
    jornadas: data.jornadas.map((row) => ({
      id: row.id,
      fecha: row.fecha,
      zona_horaria: row.zona_horaria,
    })),
  };
  profile = data.profile;
  clock = { serverTime: data.serverTime, receivedAt: data.receivedAt };
}

export const storageMode = (source: Parameters<typeof modeOf>[0] = profile) => modeOf(source);
export const backupReminderDays = (source: Parameters<typeof reminderOf>[0] = profile) =>
  reminderOf(source);

export function registerCloudCommand(command: CloudCommand) {
  cloudCommand = command;
}

/** Runs a command on the store that holds its data (see router.ts). */
export function routeCommand(
  action: CommandAction,
  payload: Payload,
  signal?: AbortSignal,
  expectedUserId?: string,
) {
  if (!cloudCommand) throw new Error('El acceso a Supabase no está preparado.');
  const cloud = cloudCommand;
  if (expectedUserId && currentUser && expectedUserId !== currentUser)
    throw new DataError(
      'La sesión ha cambiado. Vuelve a acceder a tu cuenta para confirmar los cambios pendientes.',
      true,
      'SESION_CAMBIADA',
    );
  const route = createCommandRouter({
    userId: currentUser ?? expectedUserId ?? '',
    cloud: (cloudAction, cloudPayload) => cloud(cloudAction, cloudPayload, signal, expectedUserId),
    local: access,
    cloudView: () => cloudView,
    mode: () => storageMode(),
    profile: () => ({
      zona_horaria: profile?.zona_horaria ?? 'Europe/Madrid',
      intervalo_redondeo_minutos: profile?.intervalo_redondeo_minutos ?? 15,
    }),
    now,
  });
  return route(action, payload);
}

/**
 * Which copy to show when a project is half-way through a move and exists in both
 * stores: moving to local and copied → local; anything else → the cloud copy.
 */
function duplicates(cloud: WorkspaceData, current: LocalSnapshot | null) {
  const cloudIds = new Set(cloud.projects.map((row) => row.id));
  const toLocal = new Set(
    (current?.traspasos ?? [])
      .filter((move) => move.direccion === 'a-local' && move.estado === 'copiado')
      .map((move) => move.proyecto_id),
  );
  const hideCloud = new Set([...toLocal].filter((id) => cloudIds.has(id)));
  const hideLocal = new Set(
    (current?.proyectos ?? [])
      .map((row) => row.id)
      .filter((id) => cloudIds.has(id) && !toLocal.has(id)),
  );
  return { hideCloud, hideLocal };
}

const byCreation = (a: { creado_en: string; id: string }, b: { creado_en: string; id: string }) =>
  b.creado_en.localeCompare(a.creado_en) || a.id.localeCompare(b.id);
const byStart = (a: TimeEntry, b: TimeEntry) =>
  b.inicio_en.localeCompare(a.inicio_en) || a.id.localeCompare(b.id);

let lastCloud: WorkspaceData | null = null;

/** The cloud workspace plus the local projects, tasks and entries, each marked with its store. */
export function combine(cloud: WorkspaceData): WorkspaceData {
  const current = snapshot;
  const { hideCloud, hideLocal } = duplicates(cloud, current);
  const hiddenCloudTasks = new Set(
    cloud.tasks.filter((row) => hideCloud.has(row.proyecto_id)).map((row) => row.id),
  );
  const projects = [
    ...cloud.projects
      .filter((row) => !hideCloud.has(row.id))
      .map((row) => ({ ...row, origen: 'nube' as const })),
    ...(current?.proyectos ?? [])
      .filter((row) => row.eliminado_en === null && !hideLocal.has(row.id))
      .map((row) => ({ ...row, origen: 'local' as const })),
  ].sort(byCreation);
  const localTasks = (current?.tareas ?? []).filter(
    (row) => row.eliminado_en === null && !hideLocal.has(row.proyecto_id),
  );
  const tasks = [
    ...cloud.tasks
      .filter((row) => !hiddenCloudTasks.has(row.id))
      .map((row) => ({ ...row, origen: 'nube' as const })),
    ...localTasks.map((row) => ({ ...row, origen: 'local' as const })),
  ].sort(byCreation);
  const localTaskIds = new Set(localTasks.map((row) => row.id));
  const entries = [
    ...cloud.entries
      .filter((row) => !hiddenCloudTasks.has(row.tarea_id))
      .map((row) => ({ ...row, origen: 'nube' as const })),
    ...(current ? entriesView(current) : [])
      .filter((row) => localTaskIds.has(row.tarea_id))
      .map((row) => ({ ...row, origen: 'local' as const })),
  ].sort(byStart);
  return { ...cloud, projects, tasks, entries, local: localSummary() };
}

/** Called by loadWorkspace with the freshly loaded cloud data. */
export async function mergeLocal(cloud: WorkspaceData, userId: string): Promise<WorkspaceData> {
  if (currentUser !== userId) await setLocalUser(userId);
  noteCloud(cloud);
  lastCloud = cloud;
  return combine(cloud);
}

/** The combined data again after a local change, without reloading the cloud. */
export function recombine(userId: string): WorkspaceData | null {
  return lastCloud && lastCloud.profile.id === userId && currentUser === userId
    ? combine(lastCloud)
    : null;
}

/** Cloud-only data of the last load (for moving a project to local). */
export const lastCloudData = () => lastCloud;

export function localSummary(): LocalSummary {
  return {
    estado: state,
    proyectos: snapshot?.proyectos.filter((row) => row.eliminado_en === null).length ?? 0,
    tareas: snapshot?.tareas.filter((row) => row.eliminado_en === null).length ?? 0,
    partes: snapshot?.partes.filter((row) => row.eliminado_en === null).length ?? 0,
    actualizadoEn: snapshot?.meta.actualizado_en ?? null,
    ultimaCopiaEn: snapshot?.meta.ultima_copia_en ?? null,
    cambiosDesdeCopia: snapshot?.meta.cambios_desde_copia ?? false,
    persistente: persistent,
    traspasosPendientes:
      snapshot?.traspasos.filter((move) => move.estado === 'copiado').length ?? 0,
  };
}

export const cloudViewNow = () => cloudView;
export const localNow = now;
