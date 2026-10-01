import type { Project, Task, TimeEntry } from '../../../domain/models';
import { DateTime } from 'luxon';
import { formatClock, formatDate, formatTime } from '../../../domain/time';
import { Button, IconButton } from '../../../shared/ui/Button';
import { DataTable } from '../../../shared/ui/DataTable';
import { Badge } from '../../../shared/ui/Panel';

export function EntriesTable({
  entries,
  projects,
  tasks,
  elapsedSeconds,
  busy,
  onStop,
  onEdit,
  onDelete,
}: {
  entries: TimeEntry[];
  projects: Project[];
  tasks: Task[];
  elapsedSeconds: number;
  busy: boolean;
  onStop: () => void;
  onEdit: (entry: TimeEntry) => void;
  onDelete: (entry: TimeEntry) => void;
}) {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  return (
    <DataTable
      caption="Partes de horas registrados"
      headers={[
        'Fecha / Zona',
        'Proyecto & Tarea',
        'Inicio exacto',
        'Fin exacto',
        'Dur. real',
        'Dur. imputada',
        'Descripción',
        'Estado',
        'Acciones',
      ]}
    >
      {entries.map((entry) => (
        <tr key={entry.id} className={!entry.fin_en ? 'data-table__live' : ''}>
          <td>
            <strong>{formatDate(entry.fecha, entry.zona_horaria)}</strong>
            <span className="cell-detail">{entry.zona_horaria}</span>
          </td>
          <td>
            <strong>
              {projectById.get(entry.proyecto_id)?.nombre ?? 'Proyecto no disponible'}
            </strong>
            <span className="cell-detail">
              {taskById.get(entry.tarea_id)?.titulo ?? 'Tarea no disponible'}
            </span>
          </td>
          <td className="mono nowrap">{formatTime(entry.inicio_en, entry.zona_horaria)}</td>
          <td className="mono nowrap">
            {entry.fin_en ? formatTime(entry.fin_en, entry.zona_horaria) : 'En curso'}
            {entry.fin_en &&
            DateTime.fromISO(entry.fin_en, { zone: entry.zona_horaria }).toISODate() !==
              entry.fecha ? (
              <span className="cell-detail">{formatDate(entry.fin_en, entry.zona_horaria)}</span>
            ) : null}
          </td>
          <td className="mono nowrap">
            {formatClock(entry.fin_en ? (entry.duracion_real_segundos ?? 0) : elapsedSeconds)}
            {!entry.fin_en ? <span className="cell-detail">Provisional</span> : null}
          </td>
          <td className="mono nowrap accent">
            {entry.fin_en ? formatClock(entry.duracion_imputada_segundos ?? 0) : 'Pendiente'}
            <span className="cell-detail">
              {entry.intervalo_redondeo_minutos
                ? `R${entry.intervalo_redondeo_minutos} · duración`
                : 'Sin redondeo'}
            </span>
          </td>
          <td className="cell-notes">{entry.descripcion || '—'}</td>
          <td>
            <Badge tone={entry.fin_en ? 'neutral' : 'accent'}>
              {entry.fin_en ? 'Finalizado' : 'En curso'}
            </Badge>
          </td>
          <td>
            {entry.fin_en ? (
              <div className="actions">
                <IconButton
                  icon="edit"
                  label={`Editar parte del ${entry.fecha} a las ${formatTime(entry.inicio_en, entry.zona_horaria)}`}
                  disabled={busy}
                  onClick={() => onEdit(entry)}
                />
                <IconButton
                  icon="trash"
                  label={`Eliminar parte del ${entry.fecha} a las ${formatTime(entry.inicio_en, entry.zona_horaria)}`}
                  disabled={busy}
                  onClick={() => onDelete(entry)}
                />
              </div>
            ) : (
              <Button variant="primary" disabled={busy} onClick={onStop}>
                Detener
              </Button>
            )}
          </td>
        </tr>
      ))}
    </DataTable>
  );
}
