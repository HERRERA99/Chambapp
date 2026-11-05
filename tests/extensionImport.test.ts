import assert from 'node:assert/strict';
import test from 'node:test';
import { createImporter } from '../extension/src/shared/importTask.ts';
import type { ImportInput } from '../extension/src/shared/importTask.ts';

type Project = {
  id: string;
  nombre: string;
  archivado_en: string | null;
  eliminado_en: string | null;
};
type Task = {
  id: string;
  titulo: string;
  proyecto_id: string;
  odoo_id: string | null;
  odoo_url: string | null;
  eliminado_en: string | null;
};

function fakeRepository(current = { userId: 'user-a' }) {
  const projects: Project[] = [
    { id: 'p1', nombre: 'Formación', archivado_en: null, eliminado_en: null },
  ];
  const tasks: Task[] = [];
  let ids = 0;
  const later = <T>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 5));
  return {
    projects,
    tasks,
    current,
    loadProjects: (userId: string) => {
      if (userId !== current.userId) throw new Error('otra cuenta');
      return later(projects.map((p) => ({ ...p })));
    },
    loadTasks: (userId: string) => {
      if (userId !== current.userId) throw new Error('otra cuenta');
      return later(tasks.map((t) => ({ ...t })));
    },
    createProject: async (nombre: string, userId: string) => {
      if (userId !== current.userId) throw new Error('otra cuenta');
      const project = { id: `p${(ids += 1) + 1}`, nombre, archivado_en: null, eliminado_en: null };
      await later(null);
      projects.push(project);
      return project;
    },
    createTask: async (
      task: {
        proyecto_id: string;
        titulo: string;
        odoo_id: string | null;
        odoo_url: string | null;
      },
      userId: string,
    ) => {
      if (userId !== current.userId) throw new Error('otra cuenta');
      const created = { id: `t${(ids += 1)}`, eliminado_en: null, ...task };
      await later(null);
      tasks.push(created);
      return created;
    },
  };
}

const input = (extra: Partial<ImportInput> = {}): ImportInput => ({
  userId: 'user-a',
  detected: {
    origin: 'https://empresa.odoo.com',
    recordId: 9,
    url: 'https://empresa.odoo.com/odoo/project/1/tasks/9',
    title: 'Migrar datos',
    projectName: 'Formación',
    code: 'T9',
  },
  title: 'Migrar datos',
  choice: { kind: 'project', projectId: 'p1' },
  allowPossibleDuplicate: false,
  ...extra,
});

test('two simultaneous imports of the same Odoo task create it once', async () => {
  const repository = fakeRepository();
  const importTask = createImporter(repository);
  const [first, second] = await Promise.all([importTask(input()), importTask(input())]);
  assert.equal(repository.tasks.length, 1);
  assert.equal(first.kind, 'created');
  assert.equal(second.task.id, first.task.id);
  // Later imports see it as already imported.
  assert.equal((await importTask(input())).kind, 'existing');
  assert.equal(repository.tasks[0]!.odoo_id, 'T9');
  assert.equal(repository.tasks[0]!.odoo_url, 'https://empresa.odoo.com/odoo/project/1/tasks/9');
});

test('imports of different tasks run one after another and reuse a project created meanwhile', async () => {
  const repository = fakeRepository();
  const importTask = createImporter(repository);
  const other = input({
    detected: {
      ...input().detected,
      recordId: 10,
      url: 'https://empresa.odoo.com/odoo/project/1/tasks/10',
      code: 'T10',
    },
    choice: { kind: 'new-project', name: 'Cliente  Nuevo' },
  });
  const third = input({
    detected: {
      ...input().detected,
      recordId: 11,
      url: 'https://empresa.odoo.com/odoo/project/1/tasks/11',
      code: 'T11',
    },
    choice: { kind: 'new-project', name: 'cliente nuevo' },
  });
  await Promise.all([importTask(other), importTask(third)]);
  assert.equal(repository.projects.length, 2);
  assert.equal(repository.tasks.length, 2);
  assert.equal(repository.tasks[0]!.proyecto_id, repository.tasks[1]!.proyecto_id);
});

test('a code-only match needs an explicit confirmation', async () => {
  const repository = fakeRepository();
  repository.tasks.push({
    id: 'old',
    titulo: 'Antigua',
    proyecto_id: 'p1',
    odoo_id: 'T9',
    odoo_url: 'https://otra.odoo.com/odoo/project/1/tasks/9',
    eliminado_en: null,
  });
  const importTask = createImporter(repository);
  assert.equal((await importTask(input())).kind, 'possible-duplicate');
  assert.equal(repository.tasks.length, 1);
  assert.equal((await importTask(input({ allowPossibleDuplicate: true }))).kind, 'created');
  assert.equal(repository.tasks.length, 2);
});

test('a failed import does not block the next one', async () => {
  const repository = fakeRepository();
  const importTask = createImporter(repository);
  await assert.rejects(importTask(input({ choice: { kind: 'project', projectId: 'nope' } })));
  assert.equal((await importTask(input())).kind, 'created');
});

test('an import queued for one account never writes into another', async () => {
  const repository = fakeRepository();
  const importTask = createImporter(repository);
  const first = importTask(input({ choice: { kind: 'new-project', name: 'Cliente A' } }));
  // The user switches accounts while the import is still running.
  repository.current.userId = 'user-b';
  await assert.rejects(first);
  assert.equal(repository.tasks.length, 0);
  assert.equal(repository.projects.length, 1);
  // Same Odoo task requested by the other account is a different job.
  repository.current.userId = 'user-b';
  assert.equal((await importTask(input({ userId: 'user-b' }))).kind, 'created');
});
