import { normalizeOdooUrl } from '../../../src/domain/odoo.ts';
import { findExistingTask, fold } from './odooTask.ts';
import type { DetectedTask } from './odooTask.ts';

export type ImportChoice =
  { kind: 'project'; projectId: string } | { kind: 'new-project'; name: string };

export type ImportInput = {
  /** Account that asked for the import: every read and write is bound to it. */
  userId: string;
  detected: DetectedTask;
  title: string;
  choice: ImportChoice;
  /** Required when only the T… code matches an existing task. */
  allowPossibleDuplicate: boolean;
};

type ProjectLike = {
  id: string;
  nombre: string;
  archivado_en: string | null;
  eliminado_en: string | null;
};
type TaskLike = {
  id: string;
  titulo: string;
  proyecto_id: string;
  odoo_id: string | null;
  odoo_url: string | null;
  eliminado_en: string | null;
};

/** Each method must fail when the signed-in account is no longer `userId`. */
export type ImportRepository<P extends ProjectLike, T extends TaskLike> = {
  loadProjects(userId: string): Promise<P[]>;
  loadTasks(userId: string): Promise<T[]>;
  createProject(name: string, userId: string): Promise<P>;
  createTask(
    task: {
      proyecto_id: string;
      titulo: string;
      odoo_id: string | null;
      odoo_url: string | null;
    },
    userId: string,
  ): Promise<T>;
};

export type ImportResult<T> =
  | { kind: 'created'; task: T }
  | { kind: 'existing'; task: T }
  | { kind: 'possible-duplicate'; task: T };

/**
 * Runs every import of the extension one after another, and gives a second
 * request for the same Odoo record the promise of the first one. With the
 * fresh read inside the lock, reopening the popup or double clicking cannot
 * create the task twice from this browser.
 */
export function createImporter<P extends ProjectLike, T extends TaskLike>(
  repository: ImportRepository<P, T>,
) {
  let chain: Promise<unknown> = Promise.resolve();
  const inFlight = new Map<string, Promise<ImportResult<T>>>();

  async function run(input: ImportInput): Promise<ImportResult<T>> {
    const title = input.title.trim();
    if (!title) throw new Error('Escribe el nombre de la tarea.');
    if ([...title].length > 300)
      throw new Error('El nombre de la tarea admite hasta 300 caracteres.');
    const [tasks, projects] = await Promise.all([
      repository.loadTasks(input.userId),
      repository.loadProjects(input.userId),
    ]);
    const existing = findExistingTask(tasks, input.detected);
    if (existing?.kind === 'same') return { kind: 'existing', task: existing.task };
    if (existing?.kind === 'possible' && !input.allowPossibleDuplicate)
      return { kind: 'possible-duplicate', task: existing.task };
    let projectId: string;
    if (input.choice.kind === 'project') {
      const id = input.choice.projectId;
      const project = projects.find(
        (item) => item.id === id && !item.eliminado_en && !item.archivado_en,
      );
      if (!project) throw new Error('El proyecto elegido ya no está disponible.');
      projectId = project.id;
    } else {
      const name = input.choice.name.replace(/\s+/g, ' ').trim();
      if (!name) throw new Error('Escribe el nombre del proyecto.');
      const same = projects.find(
        (item) => !item.eliminado_en && !item.archivado_en && fold(item.nombre) === fold(name),
      );
      projectId = same ? same.id : (await repository.createProject(name, input.userId)).id;
    }
    const task = await repository.createTask(
      {
        proyecto_id: projectId,
        titulo: title,
        odoo_id: input.detected.code,
        odoo_url: normalizeOdooUrl(input.detected.url),
      },
      input.userId,
    );
    return { kind: 'created', task };
  }

  return function importTask(input: ImportInput): Promise<ImportResult<T>> {
    const key = `${input.userId}|${input.detected.origin}#${input.detected.recordId}`;
    const current = inFlight.get(key);
    if (current) return current;
    const next = chain.then(() => run(input));
    chain = next.catch(() => undefined);
    inFlight.set(key, next);
    void next.finally(() => inFlight.delete(key)).catch(() => undefined);
    return next;
  };
}
