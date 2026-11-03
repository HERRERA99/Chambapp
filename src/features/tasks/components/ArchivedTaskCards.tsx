import type { Project, Task } from '../../../domain/models';
import { formatDuration } from '../../../domain/time';
import { taskStatusLabels } from '../taskLabels';
import { isArchivedTask } from '../taskQueue';
import '../archived-cards.css';

/** Horizontal cards for completed and archived tasks; a click opens the task popup. */
export function ArchivedTaskCards({
  tasks,
  projects,
  logged,
  onOpen,
}: {
  tasks: Task[];
  projects: Project[];
  logged: (taskId: string) => number;
  onOpen: (task: Task) => void;
}) {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  return (
    <ul className="archived-cards">
      {tasks.map((task) => {
        const archived = isArchivedTask(task, projects);
        return (
          <li key={task.id}>
            <button
              type="button"
              className={`archived-card ${archived ? 'archived-card--archived' : 'archived-card--done'}`}
              onClick={() => onOpen(task)}
            >
              <span className="archived-card__head">
                <strong>{task.titulo}</strong>
                {task.odoo_id ? (
                  <span className="archived-card__odoo mono" title={task.odoo_id}>
                    {task.odoo_id}
                  </span>
                ) : null}
              </span>
              <span className="archived-card__meta">
                <span className="dim">
                  {projectById.get(task.proyecto_id)?.nombre ?? 'Proyecto'} ·{' '}
                  {archived ? 'Archivada' : taskStatusLabels[task.estado]}
                </span>
                <span className="mono">
                  {formatDuration(logged(task.id))} /{' '}
                  {task.estimacion_minutos === null
                    ? 'Sin estimar'
                    : formatDuration(task.estimacion_minutos * 60)}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
