import { formatDuration, formatTime } from '../../../domain/time';
import { DataTable } from '../../../shared/ui/DataTable';
import { Panel } from '../../../shared/ui/Panel';
import { OdooLink } from '../../tasks/components/OdooLink';
import type { CalendarDay, WeekBlock } from '../week.model';

export function WeekReport({
  days,
  entries,
}: {
  days: readonly CalendarDay[];
  entries: readonly WeekBlock[];
}) {
  return (
    <div className="week-print-report">
      <Panel title="Detalle de jornadas">
        <DataTable
          caption="Objetivos y duración de partes finalizados"
          headers={['Fecha', 'Objetivo', 'Real', 'Imputado']}
        >
          {days.map((day) => (
            <tr key={day.date}>
              <td>{day.date}</td>
              <td>{formatDuration(day.targetSeconds)}</td>
              <td>{formatDuration(day.realSeconds)}</td>
              <td>{formatDuration(day.loggedSeconds)}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
      <Panel title="Partes de la semana">
        <DataTable
          caption="Inicio y fin exactos; el redondeo se aplica a la duración"
          headers={['Fecha', 'Proyecto / tarea', 'Inicio / fin', 'Real', 'Imputado']}
        >
          {entries.map(({ entry, task, project }) => (
            <tr key={entry.id}>
              <td>{entry.fecha}</td>
              <td>
                {project?.nombre}
                <br />
                {task?.titulo}
                <br />
                <OdooLink task={task} />
              </td>
              <td>
                {formatTime(entry.inicio_en, entry.zona_horaria)} –{' '}
                {entry.fin_en ? formatTime(entry.fin_en, entry.zona_horaria) : 'En curso'}
                <br />
                {entry.zona_horaria}
              </td>
              <td>
                {entry.fin_en ? formatDuration(entry.duracion_real_segundos ?? 0) : 'Provisional'}
              </td>
              <td>
                {entry.fin_en ? formatDuration(entry.duracion_imputada_segundos ?? 0) : 'Pendiente'}
              </td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  );
}
