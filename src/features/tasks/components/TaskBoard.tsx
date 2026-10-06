import { useState } from 'react';
import type { Project, Task, TimeEntry } from '../../../domain/models';
import { formatDuration } from '../../../domain/time';
import { Badge, Progress } from '../../../shared/ui/Panel';
import { Button } from '../../../shared/ui/Button';
import { SelectField } from '../../../shared/ui/FormField';
import { Modal } from '../../../shared/ui/Modal';
import { useCommand } from '../../workspace/useCommand';
import { useTracker } from '../../tracker/useTracker';
import { StartTimerButton } from '../../tracker/StartTimerButton';
import { entryTotalsBy } from '../../time-entries/entryTotals';
import { TaskDetail } from './TaskDetail';
import { TaskForm } from './TaskForm';
import { OdooLink } from './OdooLink';
import { taskStatusLabels } from '../taskLabels';
import '../task-board.css';

const statuses: readonly Task['estado'][] = ['pendiente', 'en_curso', 'completada'];

export function TaskBoard({
  tasks,
  projects,
  entries,
  onCreate,
}: {
  tasks: Task[];
  projects: Project[];
  entries: TimeEntry[];
  onCreate: () => void;
}) {
  const { run, pending } = useCommand();
  const tracker = useTracker();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const totals = entryTotalsBy(entries, 'tarea_id');
  const selected = tasks.find((task) => task.id === selectedId);
  const editing = tasks.find((task) => task.id === editingId);
  const busy = pending || tracker.busy || tracker.pending;
  async function move(task: Task, status: Task['estado']) {
    if (busy || task.estado === status || !statuses.includes(status)) return;
    setError('');
    setMessage('');
    try {
      await run('editar_tarea', { id: task.id, version: task.version, estado: status });
      setMessage(`${task.titulo}: ${taskStatusLabels[status]}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo mover la tarea.');
    }
  }
  async function controlTimer(task: Task) {
    setError('');
    try {
      if (tracker.active?.tarea_id === task.id) await tracker.stop();
      else await tracker.start(task.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el cronómetro.');
    }
  }
  return (
    <>
      <p className="muted">
        Arrastra una tarjeta a otra columna o cambia su estado con el selector.
      </p>
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      <div className="task-board">
        {statuses.map((status) => {
          const columnTasks = tasks.filter((task) => task.estado === status);
          return (
            <section
              key={status}
              className={`task-board__column ${dragged ? 'task-board__column--droppable' : ''}`}
              aria-label={taskStatusLabels[status]}
              onDragOver={(event) => {
                if (dragged && !busy) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                const task = tasks.find(
                  (item) =>
                    item.id === dragged && item.id === event.dataTransfer.getData('text/plain'),
                );
                setDragged(null);
                if (task && !task.archivado_en && !projectById.get(task.proyecto_id)?.archivado_en)
                  void move(task, status);
              }}
            >
              <header>
                <h2>{taskStatusLabels[status]}</h2>
                <Badge>{columnTasks.length}</Badge>
              </header>
              <div className="task-board__cards">
                {columnTasks.map((task) => {
                  const total = totals.get(task.id);
                  const project = projectById.get(task.proyecto_id);
                  const blocked = !!task.archivado_en || !!project?.archivado_en;
                  const active = tracker.active?.tarea_id === task.id;
                  return (
                    <article
                      key={task.id}
                      className={`task-board__card ${active ? 'task-board__card--active' : ''}`}
                      draggable={!busy && !blocked}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', task.id);
                        event.dataTransfer.effectAllowed = 'move';
                        setDragged(task.id);
                      }}
                      onDragEnd={() => setDragged(null)}
                    >
                      <span className="eyebrow">{project?.nombre ?? 'Proyecto'}</span>
                      <button
                        type="button"
                        className="task-board__title"
                        onClick={() => setSelectedId(task.id)}
                      >
                        {task.titulo}
                      </button>
                      {task.descripcion ? (
                        <p className="muted task-board__description">{task.descripcion}</p>
                      ) : null}
                      {blocked ? <Badge>Archivada</Badge> : null}
                      {active ? <Badge tone="accent">Cronómetro activo</Badge> : null}
                      <p className="mono muted">
                        {formatDuration(total?.logged ?? 0)} /{' '}
                        {task.estimacion_minutos === null
                          ? 'Sin estimar'
                          : formatDuration(task.estimacion_minutos * 60)}
                      </p>
                      {task.estimacion_minutos && task.estimacion_minutos > 0 ? (
                        <Progress
                          label={`Estimación de ${task.titulo}`}
                          value={((total?.logged ?? 0) / (task.estimacion_minutos * 60)) * 100}
                        />
                      ) : null}
                      <OdooLink task={task} />
                      <SelectField
                        label={`Estado de ${task.titulo}`}
                        value={task.estado}
                        disabled={busy || blocked}
                        onChange={(event) => void move(task, event.target.value as Task['estado'])}
                      >
                        {statuses.map((value) => (
                          <option key={value} value={value}>
                            {taskStatusLabels[value]}
                          </option>
                        ))}
                      </SelectField>
                      <div className="actions task-board__controls">
                        <Button icon="edit" disabled={busy} onClick={() => setEditingId(task.id)}>
                          Editar
                        </Button>
                        <Button onClick={() => setSelectedId(task.id)}>Detalles</Button>
                        {!blocked ? (
                          <Button
                            icon={active ? 'stop' : 'play'}
                            disabled={
                              busy ||
                              (!active && (!!tracker.active || task.estado === 'completada'))
                            }
                            onClick={() => void controlTimer(task)}
                          >
                            {active ? 'Detener' : 'Iniciar'}
                          </Button>
                        ) : null}
                        {!blocked && !active && task.estado !== 'completada' ? (
                          <StartTimerButton disabled={pending} taskId={task.id} />
                        ) : null}
                      </div>
                    </article>
                  );
                })}
                {!columnTasks.length ? (
                  <p className="task-board__empty muted">Sin tareas en esta columna.</p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
      {!tasks.length ? (
        <Button icon="plus" onClick={onCreate}>
          Crear tarea
        </Button>
      ) : null}
      {selected ? (
        <Modal open title="Detalle de tarea" onClose={() => setSelectedId(null)}>
          <TaskDetail
            key={selected.id}
            task={selected}
            projects={projects}
            entries={entries.filter((entry) => entry.tarea_id === selected.id)}
          />
        </Modal>
      ) : null}
      {editing ? (
        <TaskForm
          key={`${editing.id}:${editing.version}`}
          task={editing}
          projects={projects}
          onClose={() => setEditingId(null)}
        />
      ) : null}
    </>
  );
}
