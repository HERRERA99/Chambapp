import { useState } from 'react';
import type { FormEvent } from 'react';
import type { CalendarAbsence } from '../../domain/models';
import { validDateRange } from '../../domain/calendar';
import { InputField, SelectField } from '../../shared/ui/FormField';
import { Modal } from '../../shared/ui/Modal';
import { Button } from '../../shared/ui/Button';
import { useCommand } from '../workspace/useCommand';

export function AbsenceForm({
  absence,
  date,
  onClose,
}: {
  absence?: CalendarAbsence;
  date: string;
  onClose: () => void;
}) {
  const { run, pending } = useCommand();
  const [id] = useState(() => absence?.id ?? crypto.randomUUID());
  const [title, setTitle] = useState(absence?.titulo ?? '');
  const [type, setType] = useState(absence?.tipo ?? 'festivo');
  const [start, setStart] = useState(absence?.inicio ?? date);
  const [end, setEnd] = useState(absence?.fin ?? date);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !validDateRange(start, end)) {
      setError('Escribe un nombre y un intervalo de fechas válido.');
      return;
    }
    setError('');
    try {
      await run('guardar_ausencia', {
        id,
        ...(absence ? { version: absence.version } : {}),
        titulo: title.trim(),
        tipo: type,
        inicio: start,
        fin: end,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar.');
    }
  }
  return (
    <Modal
      open
      title={absence ? 'Editar día libre' : 'Añadir festivo o vacaciones'}
      onClose={() => {
        if (!pending) onClose();
      }}
      description="Los días incluidos tendrán objetivo cero. Las horas registradas se conservan."
    >
      <form className="form-stack" onSubmit={(event) => void submit(event)}>
        <InputField
          label="Nombre"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <SelectField
          label="Tipo"
          value={type}
          onChange={(e) => setType(e.target.value as CalendarAbsence['tipo'])}
        >
          <option value="festivo">Festivo</option>
          <option value="vacaciones">Vacaciones</option>
        </SelectField>
        <div className="form-grid">
          <InputField
            label="Desde (incluido)"
            type="date"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <InputField
            label="Hasta (incluido)"
            type="date"
            required
            min={start}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        {absence?.fuente === 'nager' ? (
          <p className="muted">Al editarlo se guardará como registro manual.</p>
        ) : null}
        {error ? (
          <p role="alert" className="form-error">
            {error}
          </p>
        ) : null}
        <div className="form-actions">
          <Button disabled={pending} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
