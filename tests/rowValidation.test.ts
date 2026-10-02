import assert from 'node:assert/strict';
import test from 'node:test';
import { assertAttendance, assertEntry, assertTask } from '../src/lib/supabase/rowValidation.ts';
import type { Database } from '../src/lib/supabase/database.types.ts';

const entry: Database['public']['Views']['partes_detalle']['Row'] = {
  id: '11111111-1111-1111-1111-111111111111',
  usuario_id: '22222222-2222-2222-2222-222222222222',
  tarea_id: '33333333-3333-3333-3333-333333333333',
  jornada_id: '44444444-4444-4444-4444-444444444444',
  proyecto_id: '55555555-5555-5555-5555-555555555555',
  odoo_id: null,
  odoo_url: null,
  fecha: '2026-10-01',
  zona_horaria: 'Europe/Madrid',
  inicio_en: '2026-10-01T07:07:14.123456Z',
  fin_en: '2026-10-01T07:07:14.123457Z',
  inicio_imputado_en: '2026-10-01T07:07:14.123456Z',
  fin_imputado_en: '2026-10-01T07:07:14.123457Z',
  intervalo_redondeo_minutos: 15,
  modo_redondeo: 'superior',
  descripcion: null,
  eliminado_en: null,
  version: 1,
  duracion_real_segundos: 0.000001,
  duracion_imputada_segundos: 900,
  creado_en: '2026-10-01T07:07:14.123456Z',
  actualizado_en: '2026-10-01T07:07:14.123457Z',
};

test('preserves valid submillisecond server intervals instead of comparing truncated browser timestamps', () => {
  assert.doesNotThrow(() => assertEntry(entry));
  assert.doesNotThrow(() =>
    assertEntry({
      ...entry,
      fin_en: null,
      fin_imputado_en: null,
      duracion_real_segundos: null,
      duracion_imputada_segundos: null,
    }),
  );
});

test('cannot display finalized totals from incomplete or invalid view data', () => {
  assert.throws(() => assertEntry({ ...entry, tarea_id: null }));
  assert.throws(() => assertEntry({ ...entry, duracion_imputada_segundos: null }));
  assert.throws(() => assertEntry({ ...entry, duracion_real_segundos: NaN }));
  assert.throws(() => assertEntry({ ...entry, intervalo_redondeo_minutos: 7 }));
  assert.throws(() => assertEntry({ ...entry, inicio_en: 'not-an-instant' }));
});

const attendance: Database['public']['Views']['fichajes_detalle']['Row'] = {
  id: entry.id,
  usuario_id: entry.usuario_id,
  jornada_id: entry.jornada_id,
  inicio_en: entry.inicio_en,
  fin_en: entry.fin_en,
  eliminado_en: null,
  creado_en: entry.creado_en,
  actualizado_en: entry.actualizado_en,
  version: 1,
  fecha: entry.fecha,
  zona_horaria: entry.zona_horaria,
  duracion_segundos: 0.000001,
};

test('attendance API preserves exact server precision and validates closed and open totals', () => {
  assert.doesNotThrow(() => assertAttendance(attendance));
  assert.doesNotThrow(() =>
    assertAttendance({ ...attendance, fin_en: null, duracion_segundos: null }),
  );
  assert.throws(() => assertAttendance({ ...attendance, jornada_id: null }));
  assert.throws(() => assertAttendance({ ...attendance, duracion_segundos: null }));
  assert.throws(() => assertAttendance({ ...attendance, duracion_segundos: -1 }));
  assert.throws(() => assertAttendance({ ...attendance, duracion_segundos: Number.NaN }));
  assert.throws(() => assertAttendance({ ...attendance, fin_en: null }));
  assert.throws(() => assertAttendance({ ...attendance, version: 0 }));
  assert.throws(() => assertAttendance({ ...attendance, inicio_en: 'invalid' }));
});

test('task API validates optional Odoo metadata before exposing navigation', () => {
  const task: Database['public']['Tables']['tareas']['Row'] = {
    id: entry.tarea_id!,
    usuario_id: entry.usuario_id!,
    proyecto_id: entry.proyecto_id!,
    titulo: 'Integración Odoo',
    descripcion: null,
    estado: 'pendiente',
    estimacion_minutos: null,
    odoo_id: null,
    odoo_url: null,
    archivado_en: null,
    eliminado_en: null,
    creado_en: entry.creado_en!,
    actualizado_en: entry.actualizado_en!,
    version: 1,
  };
  assert.doesNotThrow(() => assertTask(task));
  assert.doesNotThrow(() =>
    assertTask({ ...task, odoo_id: 'T443212', odoo_url: 'https://odoo.example.com/web#id=443212' }),
  );
  assert.throws(() => assertTask({ ...task, odoo_id: '443212' }));
  assert.throws(() => assertTask({ ...task, odoo_url: 'javascript:alert(1)' }));
});
