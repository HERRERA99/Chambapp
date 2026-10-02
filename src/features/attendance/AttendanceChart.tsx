import { DateTime } from 'luxon';
import type { AttendanceDay } from '../../domain/attendance';
import { formatDuration } from '../../domain/time';
import './attendance.css';

export function AttendanceChart({ days }: { days: readonly AttendanceDay[] }) {
  const maximum = Math.max(3600, ...days.flatMap((day) => [day.workedSeconds, day.imputedSeconds]));
  const description = days
    .map(
      (day) =>
        `${day.date}: fichado ${formatDuration(day.workedSeconds)}, imputado ${formatDuration(day.imputedSeconds)}${day.provisionalSeconds ? `, con ${formatDuration(day.provisionalSeconds)} de fichaje provisional` : ''}`,
    )
    .join('. ');
  return (
    <div
      className="attendance-chart"
      role="img"
      aria-label={`Horas fichadas e imputadas por día. ${description}`}
    >
      {days.map((day) => (
        <div key={day.date} className="attendance-chart__day">
          <div
            className="attendance-chart__bars"
            title={`${day.date}: fichado ${formatDuration(day.workedSeconds)}, imputado ${formatDuration(day.imputedSeconds)}`}
          >
            <div className="attendance-chart__column">
              <span className="attendance-chart__value mono">
                {(day.workedSeconds / 3600).toFixed(1)}h
              </span>
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
              <span className="attendance-chart__value mono">
                {(day.imputedSeconds / 3600).toFixed(1)}h
              </span>
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
