import assert from 'node:assert/strict';
import test from 'node:test';
import type { Attendance, Project, Task, TimeEntry, WorkspaceData } from '../src/domain/models.ts';
import {
  entriesForDay,
  relevantTasks,
  todayMetrics,
} from '../src/features/dashboard/today.model.ts';
import {
  isNavItemActive,
  navigationGroups,
  pageTitle,
  parseSidebarPreference,
} from '../src/app/navigation.ts';

const zone = 'Europe/Madrid';
const now = '2026-10-02T16:00:00Z';
const today = '2026-10-02';
const owned = { usuario_id: 'u', creado_en: now, actualizado_en: now, version: 1 };

const project = (id: string, archivado_en: string | null = null): Project => ({
  ...owned,
  id,
  nombre: `Proyecto ${id}`,
  descripcion: null,
  cliente: null,
  presupuesto_minutos: null,
  archivado_en,
  eliminado_en: null,
});

const task = (id: string, overrides: Partial<Task> = {}): Task => ({
  ...owned,
  id,
  proyecto_id: 'p1',
  titulo: `Tarea ${id}`,
  descripcion: null,
  estado: 'pendiente',
  estimacion_minutos: null,
  odoo_id: null,
  odoo_url: null,
  archivado_en: null,
  eliminado_en: null,
  ...overrides,
});

const entry = (
  id: string,
  tarea_id: string,
  inicio_en: string,
  fin_en: string | null,
  imputed: number | null,
  overrides: Partial<TimeEntry> = {},
): TimeEntry => ({
  ...owned,
  id,
  tarea_id,
  jornada_id: 'j',
  proyecto_id: 'p1',
  inicio_en,
  fin_en,
  intervalo_redondeo_minutos: 15,
  modo_redondeo: 'superior',
  descripcion: null,
  imputado_en_odoo: false,
  eliminado_en: null,
  odoo_id: null,
  odoo_url: null,
  fecha: inicio_en.slice(0, 10),
  zona_horaria: zone,
  inicio_imputado_en: inicio_en,
  fin_imputado_en: fin_en,
  duracion_real_segundos: fin_en ? (Date.parse(fin_en) - Date.parse(inicio_en)) / 1000 : null,
  duracion_imputada_segundos: imputed,
  ...overrides,
});

const attendance = (inicio_en: string, fin_en: string | null): Attendance => ({
  ...owned,
  id: inicio_en,
  jornada_id: 'j',
  inicio_en,
  fin_en,
  eliminado_en: null,
  fecha: today,
  zona_horaria: zone,
  duracion_segundos: null,
});

function workspace(overrides: Partial<WorkspaceData> = {}): WorkspaceData {
  return {
    profile: {
      id: 'u',
      nombre: 'Prueba',
      zona_horaria: zone,
      intervalo_redondeo_minutos: 15,
      modo_redondeo: 'superior',
      onboarding_completado: true,
      preferencias: {},
      creado_en: now,
      actualizado_en: now,
      version: 1,
    },
    projects: [project('p1')],
    tasks: [],
    notes: [],
    entries: [],
    configurations: [],
    days: [],
    jornadas: [],
    fichajes: [],
    absences: [],
    serverTime: now,
    receivedAt: 0,
    ...overrides,
  };
}

test('today metrics: no attendance gives no percentage instead of dividing by zero', () => {
  const metrics = todayMetrics(
    workspace({
      entries: [entry('e1', 't1', '2026-10-02T08:00:00Z', '2026-10-02T09:00:00Z', 3600)],
    }),
    today,
    now,
  );
  assert.equal(metrics.workedSeconds, 0);
  assert.equal(metrics.imputedSeconds, 3600);
  assert.equal(metrics.imputedPercent, null);
});

test('today metrics: percentage uses finalized entries over worked time, open attendance is provisional', () => {
  const metrics = todayMetrics(
    workspace({
      fichajes: [
        attendance('2026-10-02T07:00:00Z', '2026-10-02T11:00:00Z'),
        attendance('2026-10-02T14:00:00Z', null),
      ],
      entries: [
        entry('e1', 't1', '2026-10-02T07:00:00Z', '2026-10-02T09:00:00Z', 7200, {
          imputado_en_odoo: true,
        }),
        entry('e2', 't1', '2026-10-02T09:00:00Z', '2026-10-02T09:50:00Z', 3600),
        entry('live', 't1', '2026-10-02T15:00:00Z', null, null),
      ],
    }),
    today,
    now,
  );
  assert.equal(metrics.workedSeconds, 6 * 3600);
  assert.equal(metrics.provisionalSeconds, 2 * 3600);
  assert.equal(metrics.imputedSeconds, 3 * 3600);
  assert.equal(metrics.imputedPercent, 50);
  assert.equal(metrics.finishedEntries, 2);
  // The Odoo mark is counted separately and does not change the imputed time.
  assert.equal(metrics.odooMarked, 1);
});

test('today metrics: rounding can exceed 100 % and midnight-crossing time is split by local day', () => {
  const metrics = todayMetrics(
    workspace({
      fichajes: [attendance('2026-10-01T21:00:00Z', '2026-10-01T23:00:00Z')],
      // 23:00–01:00 local: half of the attendance and of the rounded entry belong to today.
      entries: [entry('e1', 't1', '2026-10-01T21:00:00Z', '2026-10-01T23:00:00Z', 9000)],
    }),
    today,
    now,
  );
  assert.equal(metrics.workedSeconds, 3600);
  assert.equal(metrics.imputedSeconds, 4500);
  assert.equal(metrics.imputedPercent, 125);
});

test('entriesForDay keeps overlapping and running entries, newest first, without deleted ones', () => {
  const list = entriesForDay(
    [
      entry('yesterday', 't1', '2026-10-01T08:00:00Z', '2026-10-01T09:00:00Z', 3600),
      entry('cross', 't1', '2026-10-01T21:30:00Z', '2026-10-01T22:30:00Z', 3600),
      entry('morning', 't1', '2026-10-02T07:00:00Z', '2026-10-02T08:00:00Z', 3600),
      entry('live', 't1', '2026-10-02T15:00:00Z', null, null),
      entry('deleted', 't1', '2026-10-02T09:00:00Z', '2026-10-02T10:00:00Z', 3600, {
        eliminado_en: now,
      }),
    ],
    today,
    zone,
    now,
  );
  assert.deepEqual(
    list.map((item) => item.id),
    ['live', 'morning', 'cross'],
  );
});

test('relevant tasks: active, paused, recent work, then in progress and pending; never archived or completed', () => {
  const data = workspace({
    projects: [project('p1'), project('p2', now)],
    tasks: [
      task('pending-old', { actualizado_en: '2026-09-01T00:00:00Z' }),
      task('pending-new', { actualizado_en: '2026-10-01T00:00:00Z' }),
      task('in-progress', { estado: 'en_curso' }),
      task('recent-a'),
      task('recent-b'),
      task('paused'),
      task('active'),
      task('done', { estado: 'completada' }),
      task('archived', { archivado_en: now }),
      task('archived-project', { proyecto_id: 'p2' }),
    ],
    entries: [
      entry('a', 'recent-a', '2026-10-01T08:00:00Z', '2026-10-01T09:00:00Z', 3600),
      entry('b', 'recent-b', '2026-10-02T08:00:00Z', '2026-10-02T09:00:00Z', 3600),
      entry('c', 'done', '2026-10-02T10:00:00Z', '2026-10-02T11:00:00Z', 3600),
    ],
  });
  const result = relevantTasks(data, { activeTaskId: 'active', pausedTaskId: 'paused', limit: 10 });
  assert.deepEqual(
    result.map((item) => [item.task.id, item.reason]),
    [
      ['active', 'active'],
      ['paused', 'paused'],
      ['recent-b', 'recent'],
      ['recent-a', 'recent'],
      ['in-progress', 'in_progress'],
      ['pending-new', 'pending'],
      ['pending-old', 'pending'],
    ],
  );
  assert.equal(relevantTasks(data, { limit: 3 }).length, 3);
});

test('navigation: board belongs to tasks, tools are grouped and titles resolve', () => {
  const tasks = navigationGroups[0]!.items.find((item) => item.to === '/tareas')!;
  assert.equal(isNavItemActive(tasks, '/tablero'), true);
  assert.equal(isNavItemActive(tasks, '/partes-de-horas'), false);
  assert.deepEqual(
    navigationGroups.find((group) => group.id === 'tools')!.items.map((item) => item.to),
    ['/porcentajes', '/calculadora-de-horas', '/datos-ficticios', '/utilidades-desarrollo'],
  );
  // The 14 routes stay reachable: 12 menu entries, settings, and the board inside Tareas.
  assert.equal(navigationGroups.flatMap((group) => group.items).length, 12);
  assert.equal(pageTitle('/tablero'), 'Tablero de tareas');
  assert.equal(pageTitle('/ajustes'), 'Ajustes');
  assert.equal(pageTitle('/resumen'), 'Hoy');
});

test('sidebar preference parsing ignores corrupted storage', () => {
  assert.deepEqual(parseSidebarPreference(null), { hidden: false, rail: false });
  assert.deepEqual(parseSidebarPreference('{"hidden":true,"rail":"yes"}'), {
    hidden: true,
    rail: false,
  });
  assert.deepEqual(parseSidebarPreference('not json'), { hidden: false, rail: false });
  assert.deepEqual(parseSidebarPreference('[1]'), { hidden: false, rail: false });
});
