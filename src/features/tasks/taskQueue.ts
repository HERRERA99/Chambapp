import type { Project, Task } from '../../domain/models';

export const archivePageSize = 15;

type QueueInput = {
  tasks: readonly Task[];
  projects: readonly Project[];
  query: string;
  projectId: string | null;
};

const newestFirst = (a: Task, b: Task) => b.actualizado_en.localeCompare(a.actualizado_en);

export function isArchivedTask(task: Task, projects: readonly Project[]) {
  return (
    !!task.archivado_en ||
    !!projects.find((project) => project.id === task.proyecto_id)?.archivado_en
  );
}

/**
 * Splits the tasks matching the search and project filters into active groups
 * (in progress, pending) and hidden ones (completed or archived).
 */
export function taskQueue({ tasks, projects, query, projectId }: QueueInput) {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const needle = query.trim().toLocaleLowerCase('es');
  const matches = tasks
    .filter(
      (task) =>
        !task.eliminado_en &&
        (!projectId || task.proyecto_id === projectId) &&
        `${task.titulo} ${task.odoo_id ?? ''} ${task.descripcion ?? ''} ${projectById.get(task.proyecto_id)?.nombre ?? ''}`
          .toLocaleLowerCase('es')
          .includes(needle),
    )
    .sort(newestFirst);
  const hidden = matches.filter(
    (task) => task.estado === 'completada' || isArchivedTask(task, projects),
  );
  const active = matches.filter((task) => !hidden.includes(task));
  const inProgress = active.filter((task) => task.estado === 'en_curso');
  const pending = active.filter((task) => task.estado === 'pendiente');
  return {
    inProgress,
    pending,
    /** Completed or archived tasks matching the filters. */
    hidden,
    active,
    /** Default focus candidate. */
    fallback: inProgress[0] ?? pending[0],
  };
}

export function paginate<T>(list: readonly T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { items: list.slice((current - 1) * size, current * size), page: current, pages };
}

/**
 * Focus priority: the user's choice while it is an active task, then the task
 * with the running timer, then the newest in-progress task, then the newest
 * pending one. Hidden tasks open in a popup instead of taking the focus.
 */
export function pickFocus({
  queue,
  selectedId,
  activeTaskId,
  tasks,
}: {
  queue: ReturnType<typeof taskQueue>;
  selectedId: string | null;
  activeTaskId: string | null;
  tasks: readonly Task[];
}): Task | undefined {
  const chosen = queue.active.find((task) => task.id === selectedId);
  if (chosen) return chosen;
  const timed = tasks.find((task) => task.id === activeTaskId && !task.eliminado_en);
  if (timed) return timed;
  return queue.fallback;
}
