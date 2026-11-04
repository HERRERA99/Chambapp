import type {
  Attendance,
  CalendarAbsence,
  CredentialRow,
  NoteRow as NoteRowModel,
  Profile,
  VaultRow,
  Task,
  TimeEntry,
} from '../../domain/models';
import { validDateRange } from '../../domain/calendar.ts';
import type { Database } from './database.types';
import { isOdooId, isOdooUrl } from '../../domain/odoo.ts';

type Tables = Database['public']['Tables'];
type EntryRow = Database['public']['Views']['partes_detalle']['Row'];
type AttendanceRow = Database['public']['Views']['fichajes_detalle']['Row'];

type NoteRow = Database['public']['Views']['notas_detalle']['Row'];
type CredentialViewRow = Database['public']['Views']['credenciales_detalle']['Row'];
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/**
 * Before the encryption migration is applied, `notas_detalle` has no `cifrado` or
 * `boveda_generacion` columns: such rows are plaintext notes.
 */
export function withNoteDefaults(row: NoteRow): NoteRow {
  return {
    ...row,
    cifrado: 'cifrado' in row ? row.cifrado : null,
    boveda_generacion: 'boveda_generacion' in row ? row.boveda_generacion : null,
  };
}

export function assertNote(row: NoteRow): asserts row is NoteRowModel {
  if (
    typeof row.id !== 'string' ||
    !uuid.test(row.id) ||
    typeof row.usuario_id !== 'string' ||
    !uuid.test(row.usuario_id) ||
    typeof row.titulo !== 'string' ||
    typeof row.contenido_md !== 'string' ||
    // Encrypted rows keep the text inside the envelope; it is checked per note when
    // decrypting, so one damaged envelope cannot block the whole workspace.
    (row.cifrado === null
      ? row.boveda_generacion !== null ||
        !row.titulo.trim() ||
        [...row.titulo].length > 200 ||
        new TextEncoder().encode(row.contenido_md).length > 1_000_000
      : typeof row.cifrado !== 'string' ||
        typeof row.boveda_generacion !== 'string' ||
        !uuid.test(row.boveda_generacion) ||
        row.titulo !== '' ||
        row.contenido_md !== '') ||
    typeof row.creado_en !== 'string' ||
    !Number.isFinite(Date.parse(row.creado_en)) ||
    typeof row.actualizado_en !== 'string' ||
    !Number.isFinite(Date.parse(row.actualizado_en)) ||
    row.version === null ||
    !Number.isSafeInteger(row.version) ||
    row.version < 1 ||
    [row.proyecto_ids, row.tarea_ids].some(
      (ids) =>
        !Array.isArray(ids) ||
        ids.length > 100 ||
        ids.some((id) => typeof id !== 'string' || !uuid.test(id)) ||
        new Set(ids).size !== ids.length,
    )
  )
    throw new Error('La nota contiene datos incompletos o no válidos.');
}

export function assertAbsence(row: Tables['ausencias']['Row']): asserts row is CalendarAbsence {
  if (
    !['festivo', 'vacaciones'].includes(row.tipo) ||
    !['manual', 'nager'].includes(row.fuente) ||
    !validDateRange(row.inicio, row.fin) ||
    typeof row.titulo !== 'string' ||
    !row.titulo.trim() ||
    !Number.isSafeInteger(row.version) ||
    row.version < 1
  ) {
    throw new Error('El calendario contiene un registro no válido.');
  }
}

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
  if (
    (row.odoo_id !== null && !isOdooId(row.odoo_id)) ||
    (row.odoo_url !== null && !isOdooUrl(row.odoo_url))
  ) {
    throw new Error('La tarea contiene datos de Odoo no válidos.');
  }
}

export function assertAttendance(row: AttendanceRow): asserts row is Attendance {
  const required = [
    row.id,
    row.usuario_id,
    row.jornada_id,
    row.inicio_en,
    row.fecha,
    row.zona_horaria,
    row.creado_en,
    row.actualizado_en,
  ];
  if (
    required.some((value) => typeof value !== 'string' || value.length === 0) ||
    row.version === null ||
    !Number.isSafeInteger(row.version) ||
    row.version < 1 ||
    !Number.isFinite(Date.parse(row.inicio_en ?? '')) ||
    (row.fin_en === null && row.duracion_segundos !== null) ||
    (row.fin_en !== null &&
      (!Number.isFinite(Date.parse(row.fin_en)) ||
        row.duracion_segundos === null ||
        !Number.isFinite(row.duracion_segundos) ||
        row.duracion_segundos <= 0))
  )
    throw new Error('El fichaje contiene datos incompletos.');
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
    typeof row.imputado_en_odoo !== 'boolean' ||
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

const envelope = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/;
const instant = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function assertVault(row: unknown): asserts row is VaultRow {
  const value = row as Partial<VaultRow> | null;
  if (
    !value ||
    typeof value.usuario_id !== 'string' ||
    !uuid.test(value.usuario_id) ||
    typeof value.generacion !== 'string' ||
    !uuid.test(value.generacion) ||
    typeof value.sal !== 'string' ||
    !/^[A-Za-z0-9_-]{22}$/.test(value.sal) ||
    !Number.isSafeInteger(value.iteraciones) ||
    (value.iteraciones as number) < 100_000 ||
    typeof value.clave_envuelta !== 'string' ||
    !envelope.test(value.clave_envuelta) ||
    !instant(value.creado_en) ||
    !instant(value.actualizado_en) ||
    !Number.isSafeInteger(value.version) ||
    (value.version as number) < 1
  )
    throw new Error('La bóveda contiene datos incompletos o no válidos.');
}

export function assertCredential(row: CredentialViewRow | unknown): asserts row is CredentialRow {
  const value = row as Partial<CredentialRow> | null;
  if (
    !value ||
    [value.id, value.usuario_id, value.proyecto_id, value.boveda_generacion].some(
      (id) => typeof id !== 'string' || !uuid.test(id),
    ) ||
    typeof value.cifrado !== 'string' ||
    !envelope.test(value.cifrado) ||
    !instant(value.creado_en) ||
    !instant(value.actualizado_en) ||
    !Number.isSafeInteger(value.version) ||
    (value.version as number) < 1
  )
    throw new Error('La entrada contiene datos incompletos o no válidos.');
}
