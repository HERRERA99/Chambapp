import type { Profile, Task, TimeEntry } from '../../domain/models';
import type { Database } from './database.types';

type Tables = Database['public']['Tables'];
type EntryRow = Database['public']['Views']['partes_detalle']['Row'];

// SQL CHECKs and INNER JOINs guarantee these values. Validate at the API boundary
// because generated PostgREST view types conservatively mark every column nullable.
export function assertProfile(row: Tables['perfiles']['Row']): asserts row is Profile {
  if (
    !row.preferencias ||
    typeof row.preferencias !== 'object' ||
    Array.isArray(row.preferencias) ||
    !Number.isSafeInteger(row.version) ||
    row.version < 1 ||
    ![0, 5, 10, 15, 30, 60].includes(row.intervalo_redondeo_minutos)
  ) {
    throw new Error('El perfil contiene preferencias no válidas.');
  }
}

export function assertTask(row: Tables['tareas']['Row']): asserts row is Task {
  if (!['pendiente', 'en_curso', 'completada'].includes(row.estado)) {
    throw new Error('La tarea contiene un estado no válido.');
  }
}

export function assertEntry(row: EntryRow): asserts row is TimeEntry {
  const required = [
    row.id,
    row.usuario_id,
    row.tarea_id,
    row.jornada_id,
    row.proyecto_id,
    row.inicio_en,
    row.inicio_imputado_en,
    row.fecha,
    row.zona_horaria,
    row.modo_redondeo,
    row.creado_en,
    row.actualizado_en,
  ];
  if (
    required.some((value) => typeof value !== 'string' || value.length === 0) ||
    row.version === null ||
    !Number.isSafeInteger(row.version) ||
    row.version < 1 ||
    row.intervalo_redondeo_minutos === null ||
    ![0, 5, 10, 15, 30, 60].includes(row.intervalo_redondeo_minutos) ||
    !Number.isFinite(Date.parse(row.inicio_en ?? '')) ||
    (row.fin_en !== null &&
      (!Number.isFinite(Date.parse(row.fin_en)) ||
        row.duracion_real_segundos === null ||
        !Number.isFinite(row.duracion_real_segundos) ||
        row.duracion_real_segundos < 0 ||
        row.duracion_imputada_segundos === null ||
        !Number.isFinite(row.duracion_imputada_segundos) ||
        row.duracion_imputada_segundos < 0))
  ) {
    throw new Error('El parte contiene datos incompletos.');
  }
}
