import assert from 'node:assert/strict';
import test from 'node:test';
import type { Attendance, TimeEntry, WorkspaceData } from '../src/domain/models.ts';
import {
  readImputationThresholds,
  validImputationThresholds,
} from '../src/domain/imputationThresholds.ts';
import { buildWeekOverview } from '../src/features/week/weekOverview.model.ts';

const monday = '2026-11-16';
const today = '2026-11-20';
const now = '2026-11-20T15:00:00Z';
const zone = 'Europe/Madrid';
const start = '2026-11-16T08:00:00Z';

function part(id: string, seconds: number, overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id,
    tarea_id: 'task',
    proyecto_id: 'project',
    fecha: monday,
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

function session(inicio_en: string, fin_en: string | null): Attendance {
  return { id: inicio_en, inicio_en, fin_en, eliminado_en: null } as Attendance;
}

function overview(entries: TimeEntry[], fichajes: Attendance[], preferencias = {}) {
  const data = {
    profile: { zona_horaria: zone, preferencias },
    tasks: [],
    projects: [],
    configurations: [],
    days: [],
    jornadas: [],
    entries,
    fichajes,
  } as unknown as WorkspaceData;
  return buildWeekOverview(data, monday, today, now);
}

test('keeps weekday parts without attendance and omits empty weekend days', () => {
  const week = overview([part('a', 900)], []);
  assert.equal(week.days.length, 5);
  assert.equal(week.days[0]!.imputedSeconds, 900);
  assert.equal(week.days[0]!.imputedPercent, null);
  assert.equal(week.days[0]!.tone, null);
  assert.equal(week.total.imputedPercent, null);
  assert.equal(week.targetSeconds, 0);
});

test('classifies exact daily and weekly percentage limits before formatting', () => {
  const attendance = [session(start, new Date(Date.parse(start) + 10_000_000).toISOString())];
  for (const [seconds, percent, tone] of [
    [8499, 84.99, 'danger'],
    [8500, 85, 'warning'],
    [9000, 90, 'success'],
    [10000, 100, 'success'],
    [10001, 100.01, 'danger'],
  ] as const) {
    const week = overview([part('a', seconds)], attendance);
    assert.equal(week.days[0]!.imputedPercent, percent);
    assert.equal(week.days[0]!.tone, tone);
    assert.equal(week.total.imputedPercent, percent);
    assert.equal(week.total.tone, tone);
  }
});

test('rounds pending parts together, includes sent groups and excludes the running timer', () => {
  const week = overview(
    [
      part('a', 61, { intervalo_redondeo_minutos: 5, duracion_imputada_segundos: 300 }),
      part('b', 61, { intervalo_redondeo_minutos: 5, duracion_imputada_segundos: 300 }),
      part('sent', 60, { imputado_en_odoo: true, imputacion_odoo_id: 'sent' }),
      part('running', 999, { fin_en: null }),
      part('deleted', 999, { eliminado_en: now }),
      part('saturday', 600, { fecha: '2026-11-21' }),
    ],
    [],
  );
  assert.equal(week.days[0]!.imputedSeconds, 360);
  assert.equal(week.days.at(-1)?.date, '2026-11-21');
  assert.equal(week.total.imputedSeconds, 960);
});

test('shows all four Odoo states from the parts on each date', () => {
  const sent = part('sent', 300, { imputado_en_odoo: true, imputacion_odoo_id: 'sent' });
  const week = overview(
    [
      sent,
      part('pending', 300, { fecha: '2026-11-17' }),
      part('sent-2', 300, {
        fecha: '2026-11-18',
        imputado_en_odoo: true,
        imputacion_odoo_id: 'sent-2',
      }),
      part('pending-2', 300, { fecha: '2026-11-18' }),
      part('running', 300, { fecha: '2026-11-19', fin_en: null }),
    ],
    [],
  );
  assert.deepEqual(
    week.days.map((day) => day.odoo),
    ['Enviado', 'Sin enviar', 'Parcial', 'Sin enviar', '—'],
  );
});

test('splits a closed overnight record across the weekend and marks an open record provisional', () => {
  const week = overview(
    [],
    [
      session('2026-11-19T22:30:00Z', null),
      session('2026-11-20T22:00:00Z', '2026-11-21T01:00:00Z'),
    ],
  );
  const thursday = week.days[3]!;
  const friday = week.days[4]!;
  const saturday = week.days[5]!;
  assert.equal(thursday.workedSeconds, 1800);
  assert.equal(thursday.provisionalSeconds, 1800);
  assert.equal(thursday.attendance[0]!.end, '2026-11-19T23:00:00.000Z');
  assert.equal(friday.isToday, true);
  assert.equal(friday.provisional, true);
  assert.equal(friday.provisionalSeconds, 16 * 3600);
  assert.equal(friday.attendance.find((record) => record.provisional)?.end, null);
  assert.equal(saturday.workedSeconds, 7200);
  assert.equal(saturday.provisional, false);
  assert.equal(week.days.length, 6);
  const justOpened = overview([], [session(now, null)]).days[4]!;
  assert.equal(justOpened.provisional, true);
  assert.equal(justOpened.imputedPercent, null);
});

test('uses valid saved thresholds and falls back to defaults for invalid profiles', () => {
  const configured = { verdeDesde: 95, ambarDesde: 90, maximo: 110 };
  assert.equal(validImputationThresholds(configured), true);
  assert.equal(validImputationThresholds({ ...configured, maximo: 201 }), false);
  assert.equal(validImputationThresholds({ ...configured, verdeDesde: 90 }), false);
  assert.equal(validImputationThresholds({ ...configured, ambarDesde: 0 }), false);
  assert.deepEqual(
    readImputationThresholds({ umbrales_imputacion: { ...configured, maximo: '110' } }),
    {
      verdeDesde: 90,
      ambarDesde: 85,
      maximo: 100,
    },
  );
  const week = overview(
    [part('a', 900)],
    [session(start, new Date(Date.parse(start) + 1_000_000).toISOString())],
    { umbrales_imputacion: configured },
  );
  assert.equal(week.days[0]!.tone, 'warning');
  assert.equal(week.total.tone, 'warning');
});
