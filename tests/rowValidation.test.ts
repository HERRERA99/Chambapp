import assert from 'node:assert/strict';
import test from 'node:test';
import { assertEntry } from '../src/lib/supabase/rowValidation.ts';
import type { Database } from '../src/lib/supabase/database.types.ts';

const entry: Database['public']['Views']['partes_detalle']['Row'] = {
  id: '11111111-1111-1111-1111-111111111111',
  usuario_id: '22222222-2222-2222-2222-222222222222',
  tarea_id: '33333333-3333-3333-3333-333333333333',
  jornada_id: '44444444-4444-4444-4444-444444444444',
  proyecto_id: '55555555-5555-5555-5555-555555555555',
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
