// Answers the browser extension about the data kept in this browser (Plan 11): the
// extension cannot read this tab's IndexedDB, so it asks the open Chambapp tab.
import type { LocalOperation } from '../extension/protocol';
import { entriesView } from '../../lib/local/engine';
import { localSnapshot, localState } from '../../lib/local/runtime';
import { DataError, readableError } from '../../lib/supabase/errors';
import { executeCommand } from '../../lib/supabase/workspace.repository';

const closed = () =>
  new DataError(readableError('DATOS_LOCALES_BLOQUEADOS'), false, 'DATOS_LOCALES_BLOQUEADOS');

/** Result of one operation; throws when this tab cannot answer it. */
export async function answerLocal(op: LocalOperation, userId: string): Promise<unknown> {
  const state = localState();
  const current = localSnapshot();
  const open = state === 'abierto' || state === 'sin-datos';
  if (!open) throw closed();
  switch (op.kind) {
    case 'listar':
      return {
        proyectos: (current?.proyectos ?? []).filter((row) => row.eliminado_en === null),
        tareas: (current?.tareas ?? []).filter((row) => row.eliminado_en === null),
      };
    case 'crear-proyecto':
      return executeCommand(
        'crear_proyecto',
        {
          nombre: op.nombre,
          descripcion: null,
          cliente: null,
          presupuesto_minutos: null,
          destino: 'local',
        },
        undefined,
        userId,
      );
    case 'crear-tarea': {
      if (
        !current?.proyectos.some(
          (row) => row.id === op.tarea.proyecto_id && row.eliminado_en === null,
        )
      )
        throw new DataError(readableError('PROYECTO_NO_DISPONIBLE'));
      return executeCommand(
        'crear_tarea',
        { ...op.tarea, descripcion: null, estado: 'pendiente', estimacion_minutos: null },
        undefined,
        userId,
      );
    }
    case 'cargar': {
      const ids = new Set(op.partIds);
      // Same columns as partes_detalle (live entries only), tareas and proyectos in the cloud.
      const rows = (current ? entriesView(current) : [])
        .filter((row) => ids.has(row.id))
        .map((row) => ({
          id: row.id,
          usuario_id: row.usuario_id,
          version: row.version,
          tarea_id: row.tarea_id,
          fecha: row.fecha,
          fin_en: row.fin_en,
          eliminado_en: row.eliminado_en,
          imputacion_odoo_id: row.imputacion_odoo_id,
          duracion_real_segundos: row.duracion_real_segundos,
          intervalo_redondeo_minutos: row.intervalo_redondeo_minutos,
        }));
      const task = current?.tareas.find((row) => row.id === op.taskId) ?? null;
      const project = task
        ? (current?.proyectos.find((row) => row.id === task.proyecto_id) ?? null)
        : null;
      return {
        rows,
        task: task && {
          id: task.id,
          usuario_id: task.usuario_id,
          proyecto_id: task.proyecto_id,
          version: task.version,
          odoo_url: task.odoo_url,
          eliminado_en: task.eliminado_en,
        },
        project: project && { id: project.id, eliminado_en: project.eliminado_en },
      };
    }
    case 'imputar': {
      const local = new Set(current?.partes.map((row) => row.id));
      if (!op.partes.every((part) => local.has(part.id)))
        throw new DataError(readableError('PARTE_NO_DISPONIBLE'));
      return executeCommand('imputar_partes', { partes: op.partes }, undefined, userId);
    }
  }
}
