import { formatDuration } from '../../../domain/time';
import { weekDays } from '../data/week.fixtures';

export type WeekChartDay = {
  date: string;
  label: string;
  loggedSeconds: number;
  targetSeconds: number;
  isToday?: boolean;
};

const previewDays: readonly WeekChartDay[] = weekDays.map((day) => ({
  date: day.date,
  label: `${day.short} ${day.date}`,
  targetSeconds: day.target * 3600,
  loggedSeconds: day.logged * 3600,
  isToday: day.state === 'active',
}));
const emptyDays: readonly WeekChartDay[] = [];

export function WeekChart({
  days = emptyDays,
  preview = false,
  hoursLabel = 'imputadas',
}: {
  days?: readonly WeekChartDay[];
  preview?: boolean;
  hoursLabel?: 'imputadas' | 'fichadas';
}) {
  const values = preview ? previewDays : days;
  if (!values.length)
    return <p className="muted empty-state">Todavía no hay jornadas para comparar.</p>;
  const maximum = Math.max(
    3600,
    ...values.map((day) => Math.max(day.targetSeconds, day.loggedSeconds)),
  );
  const description = values
    .map(
      (day) =>
        `${day.label}: ${formatDuration(day.loggedSeconds)} ${hoursLabel}; objetivo ${formatDuration(day.targetSeconds)}`,
    )
    .join('; ');
  return (
    <div
      className="week-chart"
      style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}
      role="img"
      aria-label={description}
    >
      {values.map((day) => (
        <div
          className={`week-chart__day ${day.isToday ? 'week-chart__day--active' : ''}`}
          key={day.date}
        >
          {day.isToday ? <span className="week-chart__today">Hoy</span> : null}
          <div className="week-chart__bars">
            <span
              className="week-chart__target"
              style={{ height: `${(day.targetSeconds / maximum) * 100}%` }}
            />
            <span
              className="week-chart__logged"
              style={{ height: `${(day.loggedSeconds / maximum) * 100}%` }}
            />
          </div>
          <strong className="mono">{day.label}</strong>
          <span className="week-chart__balance">
            {day.targetSeconds > 0
              ? `${day.loggedSeconds >= day.targetSeconds ? '+' : '−'}${formatDuration(Math.abs(day.loggedSeconds - day.targetSeconds))}`
              : 'Sin objetivo'}
          </span>
          <span className="mono muted">{formatDuration(day.loggedSeconds)}</span>
        </div>
      ))}
    </div>
  );
}
