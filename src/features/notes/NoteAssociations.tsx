import { useState } from 'react';
import type { Project, Task } from '../../domain/models';
import { SearchSuggest } from '../../shared/ui/SearchSuggest';
import type { Suggestion } from '../../shared/ui/SearchSuggest';
import { normalizeNoteSearch } from './notes.model';

const LIMIT = 100;

/** Linked projects and tasks as removable chips, plus one search field to add more. */
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
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const projectsFull = projectIds.length >= LIMIT;
  const tasksFull = taskIds.length >= LIMIT;
  const suggestions: Suggestion[] = [
    ...projects
      .filter(
        (project) =>
          !projectIds.includes(project.id) &&
          normalizeNoteSearch(`${project.nombre} ${project.cliente ?? ''}`).includes(query),
      )
      .map((project) => ({
        id: `project:${project.id}`,
        group: 'Proyectos',
        title: project.nombre,
        detail: projectsFull
          ? `Límite de ${LIMIT} proyectos alcanzado`
          : [
              project.cliente,
              project.archivado_en ? 'Archivado' : null,
              project.origen === 'local' ? 'Local' : null,
            ]
              .filter(Boolean)
              .join(' · ') || undefined,
        disabled: projectsFull,
      })),
    ...tasks
      .filter(
        (task) =>
          !taskIds.includes(task.id) &&
          normalizeNoteSearch(
            `${task.titulo} ${task.odoo_id ?? ''} ${projectById.get(task.proyecto_id)?.nombre ?? ''}`,
          ).includes(query),
      )
      .map((task) => ({
        id: `task:${task.id}`,
        group: 'Tareas',
        title: task.titulo,
        detail: tasksFull
          ? `Límite de ${LIMIT} tareas alcanzado`
          : [
              projectById.get(task.proyecto_id)?.nombre ?? 'Proyecto no disponible aquí',
              task.odoo_id,
              task.archivado_en ? 'Archivada' : null,
            ]
              .filter(Boolean)
              .join(' · '),
        disabled: tasksFull,
      })),
  ];

  function add(suggestion: Suggestion) {
    const [kind, id] = suggestion.id.split(':') as ['project' | 'task', string];
    if (kind === 'project') onChange([...projectIds, id], taskIds);
    else onChange(projectIds, [...taskIds, id]);
  }

  return (
    <section className="note-associations" aria-labelledby="note-associations-title">
      <div className="note-associations__header">
        <h3 id="note-associations-title">Proyectos y tareas asociados</h3>
        <span className="mono dim">{projectIds.length + taskIds.length}</span>
      </div>
      <div className="note-associations__groups">
        <ChipGroup
          label="Proyectos"
          count={projectIds.length}
          empty="Sin proyectos asociados."
          disabled={disabled}
          chips={projectIds.map((id) => {
            const project = projectById.get(id);
            return {
              id,
              title: project?.nombre ?? 'Proyecto no disponible aquí',
              detail: project ? (project.archivado_en ? 'Archivado' : undefined) : 'Quítalo',
              missing: !project,
            };
          })}
          onRemove={(id) =>
            onChange(
              projectIds.filter((value) => value !== id),
              taskIds,
            )
          }
        />
        <ChipGroup
          label="Tareas"
          count={taskIds.length}
          empty="Sin tareas asociadas."
          disabled={disabled}
          chips={taskIds.map((id) => {
            const task = taskById.get(id);
            return {
              id,
              title: task?.titulo ?? 'Tarea no disponible aquí',
              detail: task
                ? (projectById.get(task.proyecto_id)?.nombre ?? 'Proyecto no disponible aquí')
                : 'Quítala',
              missing: !task,
            };
          })}
          onRemove={(id) =>
            onChange(
              projectIds,
              taskIds.filter((value) => value !== id),
            )
          }
        />
      </div>
      <SearchSuggest
        label="Añadir proyecto o tarea"
        value={search}
        onChange={setSearch}
        placeholder="Escribe para buscar proyectos o tareas…"
        suggestions={suggestions}
        emptyText="Nada más que asociar con ese texto."
        clearOnPick
        disabled={disabled}
        onPick={add}
      />
    </section>
  );
}

function ChipGroup({
  label,
  count,
  empty,
  chips,
  disabled,
  onRemove,
}: {
  label: string;
  count: number;
  empty: string;
  chips: { id: string; title: string; detail?: string; missing: boolean }[];
  disabled: boolean;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="note-associations__group">
      <span className="note-associations__label">
        {label} · {count}/{LIMIT}
      </span>
      {chips.length ? (
        <ul className="note-chips">
          {chips.map((chip) => (
            <li
              key={chip.id}
              className={`note-chip ${chip.missing ? 'note-chip--missing' : ''}`}
              title={chip.title}
            >
              <span className="note-chip__text">
                <strong>{chip.title}</strong>
                {chip.detail ? <small>{chip.detail}</small> : null}
              </span>
              <button
                type="button"
                className="note-chip__remove"
                aria-label={`Quitar ${chip.title}`}
                disabled={disabled}
                onClick={() => onRemove(chip.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dim note-associations__empty">{empty}</p>
      )}
    </div>
  );
}
