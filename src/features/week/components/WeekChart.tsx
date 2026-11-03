import type { ReactNode } from 'react';
import { formatDuration } from '../../../domain/time';
import { BarChart } from '../../../shared/ui/BarChart';
import type { BarSeries } from '../../../shared/ui/BarChart';
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
  legendAside,
}: {
  days?: readonly WeekChartDay[];
  preview?: boolean;
  hoursLabel?: 'imputadas' | 'fichadas';
  legendAside?: ReactNode;
}) {
  const values = preview ? previewDays : days;
  if (!values.length)
    return <p className="muted empty-state">Todavía no hay jornadas para comparar.</p>;
  const series: readonly BarSeries[] = [
    { key: 'target', label: 'Objetivo', tone: 'neutral' },
    { key: 'logged', label: hoursLabel === 'fichadas' ? 'Fichado' : 'Imputado', tone: 'accent' },
  ];
  const description = values
    .map(
      (day) =>
        `${day.label}: ${formatDuration(day.loggedSeconds)} ${hoursLabel}; objetivo ${formatDuration(day.targetSeconds)}`,
    )
    .join('; ');
  return (
    <BarChart
      series={series}
      ariaLabel={description}
      legendAside={legendAside}
      columns={values.map((day) => ({
        key: day.date,
        label: day.label,
        values: { target: day.targetSeconds, logged: day.loggedSeconds },
        active: day.isToday,
        badge: day.isToday ? 'Hoy' : undefined,
        footer: (
          <>
            <span className="week-chart__balance">
              {day.targetSeconds > 0
                ? `${day.loggedSeconds >= day.targetSeconds ? '+' : '−'}${formatDuration(Math.abs(day.loggedSeconds - day.targetSeconds))}`
                : 'Sin objetivo'}
            </span>
            <span className="week-chart__logged-total">{formatDuration(day.loggedSeconds)}</span>
          </>
        ),
      }))}
    />
  );
}
