import { useState } from 'react';
import type { Project, Task } from '../../domain/models';
import { InputField } from '../../shared/ui/FormField';
import { normalizeNoteSearch } from './notes.model';

export function NoteAssociations({
  projects,
  tasks,
  projectIds,
  taskIds,
  disabled,
  onChange,
}: {
  projects: Project[];
  tasks: Task[];
  projectIds: string[];
  taskIds: string[];
  disabled: boolean;
  onChange: (projectIds: string[], taskIds: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const query = normalizeNoteSearch(search);
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const visibleProjects = projects.filter((project) =>
    normalizeNoteSearch(project.nombre).includes(query),
  );
  const visibleTasks = tasks.filter((task) =>
    normalizeNoteSearch(
      `${task.titulo} ${task.odoo_id ?? ''} ${projectById.get(task.proyecto_id)?.nombre ?? ''}`,
    ).includes(query),
  );
  function toggle(ids: string[], id: string) {
    return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
  }
  return (
    <details
      className="note-associations"
      open={projectIds.length + taskIds.length > 0 || undefined}
    >
      <summary>
        Proyectos y tareas asociados{' '}
        <span className="dim">({projectIds.length + taskIds.length})</span>
      </summary>
      <p className="field__hint">
        Relaciona esta nota con varios proyectos y tareas. Puedes asociar tareas de cualquier
        proyecto.
      </p>
      <InputField
        label="Buscar proyectos o tareas"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="note-associations__columns">
        <fieldset disabled={disabled}>
          <legend>Proyectos · {projectIds.length}/100</legend>
          <div className="note-associations__options">
            {projectIds
              .filter((id) => !projectById.has(id))
              .map((id) => (
                <label className="note-associations__option" key={id}>
                  <input
                    type="checkbox"
                    checked
                    onChange={() => onChange(toggle(projectIds, id), taskIds)}
                  />
                  <span>
                    Proyecto no disponible<small>Desmarca para quitar esta asociación.</small>
                  </span>
                </label>
              ))}
            {visibleProjects.map((project) => (
              <label className="note-associations__option" key={project.id}>
                <input
                  type="checkbox"
                  checked={projectIds.includes(project.id)}
                  disabled={!projectIds.includes(project.id) && projectIds.length >= 100}
                  onChange={() => onChange(toggle(projectIds, project.id), taskIds)}
                />
                <span>
                  {project.nombre}
                  {project.archivado_en ? <small>Archivado</small> : null}
                </span>
              </label>
            ))}
            {!visibleProjects.length ? (
              <p className="muted">
                {projects.length ? 'Sin coincidencias.' : 'Todavía no hay proyectos.'}
              </p>
            ) : null}
          </div>
        </fieldset>
        <fieldset disabled={disabled}>
          <legend>Tareas · {taskIds.length}/100</legend>
          <div className="note-associations__options">
            {taskIds
              .filter((id) => !tasks.some((task) => task.id === id))
              .map((id) => (
                <label className="note-associations__option" key={id}>
                  <input
                    type="checkbox"
                    checked
                    onChange={() => onChange(projectIds, toggle(taskIds, id))}
                  />
                  <span>
                    Tarea no disponible<small>Desmarca para quitar esta asociación.</small>
                  </span>
                </label>
              ))}
            {visibleTasks.map((task) => (
              <label className="note-associations__option" key={task.id}>
                <input
                  type="checkbox"
                  checked={taskIds.includes(task.id)}
                  disabled={!taskIds.includes(task.id) && taskIds.length >= 100}
                  onChange={() => onChange(projectIds, toggle(taskIds, task.id))}
                />
                <span>
                  {task.titulo}
                  <small>
                    {projectById.get(task.proyecto_id)?.nombre ?? 'Proyecto no disponible'}
                    {task.archivado_en ? ' · Archivada' : ''}
                  </small>
                </span>
              </label>
            ))}
            {!visibleTasks.length ? (
              <p className="muted">
                {tasks.length ? 'Sin coincidencias.' : 'Todavía no hay tareas.'}
              </p>
            ) : null}
          </div>
        </fieldset>
      </div>
    </details>
  );
}
