import type { LocalSummary } from '../lib/local/runtime';
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Profile = {
  id: string;
  nombre: string;
  zona_horaria: string;
  intervalo_redondeo_minutos: number;
  modo_redondeo: string;
  onboarding_completado: boolean;
  preferencias: { [key: string]: Json | undefined };
  creado_en: string;
  actualizado_en: string;
  version: number;
};

type OwnedRecord = {
  id: string;
  usuario_id: string;
  creado_en: string;
  actualizado_en: string;
  version: number;
};

/** Where a project, task or entry is stored; absent means the cloud. */
export type DataOrigin = 'nube' | 'local';

export type Project = OwnedRecord & {
  origen?: DataOrigin;
  nombre: string;
  descripcion: string | null;
  cliente: string | null;
  presupuesto_minutos: number | null;
  archivado_en: string | null;
  eliminado_en: string | null;
};

export type Task = OwnedRecord & {
  origen?: DataOrigin;
  proyecto_id: string;
  titulo: string;
  descripcion: string | null;
  estado: 'pendiente' | 'en_curso' | 'completada';
  estimacion_minutos: number | null;
  odoo_id: string | null;
  odoo_url: string | null;
  archivado_en: string | null;
  eliminado_en: string | null;
};

/** Note as shown and edited in the app (decrypted). */
export type Note = OwnedRecord & {
  titulo: string;
  contenido_md: string;
  proyecto_ids: string[];
  tarea_ids: string[];
};

/**
 * Note row as stored: legacy plaintext (`cifrado` null) or an encrypted
 * envelope with empty `titulo`/`contenido_md`.
 */
export type NoteRow = Note & {
  cifrado: string | null;
  boveda_generacion: string | null;
};

export type VaultRow = {
  usuario_id: string;
  generacion: string;
  sal: string;
  iteraciones: number;
  clave_envuelta: string;
  creado_en: string;
  actualizado_en: string;
  version: number;
};

export type CredentialRow = OwnedRecord & {
  proyecto_id: string;
  boveda_generacion: string;
  cifrado: string;
};

export type TimeRecord = OwnedRecord & {
  tarea_id: string;
  jornada_id: string;
  inicio_en: string;
  fin_en: string | null;
  intervalo_redondeo_minutos: number;
  modo_redondeo: string;
  descripcion: string | null;
  imputado_en_odoo: boolean;
  /** Odoo imputation the entry belongs to; null while pending. */
  imputacion_odoo_id: string | null;
  eliminado_en: string | null;
};

export type TimeEntry = TimeRecord & {
  origen?: DataOrigin;
  proyecto_id: string;
  odoo_id: string | null;
  odoo_url: string | null;
  fecha: string;
  zona_horaria: string;
  inicio_imputado_en: string;
  fin_imputado_en: string | null;
  duracion_real_segundos: number | null;
  duracion_imputada_segundos: number | null;
};

export type WeeklyConfiguration = {
  id: string;
  usuario_id: string;
  minutos_semanales: number;
  vigente_desde: string;
  creado_en: string;
};

export type Attendance = OwnedRecord & {
  jornada_id: string;
  inicio_en: string;
  fin_en: string | null;
  eliminado_en: string | null;
  fecha: string;
  zona_horaria: string;
  duracion_segundos: number | null;
};

export type ScheduleDay = {
  configuracion_id: string;
  dia_semana: number;
  minutos_objetivo: number;
};

export type Workday = OwnedRecord & {
  fecha: string;
  zona_horaria: string;
  configuracion_id: string | null;
  minutos_objetivo: number;
  notas: string | null;
};

export type WorkspaceData = {
  profile: Profile;
  projects: Project[];
  tasks: Task[];
  notes: NoteRow[];
  entries: TimeEntry[];
  configurations: WeeklyConfiguration[];
  days: ScheduleDay[];
  jornadas: Workday[];
  fichajes: Attendance[];
  absences: CalendarAbsence[];
  serverTime: string;
  receivedAt: number;
  /** State of the projects, tasks and entries kept in this browser. */
  local?: LocalSummary;
  /** Local edition: data generation of the local database (changes on every restore). */
  dataGeneration?: string;
};

export type CalendarAbsence = OwnedRecord & {
  titulo: string;
  tipo: 'festivo' | 'vacaciones';
  inicio: string;
  fin: string;
  fuente: 'manual' | 'nager';
  ambito: string | null;
};

export type CommandAction =
  | 'guardar_nota'
  | 'eliminar_nota'
  | 'crear_boveda'
  | 'cambiar_clave'
  | 'restablecer_boveda'
  | 'guardar_credencial'
  | 'eliminar_credencial'
  | 'guardar_ausencia'
  | 'eliminar_ausencia'
  | 'sincronizar_festivos'
  | 'editar_perfil'
  | 'crear_proyecto'
  | 'editar_proyecto'
  | 'crear_tarea'
  | 'editar_tarea'
  | 'crear_configuracion_semanal'
  | 'generar_semana'
  | 'editar_jornada'
  | 'crear_parte'
  | 'editar_parte'
  | 'imputar_partes'
  | 'deshacer_imputacion'
  | 'eliminar_proyecto'
  | 'eliminar_tarea'
  | 'eliminar_parte'
  | 'fichar_entrada'
  | 'fichar_salida'
  | 'crear_fichaje'
  | 'editar_fichaje'
  | 'eliminar_fichaje'
  | 'iniciar'
  | 'detener'
  | 'consultar_operacion'
  | 'consultar_cronometro';
