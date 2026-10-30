import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Project, Task } from '../../../domain/models';
import { normalizeOdooId, normalizeOdooUrl } from '../../../domain/odoo';
import { Button } from '../../../shared/ui/Button';
import { InputField, SelectField } from '../../../shared/ui/FormField';
import { Modal } from '../../../shared/ui/Modal';
import { useFeedback } from '../../../shared/feedback/FeedbackContext';
import { useCommand } from '../../workspace/useCommand';
import { taskStatusLabels } from '../taskLabels';

export function TaskForm({
  task,
  projects,
  projectId,
  onClose,
}: {
  task?: Task;
  projects: Project[];
  projectId?: string | null;
  onClose: () => void;
}) {
  const { run, pending } = useCommand();
  const notify = useFeedback();
  const available = projects.filter(
    (project) =>
      !project.eliminado_en && (!project.archivado_en || project.id === task?.proyecto_id),
  );
  const [project, setProject] = useState(
    task?.proyecto_id ??
      available.find((item) => item.id === projectId)?.id ??
      available[0]?.id ??
      '',
  );
  const [title, setTitle] = useState(task?.titulo ?? '');
  const [description, setDescription] = useState(task?.descripcion ?? '');
  const [odooId, setOdooId] = useState(task?.odoo_id ?? '');
  const [odooUrl, setOdooUrl] = useState(task?.odoo_url ?? '');
  const [status, setStatus] = useState<Task['estado']>(task?.estado ?? 'pendiente');
  const [estimate, setEstimate] = useState(
    task?.estimacion_minutos != null ? String(task.estimacion_minutos / 60) : '',
  );
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const minutes = estimate === '' ? null : Math.round(Number(estimate) * 60);
    if (!title.trim() || !project) {
      setError('Selecciona un proyecto y escribe el nombre de la tarea.');
      return;
    }
    if (minutes !== null && (!Number.isFinite(minutes) || minutes < 0)) {
      setError('La estimación debe ser igual o mayor que cero.');
      return;
    }
    try {
      await run(task ? 'editar_tarea' : 'crear_tarea', {
        ...(task ? { id: task.id, version: task.version } : {}),
        proyecto_id: project,
        titulo: title.trim(),
        descripcion: description.trim() || null,
        odoo_id: normalizeOdooId(odooId),
        odoo_url: normalizeOdooUrl(odooUrl),
        estado: status,
        estimacion_minutos: minutes,
      });
      notify(task ? 'Tarea actualizada.' : 'Tarea creada.', 'success');
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la tarea.');
    }
  }

  return (
    <Modal
      open
      onClose={() => {
        if (!pending) onClose();
      }}
      title={task ? 'Editar o mover tarea' : 'Nueva tarea'}
    >
      <form className="page-stack" onSubmit={submit}>
        <InputField
          label="Nombre de la tarea"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={300}
          required
          disabled={pending}
        />
        <SelectField
          label="Proyecto"
          value={project}
          onChange={(event) => setProject(event.target.value)}
          required
          disabled={pending}
          hint={
            task
              ? 'Cambiar el proyecto también mueve la atribución de todas las horas históricas de esta tarea.'
              : undefined
          }
        >
          <option value="" disabled>
            Selecciona un proyecto
          </option>
          {available.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nombre}
              {item.archivado_en ? ' (archivado)' : ''}
            </option>
          ))}
        </SelectField>
        <InputField
          label="Descripción"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={pending}
        />
        <div className="form-grid">
          <InputField
            label="ID de Odoo (opcional)"
            value={odooId}
            onChange={(event) => setOdooId(event.target.value)}
            onBlur={() => setOdooId(odooId.trim().toUpperCase())}
            placeholder="T443212"
            hint="T seguida de números. Puedes dejarlo vacío."
            maxLength={64}
            autoCapitalize="characters"
            spellCheck={false}
            disabled={pending}
          />
          <InputField
            label="Enlace a la tarea de Odoo (opcional)"
            type="url"
            value={odooUrl}
            onChange={(event) => setOdooUrl(event.target.value)}
            placeholder="https://odoo.example.com/…"
            hint="Se mostrará también en sus partes de horas."
            maxLength={2048}
            spellCheck={false}
            disabled={pending}
          />
        </div>
        <div className="form-grid">
          <InputField
            label="Estimación (horas)"
            type="number"
            min="0"
            step="any"
            value={estimate}
            onChange={(event) => setEstimate(event.target.value)}
            disabled={pending}
          />
          <SelectField
            label="Estado"
            value={status}
            onChange={(event) => setStatus(event.target.value as Task['estado'])}
            disabled={pending}
          >
            {Object.entries(taskStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
        </div>
        {task && project !== task.proyecto_id ? (
          <p className="warning">
            Al guardar, todas las horas registradas se asociarán al nuevo proyecto.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="warning">
            {error}
          </p>
        ) : null}
        <div className="actions">
          <Button onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending || !project}>
            {pending ? 'Guardando…' : 'Guardar tarea'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
