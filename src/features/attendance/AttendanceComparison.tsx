import { useMemo } from 'react';
import { attendanceDays, attendanceTotal } from '../../domain/attendance';
import { formatDuration, weekDates } from '../../domain/time';
import { Panel } from '../../shared/ui/Panel';
import { StatGrid } from '../../shared/ui/StatGrid';
import { DataTable } from '../../shared/ui/DataTable';
import { ButtonLink } from '../../shared/ui/Button';
import { useWorkspace } from '../workspace/useWorkspace';
import { useAttendance } from './useAttendance';
import { AttendanceChart } from './AttendanceChart';
import { formatImputedPercent } from './attendanceLabels';

export function AttendanceComparison({
  monday,
  today,
  compact = false,
}: {
  monday: string;
  today?: string;
  compact?: boolean;
}) {
  const { data } = useWorkspace();
  const { now } = useAttendance();
  const dates = useMemo(() => weekDates(monday), [monday]);
  const days = useMemo(
    () =>
      data
        ? attendanceDays(data.fichajes, data.entries, dates, data.profile.zona_horaria, now)
        : [],
    [data, dates, now],
  );
  if (!data) return null;
  const total = attendanceTotal(days);
  const current = days.find((day) => day.date === today);
  return (
    <Panel
      title="Jornada fichada y horas imputadas"
      eyebrow="Entradas y salidas"
      action={
        <ButtonLink to={`/fichajes?fecha=${today ?? monday}`} icon="clock">
          Ver fichajes
        </ButtonLink>
      }
    >
      <StatGrid
        stats={[
          {
            label: compact ? 'Fichado hoy' : 'Fichajes cerrados',
            value: formatDuration(compact && current ? current.workedSeconds : total.closedSeconds),
            icon: 'clock',
            detail:
              compact && current?.provisionalSeconds
                ? 'Incluye entrada abierta · provisional'
                : 'Entrada y salida, sin redondeo',
          },
          {
            label: 'Fichado esta semana',
            value: formatDuration(total.workedSeconds),
            icon: 'calendar',
            detail: 'Suma de sesiones, sin contar pausas',
          },
          {
            label: compact ? '% imputado hoy' : '% imputado semanal',
            value: formatImputedPercent(
              compact && current ? current.imputedPercent : total.imputedPercent,
            ),
            icon: 'gauge',
            accent: true,
            detail: 'Imputado ÷ fichado · puede superar el 100%',
          },
          {
            label: 'Imputado esta semana',
            value: formatDuration(total.imputedSeconds),
            icon: 'tasks',
            detail: 'Partes finalizados con su redondeo',
          },
        ]}
      />
      <div className="attendance-chart-legend" aria-hidden="true">
        <span>
          <i className="attendance-chart-legend__worked" /> Fichado
        </span>
        <span>
          <i className="attendance-chart-legend__imputed" /> Imputado
        </span>
        {total.provisionalSeconds > 0 ? (
          <span>
            <i className="attendance-chart-legend__provisional" /> Fichaje en curso
          </span>
        ) : null}
      </div>
      <AttendanceChart days={days} />
      {!compact ? (
        <DataTable
          caption="Detalle diario de fichajes y porcentaje imputado"
          headers={['Fecha', 'Fichado', 'En curso', 'Imputado', '% imputado']}
        >
          {days.map((day) => (
            <tr key={day.date}>
              <td>{day.date}</td>
              <td className="mono">{formatDuration(day.workedSeconds)}</td>
              <td className="mono">
                {day.provisionalSeconds ? formatDuration(day.provisionalSeconds) : '—'}
              </td>
              <td className="mono">{formatDuration(day.imputedSeconds)}</td>
              <td>{formatImputedPercent(day.imputedPercent)}</td>
            </tr>
          ))}
        </DataTable>
      ) : null}
      <p className="field__hint attendance-comparison__hint">
        Los intervalos que cruzan medianoche se reparten entre días en {data.profile.zona_horaria};
        el tiempo imputado se reparte proporcionalmente. El porcentaje usa partes finalizados y
        puede variar por el redondeo. Una entrada abierta aporta tiempo provisional.
      </p>
    </Panel>
  );
}
