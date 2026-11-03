import type { Project, Task } from '../../../domain/models';
import { formatDuration } from '../../../domain/time';
import { Button } from '../../../shared/ui/Button';
import { InputField, SelectField, Toggle } from '../../../shared/ui/FormField';
import { taskStatusLabels } from '../taskLabels';
import { isArchivedTask } from '../taskQueue';
import '../task-queue.css';

/** Hidden matches shown in the queue while searching with the archive switch off. */
export const hiddenPreviewSize = 5;

type Totals = (taskId: string) => { logged: number };

export function TaskQueue({
  inProgress,
  pending,
  hidden,
  projects,
  focusId,
  activeTaskId,
  query,
  projectId,
  archiveMode,
  totals,
  onQuery,
  onProject,
  onArchiveMode,
  onSelect,
  onOpen,
}: {
  inProgress: Task[];
  pending: Task[];
  /** Completed/archived matches; empty unless the user is searching. */
  hidden: Task[];
  projects: Project[];
  focusId: string | undefined;
  activeTaskId: string | null;
  query: string;
  projectId: string | null;
  archiveMode: boolean;
  totals: Totals;
  onQuery: (value: string) => void;
  onProject: (value: string | null) => void;
  onArchiveMode: (value: boolean) => void;
  /** Active task: becomes the focused task. */
  onSelect: (task: Task) => void;
  /** Hidden task: opens the task popup. */
  onOpen: (task: Task) => void;
}) {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const groups = [
    { id: 'in-progress', label: 'En curso', tasks: inProgress, total: inProgress.length },
    { id: 'pending', label: 'Pendientes', tasks: pending, total: pending.length },
    {
      id: 'hidden',
      label: 'Finalizadas y archivadas',
      tasks: hidden.slice(0, hiddenPreviewSize),
      total: hidden.length,
    },
  ];
  const shown = inProgress.length + pending.length + hidden.length;

  function row(task: Task, isHidden: boolean) {
    const logged = totals(task.id).logged;
    return (
      <li key={task.id}>
        <button
          type="button"
          className={`task-queue__row ${activeTaskId === task.id ? 'task-queue__row--active' : ''}`}
          aria-current={focusId === task.id ? 'true' : undefined}
          aria-haspopup={isHidden ? 'dialog' : undefined}
          onClick={() => (isHidden ? onOpen(task) : onSelect(task))}
        >
          <span className={`task-queue__dot task-queue__dot--${task.estado}`} aria-hidden="true" />
          <span className="task-queue__main">
            <strong title={task.titulo}>{task.titulo}</strong>
            <span className="dim">
              {projectById.get(task.proyecto_id)?.nombre ?? 'Proyecto'}
              {isHidden
                ? ` · ${isArchivedTask(task, projects) ? 'Archivada' : taskStatusLabels[task.estado]}`
                : ''}
            </span>
          </span>
          <span className="task-queue__side">
            {task.odoo_id ? (
              <span className="task-queue__odoo mono" title={task.odoo_id}>
                {task.odoo_id}
              </span>
            ) : null}
            <span className="mono dim">
              {formatDuration(logged)}
              {task.estimacion_minutos ? ` / ${formatDuration(task.estimacion_minutos * 60)}` : ''}
            </span>
          </span>
        </button>
      </li>
    );
  }

  return (
    <aside className="task-queue" aria-label="Siguientes tareas">
      <div className="task-queue__filters">
        <InputField
          label="Buscar tarea"
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Título, proyecto o ID de Odoo…"
          hint="También encuentra tareas finalizadas y archivadas."
        />
        <SelectField
          label="Proyecto"
          value={projectId ?? ''}
          onChange={(event) => onProject(event.target.value || null)}
        >
          <option value="">Todos los proyectos</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.nombre}
              {project.archivado_en ? ' (archivado)' : ''}
            </option>
          ))}
        </SelectField>
        <Toggle label="Finalizadas y archivadas" checked={archiveMode} onChange={onArchiveMode} />
      </div>
      {groups.map((group) =>
        group.tasks.length ? (
          <section
            key={group.id}
            className="task-queue__group"
            aria-labelledby={`queue-${group.id}`}
          >
            <h2 id={`queue-${group.id}`} className="task-queue__heading">
              {group.label} <span className="dim">{group.total}</span>
            </h2>
            <ul>{group.tasks.map((task) => row(task, group.id === 'hidden'))}</ul>
            {group.id === 'hidden' && group.total > group.tasks.length ? (
              <Button
                variant="ghost"
                className="task-queue__more"
                onClick={() => onArchiveMode(true)}
              >
                Ver las {group.total}
              </Button>
            ) : null}
          </section>
        ) : null,
      )}
      {!shown ? (
        <p className="task-queue__note dim">
          {query || projectId
            ? 'Ninguna otra tarea coincide.'
            : 'No hay más tareas en curso ni pendientes.'}
        </p>
      ) : null}
    </aside>
  );
}
