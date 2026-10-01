import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Project } from '../../../domain/models';
import { Button } from '../../../shared/ui/Button';
import { InputField } from '../../../shared/ui/FormField';
import { Modal } from '../../../shared/ui/Modal';
import { useFeedback } from '../../../shared/feedback/FeedbackContext';
import { useCommand } from '../../workspace/useCommand';

export function ProjectForm({ project, onClose }: { project?: Project; onClose: () => void }) {
  const { run, pending } = useCommand();
  const notify = useFeedback();
  const [name, setName] = useState(project?.nombre ?? '');
  const [client, setClient] = useState(project?.cliente ?? '');
  const [description, setDescription] = useState(project?.descripcion ?? '');
  const [budget, setBudget] = useState(
    project?.presupuesto_minutos != null ? String(project.presupuesto_minutos / 60) : '',
  );
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Escribe un nombre para el proyecto.');
      return;
    }
    const budgetMinutes = budget === '' ? null : Math.round(Number(budget) * 60);
    if (budgetMinutes !== null && (!Number.isFinite(budgetMinutes) || budgetMinutes < 0)) {
      setError('El presupuesto debe ser un número de horas igual o mayor que cero.');
      return;
    }
    try {
      await run(project ? 'editar_proyecto' : 'crear_proyecto', {
        ...(project ? { id: project.id, version: project.version } : {}),
        nombre: name.trim(),
        cliente: client.trim() || null,
        descripcion: description.trim() || null,
        presupuesto_minutos: budgetMinutes,
      });
      notify(project ? 'Proyecto actualizado.' : 'Proyecto creado.');
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el proyecto.');
    }
  }

  return (
    <Modal
      open
      onClose={() => {
        if (!pending) onClose();
      }}
      title={project ? 'Editar proyecto' : 'Nuevo proyecto'}
    >
      <form className="page-stack" onSubmit={submit}>
        <InputField
          label="Nombre del proyecto"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={200}
          required
          disabled={pending}
        />
        <InputField
          label="Cliente"
          value={client}
          onChange={(event) => setClient(event.target.value)}
          maxLength={200}
          disabled={pending}
        />
        <InputField
          label="Descripción"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={pending}
        />
        <InputField
          label="Presupuesto de horas"
          type="number"
          min="0"
          step="any"
          value={budget}
          onChange={(event) => setBudget(event.target.value)}
          hint="Opcional. Compara el tiempo imputado con la estimación del proyecto."
          disabled={pending}
        />
        {error ? (
          <p role="alert" className="warning">
            {error}
          </p>
        ) : null}
        <div className="actions">
          <Button onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Guardando…' : 'Guardar proyecto'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
