import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkspaceData, Workday, WeeklyConfiguration } from '../src/domain/models.ts';
import {
  initialSchedule,
  minimumScheduleMonday,
  presetMinutes,
  profileDraft,
} from '../src/features/settings/settingsDraft.ts';

const now = '2026-10-01T12:00:00.000Z';
const today = '2026-10-01';
function workspace(): WorkspaceData {
  return {
    profile: {
      id: 'user-1',
      nombre: 'Aitor',
      zona_horaria: 'Europe/Madrid',
      intervalo_redondeo_minutos: 15,
      modo_redondeo: 'hacia_arriba',
      onboarding_completado: true,
      preferencias: {},
      creado_en: now,
      actualizado_en: now,
      version: 1,
    },
    projects: [],
    tasks: [],
    notes: [],
    entries: [],
    configurations: [],
    days: [],
    jornadas: [],
    fichajes: [],
    absences: [],
    serverTime: now,
    receivedAt: Date.parse(now),
  };
}
function configuration(id: string, since: string, minutes = 2250): WeeklyConfiguration {
  return {
    id,
    usuario_id: 'user-1',
    vigente_desde: since,
    minutos_semanales: minutes,
    creado_en: now,
  };
}
function workday(date: string): Workday {
  return {
    id: date,
    usuario_id: 'user-1',
    fecha: date,
    zona_horaria: 'Europe/Madrid',
    configuracion_id: null,
    minutos_objetivo: 480,
    notas: null,
    creado_en: now,
    actualizado_en: now,
    version: 1,
  };
}

test('uses this Monday when there is no existing schedule or workday history', () => {
  assert.equal(minimumScheduleMonday(workspace(), today), '2026-09-28');
});

test('protects this week when its Monday already has a schedule or any day has history', () => {
  const data = workspace();
  data.configurations = [configuration('a', '2026-09-28')];
  assert.equal(minimumScheduleMonday(data, today), '2026-10-05');
  data.configurations = [];
  data.jornadas = [workday('2026-09-30')];
  assert.equal(minimumScheduleMonday(data, today), '2026-10-05');
});

test('ignores older history and future days when choosing the minimum Monday', () => {
  const data = workspace();
  data.jornadas = [workday('2026-09-27'), workday('2026-10-05')];
  assert.equal(minimumScheduleMonday(data, today), '2026-09-28');
});

test('skips occupied future Mondays, copies the current allocation, and leaves source order intact', () => {
  const data = workspace();
  data.configurations = [
    configuration('future', '2026-10-05', 2400),
    configuration('current', '2026-09-28'),
  ];
  data.days = [480, 480, 480, 480, 330].map((minutes, index) => ({
    configuracion_id: 'current',
    dia_semana: index + 1,
    minutos_objetivo: minutes,
  }));
  const idsBefore = data.configurations.map((row) => row.id);
  assert.deepEqual(initialSchedule(data, today), {
    mode: '37.5',
    effectiveDate: '2026-10-12',
    minutes: [480, 480, 480, 480, 330, 0, 0],
  });
  assert.deepEqual(
    data.configurations.map((row) => row.id),
    idsBefore,
  );
});

test('preserves an asymmetric allocation including weekend work', () => {
  const data = workspace();
  data.configurations = [configuration('current', '2026-09-28', 2100)];
  data.days = [
    { configuracion_id: 'current', dia_semana: 1, minutos_objetivo: 1200 },
    { configuracion_id: 'current', dia_semana: 7, minutos_objetivo: 900 },
  ];
  assert.deepEqual(initialSchedule(data, today).minutes, [1200, 0, 0, 0, 0, 0, 900]);
  assert.equal(initialSchedule(data, today).mode, 'manual');
});

test('presets match their weekly totals and return independently editable arrays', () => {
  assert.equal(
    presetMinutes('37.5')!.reduce((a, b) => a + b),
    2250,
  );
  assert.equal(
    presetMinutes('40')!.reduce((a, b) => a + b),
    2400,
  );
  assert.equal(
    presetMinutes('35')!.reduce((a, b) => a + b),
    2100,
  );
  const edited = presetMinutes('40')!;
  edited[0] = 0;
  assert.equal(presetMinutes('40')![0], 480);
  assert.equal(presetMinutes('manual'), null);
});

test('profile drafts retain valid saved preferences and safely default incompatible JSON values', () => {
  const data = workspace();
  data.profile.preferencias = { workspace: 'My Studio', especialidad: 'Engineering' };
  assert.deepEqual(profileDraft(data), {
    nombre: 'Aitor',
    workspace: 'My Studio',
    especialidad: 'Engineering',
    zonaHoraria: 'Europe/Madrid',
    intervaloRedondeo: 15,
    almacenamiento: 'nube',
    avisoCopiaDias: 7,
  });
  data.profile.preferencias = { workspace: { nested: true }, especialidad: 42 };
  assert.equal(profileDraft(data).workspace, 'Mi Workspace');
  assert.equal(profileDraft(data).especialidad, '');
  // Storage mode and backup reminder (Plan 11).
  data.profile.preferencias = { almacenamiento: 'local', aviso_copia_dias: 0 };
  assert.equal(profileDraft(data).almacenamiento, 'local');
  assert.equal(profileDraft(data).avisoCopiaDias, 0);
  data.profile.preferencias = { almacenamiento: 'disco', aviso_copia_dias: -3 };
  assert.equal(profileDraft(data).almacenamiento, 'nube');
  assert.equal(profileDraft(data).avisoCopiaDias, 7);
});
