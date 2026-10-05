import assert from 'node:assert/strict';
import { buildWeek, describeBalance } from '../src/features/week/week.model.ts';

const monday = '2026-09-28';
const data = {
  profile: { zona_horaria: 'Europe/Madrid' },
  fichajes: [],
  configurations: [
    { id: 'future', vigente_desde: '2026-10-05', minutos_semanales: 1200 },
    { id: 'old', vigente_desde: '2026-09-21', minutos_semanales: 2250 },
    { id: 'current', vigente_desde: monday, minutos_semanales: 1800 },
  ],
  days: [
    { configuracion_id: 'current', dia_semana: 1, minutos_objetivo: 480 },
    { configuracion_id: 'current', dia_semana: 2, minutos_objetivo: 480 },
    { configuracion_id: 'current', dia_semana: 7, minutos_objetivo: 840 },
    { configuracion_id: 'old', dia_semana: 1, minutos_objetivo: 450 },
    { configuracion_id: 'future', dia_semana: 1, minutos_objetivo: 1200 },
  ],
  jornadas: [
    { id: 'monday', fecha: monday, minutos_objetivo: 400 },
    { id: 'weekend', fecha: '2026-10-04', minutos_objetivo: 0 },
    { id: 'outside', fecha: '2026-10-05', minutos_objetivo: 1200 },
  ],
  tasks: [{ id: 'task', proyecto_id: 'project', archivado_en: null }],
  projects: [{ id: 'project', nombre: 'Cliente A', archivado_en: null }],
  entries: [
    {
      id: 'late',
      fecha: monday,
      tarea_id: 'task',
      proyecto_id: 'project',
      inicio_en: '2026-09-28T10:00:00Z',
      fin_en: '2026-09-28T10:08:00Z',
      duracion_real_segundos: 480,
      duracion_imputada_segundos: 900,
    },
    {
      id: 'early',
      fecha: monday,
      tarea_id: 'task',
      proyecto_id: 'project',
      inicio_en: '2026-09-28T09:07:00+02:00',
      fin_en: '2026-09-28T13:15:00+02:00',
      duracion_real_segundos: 14880,
      duracion_imputada_segundos: 15300,
    },
    {
      id: 'active',
      fecha: monday,
      tarea_id: 'task',
      proyecto_id: 'project',
      inicio_en: '2026-09-28T11:00:00Z',
      fin_en: null,
      duracion_real_segundos: null,
      duracion_imputada_segundos: null,
    },
    {
      id: 'sunday',
      fecha: '2026-10-04',
      tarea_id: 'task',
      proyecto_id: 'project',
      inicio_en: '2026-10-04T09:00:00Z',
      fin_en: '2026-10-04T10:00:00Z',
      duracion_real_segundos: 3600,
      duracion_imputada_segundos: 3600,
    },
    {
      id: 'outside',
      fecha: '2026-10-05',
      tarea_id: 'task',
      proyecto_id: 'project',
      inicio_en: '2026-10-05T09:00:00Z',
      fin_en: '2026-10-05T10:00:00Z',
      duracion_real_segundos: 3600,
      duracion_imputada_segundos: 3600,
    },
  ],
};
const week = buildWeek(data, monday, '2026-10-01');
assert.equal(week.days.length, 7);
assert.equal(week.days[0].date, monday);
assert.equal(week.days[6].date, '2026-10-04');
assert.equal(week.days[3].isToday, true);
assert.equal(week.days[4].isFuture, true);
assert.equal(week.configuration.id, 'current');
assert.equal(week.missingDays, 1);
assert.equal(week.days[0].plannedTargetSeconds, 480 * 60);
assert.equal(week.days[0].targetSeconds, 400 * 60);
assert.equal(week.days[6].targetSeconds, 0);
assert.equal(week.days[6].plannedTargetSeconds, 840 * 60);
assert.deepEqual(
  week.days[0].blocks.map((block) => block.entry.id),
  ['early', 'late', 'active'],
);
assert.equal(week.days[0].realSeconds, 15360);
assert.equal(week.days[0].loggedSeconds, 16200);
assert.equal(week.realSeconds, 18960);
assert.equal(week.loggedSeconds, 19800);
assert.equal(week.targetSeconds, 24000);
assert.equal(week.entries.length, 4);
assert.equal(week.workdays, 1);
assert.equal(week.completedDays, 0);
assert.equal(week.workedSeconds, 0);
assert.equal(week.canAdd, true);
assert.equal(week.days[0].blocks[0].project.nombre, 'Cliente A');
assert.equal(describeBalance(0), 'Objetivo cumplido');
assert.equal(describeBalance(-60), '00h 01m pendientes');
assert.equal(describeBalance(60), '00h 01m a favor');
console.log(
  'PASS: real week selection, seven dates, current configuration, historical overrides, exact ordering, finalized totals and active separation.',
);

const previous = buildWeek(data, '2026-09-21', '2026-10-01');
assert.equal(previous.configuration.id, 'old');
assert.equal(previous.entries.length, 0);
assert.equal(previous.targetSeconds, 0);
assert.equal(previous.missingDays, 1);
const future = buildWeek(data, '2026-10-05', '2026-10-01');
assert.equal(future.configuration.id, 'future');
assert.equal(
  future.days.every((day) => day.isFuture),
  true,
);
assert.equal(future.entries.length, 1);
assert.equal(
  buildWeek(
    { ...data, tasks: [{ ...data.tasks[0], archivado_en: '2026-10-01' }] },
    monday,
    '2026-10-01',
  ).canAdd,
  false,
);
assert.equal(buildWeek({ ...data, projects: [] }, monday, '2026-10-01').canAdd, false);
const noConfiguration = buildWeek(
  { ...data, configurations: [], days: [], jornadas: [], entries: [] },
  monday,
  '2026-10-01',
);
assert.equal(noConfiguration.configuration, undefined);
assert.equal(noConfiguration.missingDays, 0);
assert.equal(noConfiguration.entries.length, 0);
assert.equal(noConfiguration.targetSeconds, 0);
console.log(
  'PASS: previous/future week navigation, unsaved objectives, archived/missing projects and empty account.',
);

const attendedWeek = buildWeek(
  {
    ...data,
    fichajes: [
      { inicio_en: '2026-09-28T07:00:00Z', fin_en: '2026-09-28T14:00:00Z', eliminado_en: null },
      { inicio_en: '2026-10-01T08:00:00Z', fin_en: null, eliminado_en: null },
    ],
  },
  monday,
  '2026-10-01',
  '2026-10-01T09:00:00Z',
);
assert.equal(attendedWeek.workedSeconds, 8 * 3600);
assert.equal(attendedWeek.provisionalSeconds, 3600);
assert.equal(attendedWeek.days[0].workedSeconds, 7 * 3600);
assert.equal(attendedWeek.days[3].workedSeconds, 3600);
assert.equal(attendedWeek.completedAttendanceDays, 1);
assert.equal(attendedWeek.loggedSeconds, week.loggedSeconds);
assert.equal(attendedWeek.completedDays, 0);
console.log(
  'PASS: attendance drives weekly and daily balances, including open attendance independently of task time.',
);
