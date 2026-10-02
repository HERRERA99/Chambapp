import type { Task, TimeEntry } from '../../../domain/models';
import { formatDate, formatDuration, formatTime } from '../../../domain/time';
import { Panel, Badge } from '../../../shared/ui/Panel';
import { Icon } from '../../../shared/ui/Icon';
import { Button, IconButton } from '../../../shared/ui/Button';
import { entryTotals } from '../../time-entries/entryTotals';
import { OdooLink } from './OdooLink';

export function TaskEntries({
  task,
  entries,
  elapsedSeconds,
  canCreate,
  onCreate,
  onEdit,
}: {
  task: Task;
  entries: TimeEntry[];
  elapsedSeconds: number;
  canCreate: boolean;
  onCreate: () => void;
  onEdit: (entry: TimeEntry) => void;
}) {
  const grouped = new Map<string, TimeEntry[]>();
  for (const entry of entries) {
    const sessions = grouped.get(entry.fecha) ?? [];
    sessions.push(entry);
    grouped.set(entry.fecha, sessions);
  }
  const dates = [...grouped.keys()].sort().reverse();
  return (
    <Panel
      title="Partes imputados por jornada"
      icon="calendar"
      action={
        <Button icon="plus" disabled={!canCreate} onClick={onCreate}>
          Añadir parte manual
        </Button>
      }
    >
      {dates.length ? (
        dates.map((date) => {
          const sessions = (grouped.get(date) ?? []).sort((a, b) =>
            b.inicio_en.localeCompare(a.inicio_en),
          );
          const total = entryTotals(sessions);
          return (
            <div className="day-group" key={date}>
              <div className="day-group__header">
                <div>
                  <strong>{formatDate(date, sessions[0]?.zona_horaria)}</strong>
                  <span className="cell-detail">
                    {sessions.length} partes · {sessions[0]?.zona_horaria}
                  </span>
                </div>
                <span className="mono">{formatDuration(total.logged)} imputadas</span>
              </div>
              {sessions.map((entry) => (
                <div
                  className={`session-row ${entry.fin_en ? '' : 'session-row--active'}`}
                  key={entry.id}
                >
                  <Icon name={entry.fin_en ? 'clock' : 'timer'} />
                  <div>
                    <div className="actions">
                      <strong>Sesión de trabajo</strong>
                      <span className="mono dim">
                        {formatTime(entry.inicio_en, entry.zona_horaria)} →{' '}
                        {entry.fin_en ? formatTime(entry.fin_en, entry.zona_horaria) : 'En curso'}
                      </span>
                    </div>
                    <p className="muted">{entry.descripcion || 'Sin descripción'}</p>
                    <OdooLink task={task} className="odoo-entry-reference" />
                    {entry.fin_en ? (
                      <span className="field__hint">
                        Real: {formatDuration(entry.duracion_real_segundos ?? 0)} ·{' '}
                        {entry.intervalo_redondeo_minutos
                          ? `Redondeo ${entry.intervalo_redondeo_minutos} min`
                          : 'Sin redondeo'}
                      </span>
                    ) : (
                      <Badge tone="accent">Cronómetro activo</Badge>
                    )}
                  </div>
                  <div className="session-row__duration">
                    <span className="eyebrow">
                      {entry.fin_en ? 'Imputado' : 'Provisional · real'}
                    </span>
                    <strong className="mono">
                      {formatDuration(
                        entry.fin_en ? (entry.duracion_imputada_segundos ?? 0) : elapsedSeconds,
                      )}
                    </strong>
                  </div>
                  {entry.fin_en ? (
                    <IconButton
                      icon="edit"
                      label={`Editar sesión del ${date} a las ${formatTime(entry.inicio_en, entry.zona_horaria)}`}
                      onClick={() => onEdit(entry)}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          );
        })
      ) : (
        <div className="empty-state">
          <Icon name="file" size={32} />
          <h3>Esta tarea aún no tiene partes</h3>
          <p className="muted">Inicia el cronómetro o registra un intervalo manual.</p>
        </div>
      )}
    </Panel>
  );
}
