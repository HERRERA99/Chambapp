import { DateTime } from 'luxon';
import type { AttendanceDay } from '../../domain/attendance';
import { BarChart } from '../../shared/ui/BarChart';
import type { BarSeries } from '../../shared/ui/BarChart';
import { formatAttendanceDuration } from './attendanceLabels';
import './attendance.css';

const series: readonly BarSeries[] = [
  { key: 'worked', label: 'Fichado', tone: 'neutral' },
  { key: 'imputed', label: 'Imputado', tone: 'accent' },
];

export function AttendanceChart({
  days,
  today,
}: {
  days: readonly AttendanceDay[];
  today?: string;
}) {
  const description = days
    .map(
      (day) =>
        `${day.date}: fichado exacto ${formatAttendanceDuration(day.workedSeconds)}, imputado ${formatAttendanceDuration(day.imputedSeconds)}${day.provisionalSeconds ? `, con ${formatAttendanceDuration(day.provisionalSeconds)} de fichaje provisional` : ''}`,
    )
    .join('. ');
  return (
    <BarChart
      series={series}
      ariaLabel={`Horas fichadas e imputadas por día. ${description}`}
      showProvisionalLegend={days.some((day) => day.provisionalSeconds > 0)}
      minColumnWidth={92}
      height={170}
      columns={days.map((day) => ({
        key: day.date,
        label: DateTime.fromISO(day.date, { zone: 'UTC' }).setLocale('es').toFormat('ccc dd'),
        values: { worked: day.workedSeconds, imputed: day.imputedSeconds },
        provisional: { worked: day.provisionalSeconds },
        active: day.date === today,
        badge: day.date === today ? 'Hoy' : undefined,
        title: `${day.date}: fichado exacto ${formatAttendanceDuration(day.workedSeconds)}, imputado ${formatAttendanceDuration(day.imputedSeconds)}${day.provisionalSeconds ? `; fichaje provisional ${formatAttendanceDuration(day.provisionalSeconds)}` : ''}`,
        header: (
          <>
            <span className="attendance-chart__value--worked" title="Fichado exacto">
              F {formatAttendanceDuration(day.workedSeconds)}
            </span>
            <span
              className="attendance-chart__value--imputed"
              title="Imputado en partes finalizados"
            >
              I {formatAttendanceDuration(day.imputedSeconds)}
            </span>
          </>
        ),
      }))}
    />
  );
}
