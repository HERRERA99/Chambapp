import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Workday } from '../../../domain/models';
import { formatDate, formatDuration } from '../../../domain/time';
import { Button } from '../../../shared/ui/Button';
import { InputField } from '../../../shared/ui/FormField';
import { Modal } from '../../../shared/ui/Modal';
import { Notice } from '../../../shared/ui/Panel';
import { useCommand } from '../../workspace/useCommand';

export function DayGoalModal({ jornada, onClose }: { jornada: Workday; onClose: () => void }) {
  const [hours, setHours] = useState(String(Math.floor(jornada.minutos_objetivo / 60)));
  const [minutes, setMinutes] = useState(String(jornada.minutos_objetivo % 60));
  const [error, setError] = useState<string | null>(null);
  const { run, pending } = useCommand();
  const targetMinutes = Number(hours) * 60 + Number(minutes);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !Number.isInteger(Number(hours)) ||
      !Number.isInteger(Number(minutes)) ||
      Number(hours) < 0 ||
      Number(minutes) < 0 ||
      Number(minutes) > 59 ||
      !Number.isSafeInteger(targetMinutes) ||
      targetMinutes > 2147483647
    ) {
      setError('Introduce horas enteras y minutos entre 0 y 59.');
      return;
    }
    setError(null);
    try {
      await run('editar_jornada', {
        id: jornada.id,
        version: jornada.version,
        minutos_objetivo: targetMinutes,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el objetivo.');
    }
  }
  return (
    <Modal
      open
      onClose={() => {
        if (!pending) onClose();
      }}
      title="Editar objetivo diario"
      description={formatDate(jornada.fecha, jornada.zona_horaria)}
    >
      <form onSubmit={save} className="page-stack">
        <div className="form-grid">
          <InputField
            label="Horas"
            type="number"
            min="0"
            step="1"
            required
            value={hours}
            disabled={pending}
            onChange={(event) => setHours(event.target.value)}
          />
          <InputField
            label="Minutos"
            type="number"
            min="0"
            max="59"
            step="1"
            required
            value={minutes}
            disabled={pending}
            onChange={(event) => setMinutes(event.target.value)}
          />
        </div>
        <p className="muted">
          Objetivo: {formatDuration(Number.isFinite(targetMinutes) ? targetMinutes * 60 : 0)}. Este
          ajuste afecta a esta jornada; el reparto semanal se conserva.
        </p>
        {error ? <Notice title="No se ha guardado">{error}</Notice> : null}
        <div className="actions">
          <Button onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Guardando…' : 'Guardar objetivo'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
