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

export type Project = OwnedRecord & {
  nombre: string;
  descripcion: string | null;
  cliente: string | null;
  presupuesto_minutos: number | null;
  archivado_en: string | null;
  eliminado_en: string | null;
};

export type Task = OwnedRecord & {
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

export type TimeRecord = OwnedRecord & {
  tarea_id: string;
  jornada_id: string;
  inicio_en: string;
  fin_en: string | null;
  intervalo_redondeo_minutos: number;
  modo_redondeo: string;
  descripcion: string | null;
  imputado_en_odoo: boolean;
  eliminado_en: string | null;
};

export type TimeEntry = TimeRecord & {
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
  entries: TimeEntry[];
  configurations: WeeklyConfiguration[];
  days: ScheduleDay[];
  jornadas: Workday[];
  fichajes: Attendance[];
  absences: CalendarAbsence[];
  serverTime: string;
  receivedAt: number;
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
