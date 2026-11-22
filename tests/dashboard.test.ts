import assert from 'node:assert/strict';
import test from 'node:test';
import type { Attendance, TimeEntry, WorkspaceData } from '../src/domain/models.ts';
import {
  dashboardSummary,
  formatDashboardPercent,
} from '../src/features/dashboard/dashboardSelectors.ts';

const monday = '2026-11-16';
const tuesday = '2026-11-17';
const wednesday = '2026-11-18';
const thursday = '2026-11-19';
const today = '2026-11-20';
const now = '2026-11-20T15:00:00Z';
const zone = 'Europe/Madrid';

function part(id: string, fecha: string, seconds: number, overrides: Partial<TimeEntry> = {}) {
  const start = `${fecha}T08:00:00Z`;
  return {
    id,
    tarea_id: 'task',
    proyecto_id: 'project',
    fecha,
    inicio_en: start,
    fin_en: new Date(Date.parse(start) + seconds * 1000).toISOString(),
    duracion_real_segundos: seconds,
    duracion_imputada_segundos: seconds,
    intervalo_redondeo_minutos: 0,
    imputado_en_odoo: false,
    imputacion_odoo_id: null,
    zona_horaria: zone,
    eliminado_en: null,
    ...overrides,
  } as TimeEntry;
}

function sessionFor(fecha: string, seconds: number): Attendance {
  const inicio_en = `${fecha}T08:00:00Z`;
  const fin_en = new Date(Date.parse(inicio_en) + seconds * 1000).toISOString();
  return { id: inicio_en, inicio_en, fin_en, eliminado_en: null } as Attendance;
}

function workspace(entries: TimeEntry[], fichajes: Attendance[]): WorkspaceData {
  return {
    profile: { zona_horaria: zone, preferencias: {} },
    tasks: [],
    projects: [],
    configurations: [],
    days: [],
    jornadas: [],
    entries,
    fichajes,
  } as unknown as WorkspaceData;
}

test('summarizes today via buildWeekOverview with no alerts when all is green and sent', () => {
  const data = workspace(
    [
      part('mon', monday, 9500, { imputado_en_odoo: true, imputacion_odoo_id: 'imp-1' }),
      part('fri', today, 7200, { imputado_en_odoo: true, imputacion_odoo_id: 'imp-2' }),
    ],
    [sessionFor(monday, 10_000), sessionFor(today, 7200)],
  );
  const summary = dashboardSummary(data, today, now);
  assert.deepEqual(summary.today, {
    date: today,
    workedSeconds: 7200,
    imputedSeconds: 7200,
    imputedPercent: 100,
    tone: 'success',
    provisional: false,
  });
  assert.deepEqual(summary.alerts, []);
  assert.equal(formatDashboardPercent(summary.today.imputedPercent), '100%');
  assert.equal(formatDashboardPercent(null), '—');
});

test('alerts on past non-green days with data and counts finished unsent Odoo parts', () => {
  const data = workspace(
    [
      // Monday: 95% (green) and sent -> no day alert, not counted as unsent
      part('mon', monday, 9500, { imputado_en_odoo: true, imputacion_odoo_id: 'imp-1' }),
      // Tuesday: 84% (danger) and unsent
      part('tue', tuesday, 8400),
      // Wednesday: 87.5% (warning) and unsent
      part('wed', wednesday, 8750),
      // Thursday: parts without attendance -> hasData with null percent (warning) and unsent
      part('thu', thursday, 1800),
      // Today: running timer must NOT count as unsent or trigger a past-day alert
      part('fri-running', today, 1800, { fin_en: null }),
      // Deleted entry must NOT count as unsent
      part('deleted', tuesday, 1800, { eliminado_en: now }),
    ],
    [
      sessionFor(monday, 10_000),
      sessionFor(tuesday, 10_000),
      sessionFor(wednesday, 10_000),
      sessionFor(today, 7200),
    ],
  );

  const summary = dashboardSummary(data, today, now);
  assert.equal(summary.today.workedSeconds, 7200);
  assert.equal(summary.today.imputedSeconds, 0);
  assert.equal(summary.today.tone, 'danger');
  // Several off days are grouped in one alert, coloured by the worst of them.
  assert.deepEqual(summary.alerts, [
    {
      id: 'days-off',
      kind: 'day',
      tone: 'danger',
      label: '3 días sin cuadrar: mar 17, mié 18, jue 19',
    },
    { id: 'odoo-unsent', kind: 'odoo', tone: 'warning', label: '3 partes sin enviar a Odoo' },
  ]);
});

test('uses singular for one unsent Odoo part and handles an empty weekend day as today', () => {
  const sunday = '2026-11-22';
  const data = workspace([part('mon', monday, 9500)], [sessionFor(monday, 10_000)]);
  const summary = dashboardSummary(data, sunday, '2026-11-22T12:00:00Z');
  assert.deepEqual(summary.today, {
    date: sunday,
    workedSeconds: 0,
    imputedSeconds: 0,
    imputedPercent: null,
    tone: null,
    provisional: false,
  });
  assert.deepEqual(summary.alerts, [
    { id: 'odoo-unsent', kind: 'odoo', tone: 'warning', label: '1 parte sin enviar a Odoo' },
  ]);
});
