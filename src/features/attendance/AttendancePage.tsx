import { useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { useSearchParams } from 'react-router-dom';
import type { Attendance } from '../../domain/models';
import { attendanceDays, attendanceInPeriod, attendanceTotal } from '../../domain/attendance';
import { formatDate, formatDuration, mondayForDate, weekDates } from '../../domain/time';
import { downloadCsv } from '../../lib/export';
import { readableError } from '../../lib/supabase/errors';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Button, IconButton } from '../../shared/ui/Button';
import { InputField } from '../../shared/ui/FormField';
import { StatGrid } from '../../shared/ui/StatGrid';
import { Badge, Notice, Panel } from '../../shared/ui/Panel';
import { DataTable } from '../../shared/ui/DataTable';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { useWorkspace } from '../workspace/useWorkspace';
import { useAttendance } from './useAttendance';
import { AttendanceControls } from './AttendanceControls';
import { AttendanceEditor } from './AttendanceEditor';
import { AttendanceChart } from './AttendanceChart';
import { formatImputedPercent } from './attendanceLabels';
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
  const [period, setPeriod] = useState<'day' | 'week'>('week');
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
  const days = useMemo(
    () => (data ? attendanceDays(data.fichajes, data.entries, dates, zone, attendance.now) : []),
    [data, dates, zone, attendance.now],
  );
  const records = useMemo(
    () => (data ? attendanceInPeriod(data.fichajes, dates, zone, attendance.now) : []),
    [data, dates, zone, attendance.now],
  );
  const total = attendanceTotal(days);
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
  function exportBalance() {
    downloadCsv(
      `chambapp-fichajes-${selectedDate}.csv`,
      [
        'Fecha',
        'Zona horaria',
        'Fichado cerrado (s)',
        'En curso provisional (s)',
        'Fichado total (s)',
        'Imputado finalizado (s)',
        '% imputado',
      ],
      days.map((day) => [
        day.date,
        zone,
        day.closedSeconds,
        day.provisionalSeconds,
        day.workedSeconds,
        day.imputedSeconds,
        day.imputedPercent,
      ]),
    );
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

  return (
    <div className="page-stack attendance-page">
      <PageHeader
        eyebrow="Control de jornada"
        title="Entradas, salidas y balance de horas"
        description="Ficha ahora o registra las horas manualmente. Compara tu jornada con los partes imputados a tareas."
        actions={
          <Button icon="plus" variant="primary" disabled={blocked} onClick={() => setEditor('new')}>
            Entrada / salida manual
          </Button>
        }
      />
      <Panel title="Tu fichaje actual" icon="clock">
        <AttendanceControls />
      </Panel>
      <Panel
        title={period === 'day' ? formatDate(selectedDate, zone) : `Semana del ${monday}`}
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
          <div className="actions" role="group" aria-label="Periodo del balance">
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
            label="Fecha del balance"
            value={selectedDate}
            onChange={(event) => selectDate(event.target.value)}
          />
          <Button
            icon="download"
            disabled={!records.length && !total.imputedSeconds}
            onClick={exportBalance}
          >
            Descargar balance CSV
          </Button>
        </div>
        <StatGrid
          stats={[
            {
              label: 'Horas fichadas',
              value: formatDuration(total.workedSeconds),
              icon: 'clock',
              detail: total.provisionalSeconds
                ? `Incluye ${formatDuration(total.provisionalSeconds)} en curso`
                : 'Duración exacta entre entrada y salida',
            },
            {
              label: 'Horas imputadas',
              value: formatDuration(total.imputedSeconds),
              icon: 'tasks',
              detail: 'Partes finalizados, con su redondeo',
              accent: true,
            },
            {
              label: '% de horas imputadas',
              value: formatImputedPercent(total.imputedPercent),
              icon: 'gauge',
              detail: 'Imputado ÷ fichado · puede superar el 100%',
            },
            {
              label:
                total.imputedSeconds > total.workedSeconds
                  ? 'Imputado por encima del fichaje'
                  : 'Horas sin imputar',
              value: formatDuration(Math.abs(total.workedSeconds - total.imputedSeconds)),
              icon: 'activity',
              detail: total.workedSeconds
                ? 'Diferencia entre jornada y partes'
                : 'Registra fichajes para comparar',
            },
          ]}
        />
        <div className="attendance-chart-legend">
          <span>
            <i className="attendance-chart-legend__worked" /> Fichado
          </span>
          <span>
            <i className="attendance-chart-legend__imputed" /> Imputado
          </span>
          {total.provisionalSeconds ? (
            <span>
              <i className="attendance-chart-legend__provisional" /> Fichaje en curso
            </span>
          ) : null}
        </div>
        <AttendanceChart days={days} />
        <DataTable
          caption="Balance de horas por fecha"
          headers={['Fecha', 'Fichado', 'En curso', 'Imputado', '% imputado']}
        >
          {days.map((day) => (
            <tr key={day.date}>
              <td>
                <button
                  className="text-link attendance-day-link"
                  onClick={() => {
                    selectDate(day.date);
                    setPeriod('day');
                  }}
                >
                  {day.date}
                </button>
              </td>
              <td className="mono">{formatDuration(day.workedSeconds)}</td>
              <td className="mono">
                {day.provisionalSeconds ? formatDuration(day.provisionalSeconds) : '—'}
              </td>
              <td className="mono">{formatDuration(day.imputedSeconds)}</td>
              <td>{formatImputedPercent(day.imputedPercent)}</td>
            </tr>
          ))}
        </DataTable>
        <p className="field__hint attendance-comparison__hint">
          Los fichajes abiertos cuentan como provisionales y los cronómetros de tareas abiertos se
          incorporan al imputado al detenerlos. Si un intervalo cruza medianoche se reparte por el
          tiempo transcurrido en cada día de {zone}; el redondeo de los partes se distribuye
          proporcionalmente.
        </p>
      </Panel>
      <Panel
        title="Historial de entradas y salidas"
        eyebrow={`${records.length} sesiones que coinciden con el periodo · ${zone}`}
      >
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
                    {formatDuration(seconds)}
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
            El historial muestra cada sesión completa, aunque cruce el periodo. El balance superior
            solo suma el tramo dentro de las fechas seleccionadas. Cierra una entrada abierta antes
            de eliminarla.
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
        description="Se eliminarán esta entrada y salida del balance de jornada. Los partes de tareas se conservan."
        confirmLabel="Eliminar fichaje"
        danger
        busy={attendance.busy}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
