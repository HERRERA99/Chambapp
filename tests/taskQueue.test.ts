import assert from 'node:assert/strict';
import test from 'node:test';
import type { Project, Task } from '../src/domain/models.ts';
import { paginate, pickFocus, taskQueue } from '../src/features/tasks/taskQueue.ts';

const projects = [
  { id: 'p1', nombre: 'Cliente Uno', archivado_en: null },
  { id: 'p2', nombre: 'Archivado', archivado_en: '2026-10-01T00:00:00Z' },
] as Project[];

function task(id: string, estado: Task['estado'], day: string, extra: Partial<Task> = {}) {
  return {
    id,
    titulo: `Tarea ${id}`,
    descripcion: null,
    odoo_id: null,
    proyecto_id: 'p1',
    estado,
    actualizado_en: `2026-10-${day}T00:00:00Z`,
    archivado_en: null,
    eliminado_en: null,
    ...extra,
  } as Task;
}

const tasks = [
  task('c1', 'en_curso', '10'),
  task('c2', 'en_curso', '12'),
  task('p1', 'pendiente', '15'),
  task('p2', 'pendiente', '11', { odoo_id: 'T42' }),
  task('done', 'completada', '20', { titulo: 'Exportación antigua' }),
  task('arch', 'pendiente', '19', { archivado_en: '2026-10-19T00:00:00Z' }),
  task('archproj', 'en_curso', '18', { proyecto_id: 'p2' }),
  task('deleted', 'en_curso', '25', { eliminado_en: '2026-10-25T00:00:00Z' }),
];

const base = { tasks, projects, query: '', projectId: null };
const ids = (list: readonly Task[]) => list.map((item) => item.id);

test('splits active in-progress and pending tasks from hidden ones, newest first', () => {
  const queue = taskQueue(base);
  assert.deepEqual(ids(queue.inProgress), ['c2', 'c1']);
  assert.deepEqual(ids(queue.pending), ['p1', 'p2']);
  assert.deepEqual(ids(queue.active).sort(), ['c1', 'c2', 'p1', 'p2']);
  // Completed, archived and tasks of archived projects; deleted tasks never appear.
  assert.deepEqual(ids(queue.hidden), ['done', 'arch', 'archproj']);
});

test('search finds hidden tasks too (title, Odoo ID, project) and respects the project', () => {
  const byTitle = taskQueue({ ...base, query: 'exportación' });
  assert.deepEqual(byTitle.active, []);
  assert.deepEqual(ids(byTitle.hidden), ['done']);
  assert.deepEqual(ids(taskQueue({ ...base, query: 't42' }).pending), ['p2']);
  assert.equal(taskQueue({ ...base, query: ' cliente uno ' }).active.length, 4);
  const archivedProject = taskQueue({ ...base, projectId: 'p2' });
  assert.deepEqual(archivedProject.active, []);
  assert.deepEqual(ids(archivedProject.hidden), ['archproj']);
});

test('paginates with clamped page numbers', () => {
  const list = Array.from({ length: 32 }, (_, index) => index);
  assert.deepEqual(paginate(list, 1, 15), {
    items: list.slice(0, 15),
    page: 1,
    pages: 3,
  });
  assert.deepEqual(paginate(list, 3, 15).items, [30, 31]);
  assert.equal(paginate(list, 9, 15).page, 3);
  assert.equal(paginate(list, 0, 15).page, 1);
  assert.deepEqual(paginate([], 4, 15), { items: [], page: 1, pages: 1 });
});

test('focus priority: active selection, running timer, newest in progress, newest pending', () => {
  const queue = taskQueue(base);
  assert.equal(pickFocus({ queue, selectedId: 'p2', activeTaskId: 'c1', tasks })?.id, 'p2');
  // Hidden tasks open in a popup; they never take the focus.
  assert.equal(pickFocus({ queue, selectedId: 'done', activeTaskId: 'c1', tasks })?.id, 'c1');
  assert.equal(pickFocus({ queue, selectedId: 'done', activeTaskId: null, tasks })?.id, 'c2');
  const withoutProgress = tasks.filter((item) => item.estado !== 'en_curso');
  const pendingOnly = taskQueue({ ...base, tasks: withoutProgress });
  assert.equal(
    pickFocus({ queue: pendingOnly, selectedId: null, activeTaskId: null, tasks })?.id,
    'p1',
  );
  const none = taskQueue({ ...base, tasks: [] });
  assert.equal(
    pickFocus({ queue: none, selectedId: null, activeTaskId: null, tasks: [] }),
    undefined,
  );
});
