import { useState } from 'react';
import type { FormEvent } from 'react';
import { DateTime } from 'luxon';
import type { Attendance, WorkspaceData } from '../../domain/models';
import { localDateTimeToIso } from '../../domain/time';
import { DataError, readableError } from '../../lib/supabase/errors';
import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { Modal } from '../../shared/ui/Modal';
import { Button } from '../../shared/ui/Button';
import { InputField } from '../../shared/ui/FormField';
import { Notice } from '../../shared/ui/Panel';
import { useAttendance } from './useAttendance';
import { formatAttendanceDuration } from './attendanceLabels';

export function AttendanceEditor({
  data,
  record,
  date,
  mode = record ? 'edit' : 'interval',
  onClose,
}: {
  data: WorkspaceData;
  record?: Attendance;
  date: string;
  mode?: 'entry' | 'exit' | 'edit' | 'interval';
  onClose: () => void;
}) {
  const attendance = useAttendance();
  const notify = useFeedback();
  const zone = record?.zona_horaria ?? data.profile.zona_horaria;
  const initialStart = record ? DateTime.fromISO(record.inicio_en, { zone }) : null;
  const initialEnd = record?.fin_en ? DateTime.fromISO(record.fin_en, { zone }) : null;
  const today = DateTime.fromISO(attendance.now, { zone });
  const [id] = useState(() => record?.id ?? crypto.randomUUID());
  const [startDate, setStartDate] = useState(initialStart?.toISODate() ?? date);
  const [endDate, setEndDate] = useState(
    initialEnd?.toISODate() ?? (mode === 'exit' ? today.toISODate()! : date),
  );
  const [startTime, setStartTime] = useState(initialStart?.toFormat('HH:mm:ss') ?? '');
  const [endTime, setEndTime] = useState(initialEnd?.toFormat('HH:mm:ss') ?? '');
  const [openEntry, setOpenEntry] = useState(
    mode === 'entry' || (mode === 'edit' && !!record && !record.fin_en),
  );
  const [error, setError] = useState('');
  const [targetZone, setTargetZone] = useState<string | null>(null);
  const [acceptZone, setAcceptZone] = useState(false);
  const blocked = attendance.busy || attendance.pending;
  const anotherEntryOpen = !!attendance.active && attendance.active.id !== record?.id;

  function exactStart() {
    return record &&
      startDate === initialStart?.toISODate() &&
      startTime === initialStart?.toFormat('HH:mm:ss')
      ? record.inicio_en
      : localDateTimeToIso(startDate, startTime, zone);
  }
  function exactEnd() {
    if (openEntry) return null;
    return record?.fin_en &&
      endDate === initialEnd?.toISODate() &&
      endTime === initialEnd?.toFormat('HH:mm:ss')
      ? record.fin_en
      : localDateTimeToIso(endDate, endTime, zone);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      const start = exactStart();
      const end = exactEnd();
      if (!end && anotherEntryOpen)
        throw new Error('Ya hay una jornada en curso. Introduce la salida del fichaje anterior.');
      if (Date.parse(start) > Date.parse(attendance.now))
        throw new Error('La entrada no puede estar en el futuro.');
      const unchangedInterval = record && start === record.inicio_en && end === record.fin_en;
      // An existing valid interval may contain microseconds beyond Date.parse precision.
      if (end && !unchangedInterval && Date.parse(end) <= Date.parse(start))
        throw new Error('La salida debe ser posterior a la entrada.');
      if (end && Date.parse(end) > Date.parse(attendance.now))
        throw new Error('La salida no puede estar en el futuro.');
      if (targetZone && !acceptZone) throw new Error('Confirma la zona de la jornada de destino.');
      await attendance.perform({
        action: record ? 'editar_fichaje' : 'crear_fichaje',
        payload: {
          id,
          ...(record ? { version: record.version } : {}),
          inicio_en: start,
          fin_en: end,
          ...(targetZone && acceptZone ? { confirmar_zona: targetZone } : {}),
        },
      });
      notify(
        mode === 'entry'
          ? 'Entrada guardada. Puedes fichar la salida más tarde.'
          : mode === 'exit'
            ? 'Salida guardada.'
            : record
              ? 'Fichaje actualizado.'
              : 'Fichaje creado.',
        'success',
      );
      onClose();
    } catch (cause) {
      const raw = cause instanceof DataError ? (cause.rawMessage ?? cause.message) : '';
      const nextZone = raw.match(/CONFIRMAR_CAMBIO_ZONA:([^\s]+)/)?.[1];
      if (nextZone) {
        setTargetZone(nextZone);
        setAcceptZone(false);
      }
      setError(readableError(cause));
    }
  }

  let duration: number | null = null;
  try {
    const seconds = (Date.parse(exactEnd() ?? attendance.now) - Date.parse(exactStart())) / 1000;
    if (seconds > 0 && Number.isFinite(seconds)) duration = seconds;
  } catch {
    /* An incomplete input is validated on submit. */
  }

  return (
    <Modal
      open
      title={
        mode === 'entry'
          ? 'Entrada manual'
          : mode === 'exit'
            ? 'Salida manual'
            : record
              ? 'Editar entrada y salida'
              : 'Registrar tramo completo'
      }
      description={
        mode === 'entry'
          ? `Introduce tu hora de entrada en ${zone}. La salida queda pendiente hasta que la fiches.`
          : mode === 'exit'
            ? `Introduce tu hora de salida en ${zone} para cerrar la entrada guardada.`
            : `Introduce los instantes exactos en ${zone}. Puedes registrar varias sesiones al día.`
      }
      onClose={() => {
        if (!attendance.busy) onClose();
      }}
    >
      <form className="page-stack" onSubmit={submit}>
        {mode === 'exit' ? (
          <Notice title="Entrada guardada">
            <span className="mono">{initialStart?.toFormat('dd/MM/yyyy · HH:mm:ss')}</span>
            {' · '}
            {zone}
          </Notice>
        ) : (
          <div className="form-grid">
            <InputField
              label="Fecha de entrada"
              type="date"
              required
              max={today.toISODate()!}
              value={startDate}
              disabled={blocked}
              onChange={(event) => {
                setStartDate(event.target.value);
                setTargetZone(null);
                setAcceptZone(false);
              }}
            />
            <InputField
              label="Hora de entrada"
              type="time"
              step="1"
              required
              value={startTime}
              disabled={blocked}
              onChange={(event) => setStartTime(event.target.value)}
            />
          </div>
        )}
        {mode === 'edit' || mode === 'interval' ? (
          <label className="attendance-editor__open">
            <input
              type="checkbox"
              checked={openEntry}
              disabled={blocked || anotherEntryOpen}
              onChange={(event) => setOpenEntry(event.target.checked)}
            />
            Salida pendiente: seguir dentro hasta fichar la salida
          </label>
        ) : null}
        {anotherEntryOpen && mode === 'interval' ? (
          <Notice title="Jornada en curso">
            Registra la entrada y la salida del día anterior. Tu jornada actual seguirá en curso.
          </Notice>
        ) : null}
        {!openEntry ? (
          <div className="form-grid">
            <InputField
              label="Fecha de salida"
              type="date"
              required
              max={today.toISODate()!}
              value={endDate}
              disabled={blocked}
              onChange={(event) => setEndDate(event.target.value)}
            />
            <InputField
              label="Hora de salida"
              type="time"
              step="1"
              required
              value={endTime}
              disabled={blocked}
              onChange={(event) => setEndTime(event.target.value)}
            />
          </div>
        ) : (
          <Notice title="Entrada abierta">
            La duración será provisional hasta guardar una salida, manualmente o con Fichar salida.
          </Notice>
        )}
        <Notice title={openEntry ? 'Duración provisional' : 'Duración exacta, sin redondeo'}>
          {duration === null ? (
            openEntry ? (
              'Completa la hora de entrada.'
            ) : (
              'Completa la entrada y la salida.'
            )
          ) : (
            <span className="mono">{formatAttendanceDuration(duration)}</span>
          )}
        </Notice>
        {targetZone ? (
          <label className="warning">
            <input
              type="checkbox"
              checked={acceptZone}
              disabled={blocked}
              onChange={(event) => setAcceptZone(event.target.checked)}
            />{' '}
            Confirmo que el fichaje se trasladará a una jornada con zona {targetZone}, conservando
            los instantes exactos.
          </label>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {attendance.pending ? (
          <Notice title="Fichaje pendiente de confirmar">
            El intento se conserva con sus horas originales. Reintenta para comprobar el resultado
            antes de hacer cambios.
            <Button
              disabled={attendance.busy}
              onClick={() =>
                void attendance
                  .retry()
                  .then(onClose)
                  .catch((cause: unknown) => setError(readableError(cause)))
              }
            >
              {attendance.busy ? 'Confirmando…' : 'Reintentar fichaje'}
            </Button>
          </Notice>
        ) : null}
        <div className="actions">
          <Button disabled={attendance.busy} onClick={onClose}>
            Cerrar
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={blocked || (!!targetZone && !acceptZone)}
          >
            {attendance.busy
              ? 'Guardando…'
              : mode === 'entry'
                ? 'Guardar entrada'
                : mode === 'exit'
                  ? 'Guardar salida'
                  : 'Guardar fichaje'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
