import { DateTime } from 'luxon';
import type { WorkspaceData } from '../../domain/models.ts';
import { mondayForDate } from '../../domain/time.ts';
import { buildWeekOverview } from '../week/weekOverview.model.ts';

const percentFormat = new Intl.NumberFormat('es', { maximumFractionDigits: 1 });
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

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

export function isValidIsoDate(value: string | null | undefined): value is string {
  if (!value || !isoDatePattern.test(value)) return false;
  const parsed = DateTime.fromISO(value, { zone: 'UTC' });
  return parsed.isValid && parsed.toISODate() === value;
}

export function parseDashboardDate(value: string | null | undefined, today: string): string {
  return isValidIsoDate(value) ? value : today;
}

export function shiftDashboardDate(date: string, days: number): string {
  return DateTime.fromISO(date, { zone: 'UTC' }).plus({ days }).toISODate()!;
}

export function formatDashboardDayTitle(date: string, today: string): string {
  const parsed = DateTime.fromISO(date, { zone: 'UTC' }).setLocale('es');
  if (!parsed.isValid) return date;
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  const formatted = parsed.toFormat(sameYear ? "cccc d 'de' LLLL" : "cccc d 'de' LLLL 'de' yyyy");
  return formatted[0]!.toLocaleUpperCase('es') + formatted.slice(1);
}

export function dashboardSummary(
  data: WorkspaceData,
  today: string,
  now = new Date().toISOString(),
  selectedDate: string = today,
): {
  today: DashboardToday;
  alerts: DashboardAlert[];
} {
  const date = parseDashboardDate(selectedDate, today);
  const overview = buildWeekOverview(data, mondayForDate(date), today, now);
  const current = overview.days.find((day) => day.date === date);
  const todaySummary: DashboardToday = {
    workedSeconds: current?.workedSeconds ?? 0,
    imputedSeconds: current?.imputedSeconds ?? 0,
    imputedPercent: current?.imputedPercent ?? null,
    tone: current?.tone ?? null,
    provisional: current?.provisional ?? false,
  };

  if (date !== today) {
    return { today: todaySummary, alerts: [] };
  }

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
