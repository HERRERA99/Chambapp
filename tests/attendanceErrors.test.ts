import assert from 'node:assert/strict';
import test from 'node:test';
import { readableError } from '../src/lib/supabase/errors.ts';

test('attendance database conflicts explain attendance while legacy part conflicts remain specific', () => {
  assert.match(
    readableError('violates exclusion constraint "fichajes_usuario_id_tstzrange_excl"'),
    /fichaje se solapa/,
  );
  assert.match(
    readableError('violates exclusion constraint "partes_horas_usuario_id_tstzrange_excl"'),
    /otro parte/,
  );
  assert.match(
    readableError('violates check constraint "fichajes_intervalo_valido"'),
    /salida debe ser posterior/,
  );
  assert.match(readableError('INTERVALO_REAL_FUTURO'), /no pueden estar en el futuro/);
  assert.match(
    readableError('violates check constraint "tareas_odoo_id_formato"'),
    /T seguido de números/,
  );
});
