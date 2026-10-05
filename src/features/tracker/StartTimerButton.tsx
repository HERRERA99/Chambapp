import { useState } from 'react';
import type { FormEvent } from 'react';
import { DateTime } from 'luxon';
import { Button } from '../../shared/ui/Button';
import { Modal } from '../../shared/ui/Modal';
import { InputField, SelectField } from '../../shared/ui/FormField';
import { formatDate, formatTime, localDateTimeToIso } from '../../domain/time';
import { useWorkspace } from '../workspace/useWorkspace';
import { useTracker } from './useTracker';
import { readableError } from '../../lib/supabase/errors';

export function StartTimerButton({
  taskId,
  disabled = false,
}: {
  taskId?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const tracker = useTracker();
  return (
    <>
      <Button
        icon="clock"
        disabled={disabled || tracker.busy || tracker.pending || !!tracker.active}
        onClick={() => setOpen(true)}
      >
        Iniciar a otra hora
      </Button>
      {open ? <StartTimerForm taskId={taskId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function StartTimerForm({ taskId, onClose }: { taskId?: string; onClose: () => void }) {
  const { data } = useWorkspace();
  const tracker = useTracker();
  const zone = data!.profile.zona_horaria;
  const [now] = useState(() =>
    DateTime.fromISO(data!.serverTime)
      .plus({ milliseconds: Date.now() - data!.receivedAt })
      .setZone(zone),
  );
  const tasks = data!.tasks.filter(
    (task) =>
      !task.eliminado_en &&
      !task.archivado_en &&
      task.estado !== 'completada' &&
      data!.projects.some(
        (project) =>
          project.id === task.proyecto_id && !project.archivado_en && !project.eliminado_en,
      ),
  );
  const [selected, setSelected] = useState(taskId ?? tasks[0]?.id ?? '');
  const [date, setDate] = useState(now.toISODate()!);
  const [time, setTime] = useState(now.toFormat('HH:mm:ss'));
  const [lastEnd, setLastEnd] = useState<string | null>(null);
  const [error, setError] = useState('');
  const last = data!.entries
    .filter((entry) => entry.fin_en && !entry.eliminado_en)
    .sort((a, b) => Date.parse(b.fin_en!) - Date.parse(a.fin_en!))[0];
  const busy = tracker.busy || tracker.pending;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    try {
      if (!tasks.some((task) => task.id === selected))
        throw new Error('Selecciona una tarea activa para iniciar el parte.');
      const start = lastEnd ?? localDateTimeToIso(date, time, zone);
      await tracker.start(selected, start);
      onClose();
    } catch (cause) {
      setError(readableError(cause));
    }
  }
  return (
    <Modal
      open
      title="Iniciar parte a una hora seleccionada"
      description={`Hora exacta en ${zone}.`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="page-stack" onSubmit={submit}>
        <SelectField
          label="Tarea"
          value={selected}
          disabled={busy || !!taskId}
          required
          onChange={(event) => setSelected(event.target.value)}
        >
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {data!.projects.find((project) => project.id === task.proyecto_id)?.nombre} ·{' '}
              {task.titulo}
            </option>
          ))}
        </SelectField>
        <div className="form-grid">
          <InputField
            label="Fecha de inicio"
            type="date"
            required
            value={date}
            max={now.toISODate()!}
            disabled={busy}
            onChange={(event) => {
              setDate(event.target.value);
              setLastEnd(null);
            }}
          />
          <InputField
            label="Hora de inicio"
            type="time"
            step="1"
            required
            value={time}
            disabled={busy}
            onChange={(event) => {
              setTime(event.target.value);
              setLastEnd(null);
            }}
          />
        </div>
        <Button
          icon="clock"
          disabled={busy || !last}
          onClick={() => {
            const end = DateTime.fromISO(last!.fin_en!, { zone });
            setDate(end.toISODate()!);
            setTime(end.toFormat('HH:mm:ss'));
            setLastEnd(last!.fin_en!);
          }}
        >
          Usar fin del último parte
        </Button>
        {last ? (
          <p className="field__hint">
            Último fin: {formatDate(last.fin_en!, zone)} · {formatTime(last.fin_en!, zone)}
          </p>
        ) : (
          <p className="field__hint">Todavía no hay partes finalizados.</p>
        )}
        {error ? (
          <p role="alert" className="warning">
            {error}
          </p>
        ) : null}
        <div className="actions">
          <Button disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !selected}>
            {busy ? 'Guardando…' : 'Iniciar parte'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
