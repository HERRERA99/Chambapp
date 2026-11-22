import type { WorkspaceData } from '../../domain/models.ts';
import { mondayForDate } from '../../domain/time.ts';
import { buildWeekOverview } from '../week/weekOverview.model.ts';

const percentFormat = new Intl.NumberFormat('es', { maximumFractionDigits: 2 });

type DashboardToday = {
  workedSeconds: number;
  imputedSeconds: number;
  imputedPercent: number | null;
  tone: 'success' | 'warning' | 'danger' | null;
  provisional: boolean;
};

type DashboardAlert = {
  id: string;
  kind: 'day' | 'odoo';
  tone: 'warning' | 'danger';
  label: string;
};

export function formatDashboardPercent(value: number | null) {
  return value === null ? '—' : `${percentFormat.format(value)}%`;
}

export function dashboardSummary(
  data: WorkspaceData,
  today: string,
  now = new Date().toISOString(),
): {
  today: DashboardToday;
  alerts: DashboardAlert[];
} {
  const overview = buildWeekOverview(data, mondayForDate(today), today, now);
  const current = overview.days.find((day) => day.isToday);
  const todaySummary: DashboardToday = {
    workedSeconds: current?.workedSeconds ?? 0,
    imputedSeconds: current?.imputedSeconds ?? 0,
    imputedPercent: current?.imputedPercent ?? null,
    tone: current?.tone ?? null,
    provisional: current?.provisional ?? false,
  };

  const offDays = overview.days.filter(
    (day) => day.date < today && day.hasData && day.tone !== 'success',
  );
  // One line per day is noise once several days are off: group them in a single alert.
  const alerts: DashboardAlert[] =
    offDays.length > 1
      ? [
          {
            id: 'days-off',
            kind: 'day',
            tone: offDays.some((day) => day.tone === 'danger') ? 'danger' : 'warning',
            label: `${offDays.length} días sin cuadrar: ${offDays
              .map(
                (day) =>
                  `${day.name.slice(0, 3).toLocaleLowerCase('es')} ${Number(day.date.slice(-2))}`,
              )
              .join(', ')}`,
          },
        ]
      : offDays.map((day) => {
          const dayNumber = Number(day.date.slice(-2));
          const detail =
            day.imputedPercent === null
              ? 'sin fichajes'
              : `${percentFormat.format(day.imputedPercent)} % imputado`;
          return {
            id: `day-${day.date}`,
            kind: 'day' as const,
            tone: day.tone === 'danger' ? 'danger' : 'warning',
            label: `${day.name} ${dayNumber}: ${detail}`,
          };
        });

  const unsentOdooCount = overview.timesheetDays.reduce(
    (sum, day) =>
      sum +
      day.items.filter(({ entry }) => entry.fin_en !== null && !entry.imputado_en_odoo).length,
    0,
  );
  if (unsentOdooCount > 0) {
    alerts.push({
      id: 'odoo-unsent',
      kind: 'odoo',
      tone: 'warning',
      label: `${unsentOdooCount} ${unsentOdooCount === 1 ? 'parte' : 'partes'} sin enviar a Odoo`,
    });
  }

  return { today: todaySummary, alerts };
}
