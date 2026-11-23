import { downloadCsv } from '../../lib/export';
import type { WeekBlock } from './week.model';

export function exportWeekCsv(monday: string, entries: readonly WeekBlock[]) {
  downloadCsv(
    `chambapp-semana-${monday}.csv`,
    [
      'Fecha',
      'Proyecto',
      'Cliente',
      'Tarea',
      'ID Odoo',
      'Enlace Odoo',
      'Inicio exacto',
      'Fin exacto',
      'Zona horaria',
      'Real (s)',
      'Imputado (s)',
      'Redondeo (min)',
      'Descripción',
      'Estado',
    ],
    entries.map(({ entry, project, task }) => [
      entry.fecha,
      project?.nombre ?? '',
      project?.cliente ?? null,
      task?.titulo ?? '',
      task?.odoo_id ?? null,
      task?.odoo_url ?? null,
      entry.inicio_en,
      entry.fin_en,
      entry.zona_horaria,
      entry.duracion_real_segundos,
      entry.duracion_imputada_segundos,
      entry.intervalo_redondeo_minutos,
      entry.descripcion,
      entry.fin_en ? 'Finalizado' : 'En curso',
    ]),
  );
}
