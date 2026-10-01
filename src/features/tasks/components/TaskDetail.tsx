import { useState } from 'react';
import type { Project, Task, TimeEntry } from '../../../domain/models';
import { formatDuration, formatTime, formatClock } from '../../../domain/time';
import { Panel, Badge, Progress } from '../../../shared/ui/Panel';
import { Button } from '../../../shared/ui/Button';
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog';
import { useFeedback } from '../../../shared/feedback/FeedbackContext';
import { useCommand } from '../../workspace/useCommand';
import { useTracker } from '../../tracker/useTracker';
import { entryTotals } from '../../time-entries/entryTotals';
import { EntryModal } from '../../time-entries/components/EntryModal';
import { TaskForm } from './TaskForm';
import { TaskEntries } from './TaskEntries';
import { taskStatusLabels } from '../taskLabels';

export function TaskDetail({
  task,
  projects,
  entries,
}: {
  task: Task;
  projects: Project[];
  entries: TimeEntry[];
}) {
  const { run, pending } = useCommand();
  const tracker = useTracker();
  const notify = useFeedback();
  const [editing, setEditing] = useState<Task | null>(null);
  const [entryForm, setEntryForm] = useState<TimeEntry | 'new' | null>(null);
  const [confirmation, setConfirmation] = useState<{
    kind: 'archive' | 'delete';
    task: Task;
  } | null>(null);
  const [error, setError] = useState('');
  const project = projects.find((item) => item.id === task.proyecto_id);
  const totals = entryTotals(entries);
  const estimate = (task.estimacion_minutos ?? 0) * 60;
  const progress = estimate > 0 ? (totals.logged / estimate) * 100 : 0;
  const active = tracker.active?.tarea_id === task.id ? tracker.active : null;
  const blocked = !!task.archivado_en || !!project?.archivado_en;
  const busy = pending || tracker.busy || tracker.pending;

  async function updateStatus() {
    setError('');
    try {
      await run('editar_tarea', {
        id: task.id,
        version: task.version,
        estado: task.estado === 'completada' ? 'pendiente' : 'completada',
      });
      notify(task.estado === 'completada' ? 'Tarea reabierta.' : 'Tarea completada.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el estado.');
    }
  }

  async function controlTimer() {
    setError('');
    try {
      if (active) await tracker.stop();
      else await tracker.start(task.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el cronómetro.');
    }
  }

  async function confirm() {
    if (!confirmation) return;
    await run(confirmation.kind === 'delete' ? 'eliminar_tarea' : 'editar_tarea', {
      id: confirmation.task.id,
      version: confirmation.task.version,
      ...(confirmation.kind === 'delete'
        ? { confirmar_cascada: true }
        : { archivado: !confirmation.task.archivado_en }),
    });
    notify(
      confirmation.kind === 'delete'
        ? 'Tarea y sus partes eliminados.'
        : confirmation.task.archivado_en
          ? 'Tarea restaurada.'
          : 'Tarea archivada.',
    );
    setConfirmation(null);
  }

  return (
    <div className="page-stack">
      <Panel className="task-detail">
        <div className="actions">
          <Badge tone={task.estado === 'completada' ? 'success' : 'accent'}>
            {taskStatusLabels[task.estado]}
          </Badge>
          {task.archivado_en ? <Badge>Archivada</Badge> : null}
          {project?.archivado_en ? <Badge>Proyecto archivado</Badge> : null}
        </div>
        <h2 className="task-detail__title">{task.titulo}</h2>
        <p className="muted">{project?.nombre ?? 'Proyecto no disponible'}</p>
        {task.descripcion ? <p className="muted section-intro">{task.descripcion}</p> : null}
        <div className="task-detail__actions">
          <Button
            icon={active ? 'stop' : 'play'}
            variant="primary"
            disabled={
              busy || (!active && (blocked || !!tracker.active || task.estado === 'completada'))
            }
            onClick={() => void controlTimer()}
          >
            {active ? 'Detener' : 'Iniciar cronómetro'}
          </Button>
          <Button
            icon="check"
            disabled={busy || !!active || blocked}
            onClick={() => void updateStatus()}
          >
            {task.estado === 'completada' ? 'Reabrir' : 'Completar'}
          </Button>
          <Button icon="edit" disabled={busy || !!active} onClick={() => setEditing(task)}>
            Editar / Mover
          </Button>
          <Button
            icon="folder"
            disabled={busy || !!active || (!task.archivado_en && !!project?.archivado_en)}
            onClick={() => setConfirmation({ kind: 'archive', task })}
          >
            {task.archivado_en ? 'Desarchivar' : 'Archivar'}
          </Button>
          <Button
            icon="trash"
            variant="danger"
            disabled={busy || !!active}
            onClick={() => setConfirmation({ kind: 'delete', task })}
          >
            Eliminar
          </Button>
        </div>
        {error ? (
          <p role="alert" className="warning">
            {error}
          </p>
        ) : null}
        {tracker.active && !active ? (
          <p className="field__hint">Detén el cronómetro de la otra tarea antes de iniciar esta.</p>
        ) : null}
        <div className="task-metrics">
          <div>
            <span className="eyebrow">Estimación</span>
            <strong>
              {task.estimacion_minutos !== null ? formatDuration(estimate) : 'Sin estimar'}
            </strong>
            <span className="dim">Objetivo de la tarea</span>
          </div>
          <div>
            <span className="eyebrow">Tiempo real</span>
            <strong>{formatDuration(totals.real)}</strong>
            <span className="dim">Partes finalizados</span>
          </div>
          <div>
            <span className="eyebrow">Tiempo imputado</span>
            <strong className="accent">{formatDuration(totals.logged)}</strong>
            <span className="dim">Duraciones redondeadas</span>
          </div>
          <div>
            <span className="eyebrow">Consumo estimado</span>
            <strong>{estimate > 0 ? `${Math.round(progress)}%` : '—'}</strong>
            <span className="dim">{totals.count} partes finalizados</span>
          </div>
        </div>
        {estimate > 0 ? (
          <>
            <div className="split-label">
              <span>Tiempo imputado frente a la estimación</span>
              <span className="mono">{Math.round(progress)}%</span>
            </div>
            <Progress
              value={progress}
              label={`Estimación consumida de ${task.titulo}`}
              tone={progress > 100 ? 'warning' : 'accent'}
            />
          </>
        ) : null}
        {active ? (
          <div className="task-live">
            <span className="status-dot" />
            <div>
              <strong>Cronómetro en esta tarea</strong>
              <p className="muted">
                Inicio exacto: {formatTime(active.inicio_en, active.zona_horaria)}
              </p>
            </div>
            <strong className="mono accent">{formatClock(tracker.elapsedSeconds)}</strong>
          </div>
        ) : null}
      </Panel>
      <TaskEntries
        entries={entries}
        elapsedSeconds={tracker.elapsedSeconds}
        canCreate={!blocked && !busy}
        onCreate={() => setEntryForm('new')}
        onEdit={setEntryForm}
      />
      {editing ? (
        <TaskForm task={editing} projects={projects} onClose={() => setEditing(null)} />
      ) : null}
      {entryForm ? (
        <EntryModal
          open
          entry={entryForm === 'new' ? undefined : entryForm}
          taskId={task.id}
          onClose={() => setEntryForm(null)}
        />
      ) : null}
      <ConfirmDialog
        key={confirmation ? `${confirmation.task.id}-${confirmation.kind}` : 'closed'}
        open={confirmation !== null}
        title={
          confirmation?.kind === 'delete'
            ? 'Eliminar tarea y sus partes'
            : task.archivado_en
              ? 'Desarchivar tarea'
              : 'Archivar tarea'
        }
        description={
          confirmation?.kind === 'delete'
            ? `Se eliminarán «${task.titulo}» y sus ${entries.length} partes de todos los informes.`
            : 'El historial se conserva. Una tarea archivada no admite nuevas sesiones.'
        }
        danger={confirmation?.kind === 'delete'}
        busy={pending}
        confirmLabel={
          confirmation?.kind === 'delete'
            ? 'Eliminar tarea y partes'
            : task.archivado_en
              ? 'Desarchivar'
              : 'Archivar'
        }
        onClose={() => {
          if (!pending) setConfirmation(null);
        }}
        onConfirm={confirm}
      />
    </div>
  );
}
