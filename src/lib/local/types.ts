// Shapes of the data kept in this browser (IndexedDB). Rows mirror the Supabase
// tables `proyectos`, `tareas`, `partes_horas` and `imputaciones_odoo`, so the app
// can show both stores with the same code.
import type { Json, Project, Task, TimeRecord } from '../../domain/models.ts';

export const LOCAL_SCHEMA = 1;

export type LocalProject = Project;
export type LocalTask = Task;

/** A time entry row plus the day it belongs to (the cloud keeps that in `jornadas`). */
export type LocalPart = TimeRecord & { fecha: string; zona_horaria: string };

export type LocalImputation = {
  id: string;
  usuario_id: string;
  tarea_id: string;
  /** Local stand-in for the cloud workday: entries of one task and day are grouped. */
  fecha: string;
  jornada_id: string;
  estado: 'manual';
  creado_en: string;
};

/** Idempotency record of a timer command (like chambapp_private.operaciones_cronometro). */
export type LocalOperation = {
  tipo: 'iniciar' | 'detener';
  parametros: { [key: string]: Json | undefined };
  parte_id: string | null;
  resultado: { [key: string]: Json | undefined };
  creado_en: string;
};

/** A project moving between the browser and the cloud (see docs/planes/PLAN-11.md §7). */
export type LocalTransfer = {
  proyecto_id: string;
  direccion: 'a-local' | 'a-nube';
  /**
   * pendiente: started, the destination may not have the copy yet (retry is safe).
   * copiado: the destination has the copy; the origin is not cleaned yet.
   */
  estado: 'pendiente' | 'copiado' | 'hecho';
  traspaso_id: string;
  actualizado_en: string;
};

export type LocalSnapshot = {
  esquema: typeof LOCAL_SCHEMA;
  usuario_id: string;
  proyectos: LocalProject[];
  tareas: LocalTask[];
  partes: LocalPart[];
  imputaciones: LocalImputation[];
  /** Stable id per day for entries whose day has no cloud workday yet. */
  jornadas_locales: Record<string, { id: string; zona_horaria: string }>;
  operaciones: Record<string, LocalOperation>;
  traspasos: LocalTransfer[];
  meta: {
    actualizado_en: string | null;
    ultima_copia_en: string | null;
    cambios_desde_copia: boolean;
  };
};

export function emptySnapshot(userId: string): LocalSnapshot {
  return {
    esquema: LOCAL_SCHEMA,
    usuario_id: userId,
    proyectos: [],
    tareas: [],
    partes: [],
    imputaciones: [],
    jornadas_locales: {},
    operaciones: {},
    traspasos: [],
    meta: { actualizado_en: null, ultima_copia_en: null, cambios_desde_copia: false },
  };
}

/** Raised with the same codes as the Supabase functions, so `readableError` applies. */
export class LocalCommandError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'LocalCommandError';
    this.code = code;
  }
}
