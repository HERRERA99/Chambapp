import type { TimeEntry, WorkspaceData } from '../../../domain/models';
import { formatClock, roundDuration } from '../../../domain/time';
import { Modal } from '../../../shared/ui/Modal';
import { Button } from '../../../shared/ui/Button';
import { InputField, SelectField } from '../../../shared/ui/FormField';
import { Notice } from '../../../shared/ui/Panel';
import { useWorkspace } from '../../workspace/useWorkspace';
import { useEntryEditor } from './useEntryEditor';

export type EntryModalProps = {
  open: boolean;
  onClose: () => void;
  entry?: TimeEntry | null;
  taskId?: string;
  date?: string;
};

export function EntryModal({ open, ...props }: EntryModalProps) {
  const { data } = useWorkspace();
  if (!open || !data) return null;
  return (
    <EntryEditor
      key={props.entry?.id ?? `new-${props.taskId ?? ''}-${props.date ?? ''}`}
      {...props}
      data={data}
    />
  );
}

function EntryEditor({
  data,
  entry,
  taskId,
  date,
  onClose,
}: Omit<EntryModalProps, 'open'> & { data: WorkspaceData }) {
  const editor = useEntryEditor({ data, entry, taskId, date, onClose });
  const projects = data.projects.filter(
    (project) =>
      !project.eliminado_en &&
      editor.availableTasks.some((task) => task.proyecto_id === project.id),
  );
  return (
    <Modal
      open
      onClose={() => {
        if (!editor.pending) onClose();
      }}
      title={entry ? 'Editar parte de horas' : 'Nuevo parte manual'}
      description={`Introduce horas exactas en ${editor.zone}. El redondeo solo modifica la duración imputada.`}
    >
      {entry && !entry.fin_en ? (
        <Notice title="Cronómetro activo">Detén el cronómetro antes de editar su intervalo.</Notice>
      ) : (
        <form className="page-stack" onSubmit={editor.submit}>
          <SelectField
            label="Proyecto"
            value={editor.projectId}
            onChange={(event) => editor.updateProject(event.target.value)}
            required
            disabled={editor.pending}
          >
            <option value="" disabled>
              Selecciona un proyecto
            </option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.nombre}
                {project.archivado_en ? ' (archivado)' : ''}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Tarea"
            value={editor.selectedTask}
            onChange={(event) => editor.setSelectedTask(event.target.value)}
            required
            disabled={editor.pending}
          >
            <option value="" disabled>
              Selecciona una tarea
            </option>
            {editor.availableTasks
              .filter((task) => task.proyecto_id === editor.projectId)
              .map((task) => (
                <option key={task.id} value={task.id}>
                  {task.titulo}
                  {task.archivado_en ? ' (archivada)' : ''}
                </option>
              ))}
          </SelectField>
          <div className="form-grid">
            <InputField
              label="Fecha de inicio"
              type="date"
              value={editor.startDate}
              onChange={(event) => editor.updateStartDate(event.target.value)}
              required
              disabled={editor.pending}
            />
            <InputField
              label="Fecha de fin"
              type="date"
              value={editor.endDate}
              onChange={(event) => editor.setEndDate(event.target.value)}
              required
              disabled={editor.pending}
            />
            <InputField
              label="Hora exacta de inicio"
              type="time"
              step="1"
              value={editor.startTime}
              onChange={(event) => editor.setStartTime(event.target.value)}
              required
              disabled={editor.pending}
            />
            <InputField
              label="Hora exacta de fin"
              type="time"
              step="1"
              value={editor.endTime}
              onChange={(event) => editor.setEndTime(event.target.value)}
              required
              disabled={editor.pending}
            />
          </div>
          <InputField
            label="Descripción"
            value={editor.description}
            onChange={(event) => editor.setDescription(event.target.value)}
            placeholder="¿En qué has trabajado?"
            disabled={editor.pending}
          />
          <Notice
            title={
              editor.interval
                ? `Duración redondeada a ${editor.interval} minutos`
                : 'Duración sin redondeo'
            }
          >
            {editor.duration !== null ? (
              <span className="mono">
                Real: {formatClock(editor.duration)} → Imputada:{' '}
                {formatClock(roundDuration(editor.duration, editor.interval))}
              </span>
            ) : (
              'El inicio y el fin se guardan exactamente como los introduces.'
            )}
            {entry ? (
              <p className="field__hint">Se conserva la regla de redondeo original del registro.</p>
            ) : null}
          </Notice>
          {editor.targetZone ? (
            <label className="warning">
              <input
                type="checkbox"
                checked={editor.acceptZone}
                onChange={(event) => editor.setAcceptZone(event.target.checked)}
                disabled={editor.pending}
              />{' '}
              Confirmo que el parte se trasladará a una jornada con zona {editor.targetZone},
              conservando los instantes exactos.
            </label>
          ) : null}
          {editor.error ? (
            <p role="alert" className="warning">
              {editor.error}
            </p>
          ) : null}
          {!editor.availableTasks.length ? (
            <p className="muted">Crea un proyecto y una tarea activos para registrar horas.</p>
          ) : null}
          <div className="actions">
            <Button onClick={onClose} disabled={editor.pending}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={
                editor.pending ||
                !editor.selectedTask ||
                (!!editor.targetZone && !editor.acceptZone)
              }
            >
              {editor.pending ? 'Guardando…' : 'Guardar parte'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
