import { DateTime } from 'luxon';
import type { AttendanceDay } from '../../domain/attendance';
import { formatAttendanceDuration } from './attendanceLabels';
import './attendance.css';

export function AttendanceChart({ days }: { days: readonly AttendanceDay[] }) {
  const maximum = Math.max(3600, ...days.flatMap((day) => [day.workedSeconds, day.imputedSeconds]));
  const description = days
    .map(
      (day) =>
        `${day.date}: fichado exacto ${formatAttendanceDuration(day.workedSeconds)}, imputado ${formatAttendanceDuration(day.imputedSeconds)}${day.provisionalSeconds ? `, con ${formatAttendanceDuration(day.provisionalSeconds)} de fichaje provisional` : ''}`,
    )
    .join('. ');
  return (
    <div
      className="attendance-chart"
      role="img"
      tabIndex={0}
      aria-label={`Horas fichadas e imputadas por día. ${description}`}
    >
      {days.map((day) => (
        <div key={day.date} className="attendance-chart__day">
          <div className="attendance-chart__values mono" aria-hidden="true">
            <span className="attendance-chart__value--worked" title="Fichado exacto">
              F {formatAttendanceDuration(day.workedSeconds)}
            </span>
            <span
              className="attendance-chart__value--imputed"
              title="Imputado en partes finalizados"
            >
              I {formatAttendanceDuration(day.imputedSeconds)}
            </span>
          </div>
          <div
            className="attendance-chart__bars"
            title={`${day.date}: fichado exacto ${formatAttendanceDuration(day.workedSeconds)}, imputado ${formatAttendanceDuration(day.imputedSeconds)}${day.provisionalSeconds ? `; fichaje provisional ${formatAttendanceDuration(day.provisionalSeconds)}` : ''}`}
          >
            <div className="attendance-chart__column">
              <div
                className="attendance-chart__bar attendance-chart__bar--worked"
                style={{ height: `${(day.closedSeconds / maximum) * 100}%` }}
              />
              {day.provisionalSeconds > 0 ? (
                <div
                  className="attendance-chart__bar attendance-chart__bar--provisional"
                  style={{ height: `${(day.provisionalSeconds / maximum) * 100}%` }}
                />
              ) : null}
            </div>
            <div className="attendance-chart__column">
              <div
                className="attendance-chart__bar attendance-chart__bar--imputed"
                style={{ height: `${(day.imputedSeconds / maximum) * 100}%` }}
              />
            </div>
          </div>
          <span className="muted">
            {DateTime.fromISO(day.date, { zone: 'UTC' }).setLocale('es').toFormat('ccc dd')}
          </span>
        </div>
      ))}
    </div>
  );
}
