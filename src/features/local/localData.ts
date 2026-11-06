// What the screens do with the local data: backups, import, clearing it and moving a
// project between this browser and the cloud.
import { DateTime } from 'luxon';
import type { CredentialRow, TimeEntry, WorkspaceData } from '../../domain/models';
import {
  applyImport,
  buildBackup,
  encryptBackup,
  previewImport,
  readBackup,
} from '../../lib/local/backup';
import type { BackupData, ImportPreview } from '../../lib/local/backup';
import {
  cloudViewNow,
  destroyLocalData,
  lastCloudData,
  localNow,
  localSnapshot,
  mutateLocal,
} from '../../lib/local/runtime';
import type { LocalImputation, LocalPart, LocalSnapshot } from '../../lib/local/types';
import { LocalCommandError } from '../../lib/local/types';
import { DataError, readableError } from '../../lib/supabase/errors';
import { executeCommand, executeTransfer } from '../../lib/supabase/workspace.repository';

const asDataError = (cause: unknown) =>
  cause instanceof LocalCommandError
    ? new DataError(readableError(cause.code), false, cause.code, cause.code)
    : cause;

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Downloads a backup of the local data; with a password, encrypted. Marks it as saved. */
export async function downloadBackup(password?: string) {
  const current = localSnapshot();
  if (!current) throw new DataError(readableError('DATOS_LOCALES_BLOQUEADOS'));
  const now = localNow();
  const plain = buildBackup(current, now);
  const file = password ? await encryptBackup(plain, password) : plain;
  const day = DateTime.fromJSDate(now).toISODate();
  downloadText(
    `chambapp-local-${day}${password ? '-cifrada' : ''}.json`,
    `${JSON.stringify(file, null, 2)}\n`,
  );
  await mutateLocal((snapshot) => ({
    snapshot: {
      ...snapshot,
      meta: { ...snapshot.meta, ultima_copia_en: now.toISOString(), cambios_desde_copia: false },
    },
    result: null,
  }));
}

export type InspectedBackup =
  | { kind: 'needs-password' }
  | { kind: 'ok'; data: BackupData; exportadoEn: string; preview: ImportPreview };

function cloudIds() {
  const view = cloudViewNow();
  return new Set([...view.projectIds, ...view.taskIds, ...view.entries.map((row) => row.id)]);
}

/** Reads a backup file and shows what importing it would do. */
export async function inspectBackup(
  file: File,
  userId: string,
  password?: string,
): Promise<InspectedBackup> {
  try {
    const read = await readBackup(await file.text(), userId, password);
    if (read.kind === 'needs-password') return read;
    const current = localSnapshot();
    const base = current ?? ({ proyectos: [], tareas: [], partes: [] } as unknown as LocalSnapshot);
    return { ...read, preview: previewImport(base, read.data, cloudIds()) };
  } catch (cause) {
    throw asDataError(cause);
  }
}

/** Imports a read backup. "reemplazar" first downloads a copy of the current data. */
export async function importBackup(data: BackupData, mode: 'combinar' | 'reemplazar') {
  if (mode === 'reemplazar' && localSnapshot()) await downloadBackup();
  const entries = cloudViewNow().entries;
  try {
    await mutateLocal((snapshot) => ({
      snapshot: applyImport(snapshot, data, mode, cloudIds(), entries, localNow()),
      result: null,
    }));
  } catch (cause) {
    throw asDataError(cause);
  }
}

/**
 * Removes the local data of this browser. Credentials kept in the cloud for local
 * projects are deleted too (they would point at nothing).
 */
export async function clearLocal(
  userId: string,
  credentials: readonly CredentialRow[],
  backup: boolean,
) {
  const current = localSnapshot();
  if (backup && current) await downloadBackup();
  const localProjects = new Set(current?.proyectos.map((row) => row.id));
  for (const credential of credentials.filter((row) => localProjects.has(row.proyecto_id)))
    await executeCommand(
      'eliminar_credencial',
      { id: credential.id, version: credential.version },
      undefined,
      userId,
    );
  await destroyLocalData();
}

/** Credentials of local projects are deleted with the project (the cloud does it for its own). */
export async function deleteLocalProjectCredentials(
  userId: string,
  projectId: string,
  credentials: readonly CredentialRow[],
) {
  for (const credential of credentials.filter((row) => row.proyecto_id === projectId))
    await executeCommand(
      'eliminar_credencial',
      { id: credential.id, version: credential.version },
      undefined,
      userId,
    ).catch(() => undefined);
}

// ---------------------------------------------------------------- moving projects

const hasOpenEntry = (entries: readonly { fin_en: string | null }[]) =>
  entries.some((row) => row.fin_en === null);

function toLocalPart(entry: TimeEntry): LocalPart {
  return {
    id: entry.id,
    usuario_id: entry.usuario_id,
    tarea_id: entry.tarea_id,
    jornada_id: entry.jornada_id,
    fecha: entry.fecha,
    zona_horaria: entry.zona_horaria,
    inicio_en: entry.inicio_en,
    fin_en: entry.fin_en,
    intervalo_redondeo_minutos: entry.intervalo_redondeo_minutos,
    modo_redondeo: entry.modo_redondeo,
    descripcion: entry.descripcion,
    imputado_en_odoo: entry.imputado_en_odoo,
    imputacion_odoo_id: entry.imputacion_odoo_id,
    eliminado_en: null,
    creado_en: entry.creado_en,
    actualizado_en: entry.actualizado_en,
    version: entry.version,
  };
}

const stripOrigin = <T extends { origen?: unknown }>(row: T) => {
  const { origen: _origin, ...rest } = row;
  void _origin;
  return rest as Omit<T, 'origen'>;
};

/**
 * Cloud → this browser: the project, its tasks and entries are copied here with the
 * same ids, then removed physically from Supabase. A failure in between leaves the
 * local copy visible and the cloud cleanup pending (retryProjectMoves).
 */
export async function moveProjectToLocal(userId: string, projectId: string) {
  const cloud = lastCloudData();
  if (!cloud) throw new DataError('Los datos todavía se están cargando. Vuelve a intentarlo.');
  const project = cloud.projects.find((row) => row.id === projectId);
  if (!project) throw new DataError(readableError('PROYECTO_NO_DISPONIBLE'));
  const tasks = cloud.tasks.filter((row) => row.proyecto_id === projectId);
  const taskIds = new Set(tasks.map((row) => row.id));
  const entries = cloud.entries.filter((row) => taskIds.has(row.tarea_id));
  if (hasOpenEntry(entries)) throw new DataError(readableError('DETENER_O_DESCARTAR_ACTIVO'));
  const now = localNow().toISOString();
  const imputations = new Map<string, LocalImputation>();
  for (const entry of entries)
    if (entry.imputacion_odoo_id && !imputations.has(entry.imputacion_odoo_id))
      imputations.set(entry.imputacion_odoo_id, {
        id: entry.imputacion_odoo_id,
        usuario_id: userId,
        tarea_id: entry.tarea_id,
        fecha: entry.fecha,
        jornada_id: entry.jornada_id,
        estado: 'manual',
        creado_en: now,
      });
  const traspaso = crypto.randomUUID();
  await mutateLocal((snapshot) => {
    const ids = new Set([
      ...snapshot.proyectos.map((row) => row.id),
      ...snapshot.tareas.map((row) => row.id),
      ...snapshot.partes.map((row) => row.id),
    ]);
    if ([projectId, ...taskIds, ...entries.map((row) => row.id)].some((id) => ids.has(id)))
      throw new DataError(readableError('TRASPASO_ID_EXISTENTE'));
    return {
      snapshot: {
        ...snapshot,
        proyectos: [...snapshot.proyectos, stripOrigin(project)],
        tareas: [...snapshot.tareas, ...tasks.map(stripOrigin)],
        partes: [...snapshot.partes, ...entries.map(toLocalPart)],
        imputaciones: [...snapshot.imputaciones, ...imputations.values()],
        traspasos: [
          ...snapshot.traspasos,
          {
            proyecto_id: projectId,
            direccion: 'a-local',
            estado: 'copiado',
            traspaso_id: traspaso,
            actualizado_en: now,
          },
        ],
        meta: { ...snapshot.meta, actualizado_en: now, cambios_desde_copia: true },
      },
      result: null,
    };
  });
  await finishMove(userId, projectId);
}

/** Local → cloud: imported with the same ids, then removed from this browser. */
export async function moveProjectToCloud(userId: string, projectId: string) {
  const current = localSnapshot();
  const project = current?.proyectos.find(
    (row) => row.id === projectId && row.eliminado_en === null,
  );
  if (!current || !project) throw new DataError(readableError('PROYECTO_NO_DISPONIBLE'));
  const tasks = current.tareas.filter(
    (row) => row.proyecto_id === projectId && row.eliminado_en === null,
  );
  const taskIds = new Set(tasks.map((row) => row.id));
  const parts = current.partes.filter(
    (row) => taskIds.has(row.tarea_id) && row.eliminado_en === null,
  );
  if (hasOpenEntry(parts)) throw new DataError(readableError('DETENER_O_DESCARTAR_ACTIVO'));
  const now = localNow().toISOString();
  const existing = current.traspasos.find(
    (move) =>
      move.proyecto_id === projectId && move.direccion === 'a-nube' && move.estado !== 'hecho',
  );
  const traspaso = existing?.traspaso_id ?? crypto.randomUUID();
  if (!existing)
    await mutateLocal((snapshot) => ({
      snapshot: {
        ...snapshot,
        traspasos: [
          ...snapshot.traspasos,
          {
            proyecto_id: projectId,
            direccion: 'a-nube',
            estado: 'pendiente',
            traspaso_id: traspaso,
            actualizado_en: now,
          },
        ],
      },
      result: null,
    }));
  await executeTransfer(
    'importar_proyecto',
    {
      traspaso_id: traspaso,
      proyecto: {
        id: project.id,
        nombre: project.nombre,
        descripcion: project.descripcion,
        cliente: project.cliente,
        presupuesto_minutos: project.presupuesto_minutos,
        archivado: project.archivado_en !== null,
      },
      tareas: tasks.map((row) => ({
        id: row.id,
        proyecto_id: row.proyecto_id,
        titulo: row.titulo,
        descripcion: row.descripcion,
        estado: row.estado,
        estimacion_minutos: row.estimacion_minutos,
        odoo_id: row.odoo_id,
        odoo_url: row.odoo_url,
        archivado: row.archivado_en !== null,
      })),
      partes: parts.map((row) => ({
        id: row.id,
        tarea_id: row.tarea_id,
        inicio_en: row.inicio_en,
        fin_en: row.fin_en,
        intervalo_redondeo_minutos: row.intervalo_redondeo_minutos,
        descripcion: row.descripcion,
        fecha: row.fecha,
        zona_horaria: row.zona_horaria,
        imputacion_odoo_id: row.imputacion_odoo_id,
      })),
    },
    userId,
  );
  await mutateLocal((snapshot) => ({
    snapshot: {
      ...snapshot,
      traspasos: snapshot.traspasos.map((move) =>
        move.traspaso_id === traspaso ? { ...move, estado: 'copiado', actualizado_en: now } : move,
      ),
    },
    result: null,
  }));
  await finishMove(userId, projectId);
}

/** Second half of a move: clean the origin and mark it done. Safe to repeat. */
async function finishMove(userId: string, projectId: string) {
  const move = localSnapshot()?.traspasos.find(
    (entry) => entry.proyecto_id === projectId && entry.estado === 'copiado',
  );
  if (!move) return;
  const now = localNow().toISOString();
  if (move.direccion === 'a-local')
    await executeTransfer(
      'purgar_proyecto',
      { traspaso_id: move.traspaso_id, proyecto_id: projectId, confirmar: true },
      userId,
    );
  await mutateLocal((snapshot) => {
    const next = structuredClone(snapshot);
    if (move.direccion === 'a-nube') {
      // Removed physically from this browser: the cloud holds the project now.
      const tasks = new Set(
        next.tareas.filter((row) => row.proyecto_id === projectId).map((row) => row.id),
      );
      const parts = next.partes.filter((row) => tasks.has(row.tarea_id));
      const imputations = new Set(parts.map((row) => row.imputacion_odoo_id));
      next.proyectos = next.proyectos.filter((row) => row.id !== projectId);
      next.tareas = next.tareas.filter((row) => !tasks.has(row.id));
      next.partes = next.partes.filter((row) => !tasks.has(row.tarea_id));
      next.imputaciones = next.imputaciones.filter((row) => !imputations.has(row.id));
    }
    next.traspasos = next.traspasos.map((entry) =>
      entry.traspaso_id === move.traspaso_id
        ? { ...entry, estado: 'hecho', actualizado_en: now }
        : entry,
    );
    next.meta = { ...next.meta, actualizado_en: now, cambios_desde_copia: true };
    return { snapshot: next, result: null };
  });
}

/** Retries the moves left half-way (network failure, closed tab). */
export async function retryProjectMoves(userId: string) {
  const pending = (localSnapshot()?.traspasos ?? []).filter((move) => move.estado !== 'hecho');
  for (const move of pending) {
    if (move.estado === 'pendiente') await moveProjectToCloud(userId, move.proyecto_id);
    else await finishMove(userId, move.proyecto_id);
  }
}

/** True when the workspace has local data the user has not backed up for `days` days. */
export function backupDue(data: WorkspaceData, days: number, now = Date.now()) {
  const local = data.local;
  if (!local || local.estado !== 'abierto' || days <= 0 || !local.cambiosDesdeCopia) return false;
  if (!local.ultimaCopiaEn) return local.proyectos + local.partes > 0;
  return now - Date.parse(local.ultimaCopiaEn) > days * 24 * 3600 * 1000;
}
