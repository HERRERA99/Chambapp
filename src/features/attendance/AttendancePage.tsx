import { useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { useSearchParams } from 'react-router-dom';
import type { Attendance } from '../../domain/models';
import { attendanceInPeriod } from '../../domain/attendance';
import { formatDate, mondayForDate, weekDates } from '../../domain/time';
import { readableError } from '../../lib/supabase/errors';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Button, IconButton } from '../../shared/ui/Button';
import { InputField } from '../../shared/ui/FormField';
import { Badge, Notice, Panel } from '../../shared/ui/Panel';
import { DataTable } from '../../shared/ui/DataTable';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { useWorkspace } from '../workspace/useWorkspace';
import { useAttendance } from './useAttendance';
import { AttendanceControls } from './AttendanceControls';
import { AttendanceEditor } from './AttendanceEditor';
import { formatAttendanceDuration } from './attendanceLabels';
import './attendance.css';

function validDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = DateTime.fromISO(value, { zone: 'UTC' });
  return date.isValid && date.toISODate() === value ? value : null;
}

export default function AttendancePage() {
  const { data, isLoading, error, reload } = useWorkspace();
  const attendance = useAttendance();
  const notify = useFeedback();
  const [search, setSearch] = useSearchParams();
  const [period, setPeriod] = useState<'day' | 'week'>(() =>
    validDate(search.get('fecha')) ? 'day' : 'week',
  );
  const [editor, setEditor] = useState<Attendance | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Attendance | null>(null);
  const zone = data?.profile.zona_horaria ?? 'Europe/Madrid';
  const today = DateTime.fromISO(attendance.now, { zone }).toISODate()!;
  const selectedDate = validDate(search.get('fecha')) ?? today;
  const monday = mondayForDate(selectedDate);
  const dates = useMemo(
    () => (period === 'day' ? [selectedDate] : weekDates(monday)),
    [period, selectedDate, monday],
  );
  const records = useMemo(
    () => (data ? attendanceInPeriod(data.fichajes, dates, zone, attendance.now) : []),
    [data, dates, zone, attendance.now],
  );
  const blocked = attendance.busy || attendance.pending || !!error;

  function selectDate(value: string) {
    if (validDate(value)) setSearch({ fecha: value });
  }
  function move(direction: number) {
    selectDate(
      DateTime.fromISO(selectedDate, { zone: 'UTC' })
        .plus({ days: direction * (period === 'day' ? 1 : 7) })
        .toISODate()!,
    );
  }
  function timestamp(value: string) {
    return DateTime.fromISO(value, { zone }).setLocale('es').toFormat('dd LLL yyyy · HH:mm:ss');
  }
  async function remove() {
    if (!deleting) return;
    await attendance.perform({
      action: 'eliminar_fichaje',
      payload: { id: deleting.id, version: deleting.version },
    });
    notify('Fichaje eliminado.');
  }

  if (isLoading && !data)
    return (
      <div className="empty-state" role="status">
        Cargando fichajes…
      </div>
    );
  if (!data)
    return (
      <Notice title="No se pudieron cargar los fichajes">
        {readableError(error ?? 'La sesión está cargando.')}
        <Button onClick={() => void reload()}>Actualizar</Button>
      </Notice>
    );

  const periodLabel =
    period === 'day' ? formatDate(selectedDate, zone) : `Semana del ${monday}`;
  const sessionCount = `${records.length} ${records.length === 1 ? 'sesión' : 'sesiones'}`;

  return (
    <div className="page-stack attendance-page">
      <PageHeader
        eyebrow="Control de jornada"
        title="Entradas y salidas"
        description="Ficha ahora, registra tramos manuales y consulta o corrige tu historial de fichajes."
        actions={
          <Button icon="plus" variant="primary" disabled={blocked} onClick={() => setEditor('new')}>
            Registrar tramo completo
          </Button>
        }
      />
      <Panel title="Tu fichaje actual" icon="clock">
        <AttendanceControls />
      </Panel>
      <Panel
        title="Historial de entradas y salidas"
        eyebrow={`${periodLabel} · ${sessionCount} · ${zone}`}
        icon="calendar"
        action={
          <div className="actions attendance-navigation">
            <IconButton
              icon="left"
              label={period === 'day' ? 'Día anterior' : 'Semana anterior'}
              onClick={() => move(-1)}
            />
            <Button onClick={() => selectDate(today)}>Hoy</Button>
            <IconButton
              icon="right"
              label={period === 'day' ? 'Día siguiente' : 'Semana siguiente'}
              onClick={() => move(1)}
            />
          </div>
        }
      >
        <div className="attendance-period-controls">
          <div className="actions" role="group" aria-label="Periodo del historial">
            <Button
              variant={period === 'day' ? 'primary' : 'secondary'}
              aria-pressed={period === 'day'}
              onClick={() => setPeriod('day')}
            >
              Día
            </Button>
            <Button
              variant={period === 'week' ? 'primary' : 'secondary'}
              aria-pressed={period === 'week'}
              onClick={() => setPeriod('week')}
            >
              Semana
            </Button>
          </div>
          <InputField
            type="date"
            label="Fecha"
            value={selectedDate}
            onChange={(event) => selectDate(event.target.value)}
          />
        </div>
        {records.length ? (
          <DataTable
            caption="Fichajes con entrada y salida exactas"
            headers={['Entrada', 'Salida', 'Duración de la sesión', 'Estado', 'Acciones']}
          >
            {records.map((record) => {
              const seconds = Math.max(
                0,
                (Date.parse(record.fin_en ?? attendance.now) - Date.parse(record.inicio_en)) / 1000,
              );
              return (
                <tr key={record.id}>
                  <td className="mono">{timestamp(record.inicio_en)}</td>
                  <td className="mono">
                    {record.fin_en ? timestamp(record.fin_en) : 'Salida pendiente'}
                  </td>
                  <td className="mono">
                    {formatAttendanceDuration(seconds)}
                    {!record.fin_en ? <span className="muted"> · provisional</span> : null}
                  </td>
                  <td>
                    <Badge tone={record.fin_en ? 'neutral' : 'success'}>
                      {record.fin_en ? 'Cerrado' : 'Dentro'}
                    </Badge>
                  </td>
                  <td>
                    <div className="actions">
                      <IconButton
                        icon="edit"
                        label={`Editar entrada y salida del ${timestamp(record.inicio_en)}`}
                        disabled={blocked}
                        onClick={() => setEditor(record)}
                      />
                      <IconButton
                        icon="trash"
                        label={`Eliminar fichaje del ${timestamp(record.inicio_en)}`}
                        disabled={blocked || !record.fin_en}
                        onClick={() => setDeleting(record)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <p className="muted section-intro">
            No hay fichajes en este periodo. Registra una entrada para empezar a contar tu jornada.
          </p>
        )}
        {records.length ? (
          <p className="field__hint attendance-comparison__hint">
            El historial muestra cada sesión completa, aunque cruce el periodo. Cierra una entrada
            abierta antes de eliminarla.
          </p>
        ) : null}
      </Panel>
      {editor ? (
        <AttendanceEditor
          key={editor === 'new' ? `new-${selectedDate}` : `${editor.id}:${editor.version}`}
          data={data}
          record={editor === 'new' ? undefined : editor}
          date={selectedDate}
          onClose={() => setEditor(null)}
        />
      ) : null}
      <ConfirmDialog
        open={!!deleting}
        title="Eliminar fichaje"
        description="Se eliminará este fichaje de tu historial de jornada. Los partes de tareas se conservan."
        confirmLabel="Eliminar fichaje"
        danger
        busy={attendance.busy}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
