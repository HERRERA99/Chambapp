import { DateTime } from 'luxon';
import type { AttendanceDay } from '../../domain/attendance';
import { BarChart } from '../../shared/ui/BarChart';
import type { BarSeries } from '../../shared/ui/BarChart';
import { formatHoursMinutes } from '../extension/protocol';
import { formatAttendanceDuration } from './attendanceLabels';
import './attendance.css';

const series: readonly BarSeries[] = [
  { key: 'worked', label: 'Fichado', tone: 'neutral' },
  { key: 'imputed', label: 'Imputado', tone: 'accent' },
];

type ChartDay = Pick<
  AttendanceDay,
  'date' | 'workedSeconds' | 'imputedSeconds' | 'provisionalSeconds'
> & {
  tone?: 'success' | 'warning' | 'danger' | null;
};

export function AttendanceChart({
  days,
  today,
  compact = false,
}: {
  days: readonly ChartDay[];
  today?: string;
  compact?: boolean;
}) {
  const fmt = (seconds: number) =>
    compact ? formatHoursMinutes(Math.floor(seconds / 60)) : formatAttendanceDuration(seconds);
  const description = days
    .map(
      (day) =>
        `${day.date}: fichado exacto ${fmt(day.workedSeconds)}, imputado ${fmt(day.imputedSeconds)}${day.provisionalSeconds ? `, con ${fmt(day.provisionalSeconds)} de fichaje provisional` : ''}`,
    )
    .join('. ');
  return (
    <BarChart
      series={series}
      ariaLabel={`Horas fichadas e imputadas por día. ${description}`}
      showProvisionalLegend={days.some((day) => day.provisionalSeconds > 0)}
      minColumnWidth={compact ? 32 : 92}
      height={compact ? 104 : 170}
      columns={days.map((day) => ({
        key: day.date,
        label: DateTime.fromISO(day.date, { zone: 'UTC' }).setLocale('es').toFormat('ccc dd'),
        values: { worked: day.workedSeconds, imputed: day.imputedSeconds },
        colors: day.tone ? { imputed: `var(--${day.tone})` } : undefined,
        provisional: { worked: day.provisionalSeconds },
        active: day.date === today,
        badge: day.date === today ? 'Hoy' : undefined,
        title: `${day.date}: fichado exacto ${fmt(day.workedSeconds)}, imputado ${fmt(day.imputedSeconds)}${day.provisionalSeconds ? `; fichaje provisional ${fmt(day.provisionalSeconds)}` : ''}`,
        header: compact ? undefined : (
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
