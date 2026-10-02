import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isRetryableStatus,
  isValidCommandResponse,
} from '../src/lib/supabase/commandValidation.ts';

const userId = '11111111-1111-1111-1111-111111111111';
const taskId = '22222222-2222-2222-2222-222222222222';
const partId = '33333333-3333-3333-3333-333333333333';
const time = '2026-10-01T07:07:14.123456Z';
const part = { id: partId, tarea_id: taskId, usuario_id: userId, inicio_en: time, fin_en: null };

test('only a complete timer reply matching the intended task/part is confirmed', () => {
  const reply = { ok: true, parte: part, hora_servidor: time };
  assert.equal(isValidCommandResponse('iniciar', { tarea_id: taskId }, reply), true);
  assert.equal(isValidCommandResponse('iniciar', { tarea_id: partId }, reply), false);
  assert.equal(isValidCommandResponse('iniciar', { tarea_id: taskId }, { ok: true }), false);
  assert.equal(
    isValidCommandResponse('iniciar', { tarea_id: taskId }, { ...reply, hora_servidor: 'invalid' }),
    false,
  );
  assert.equal(isValidCommandResponse('detener', { parte_id: partId }, reply), false);
  assert.equal(
    isValidCommandResponse(
      'detener',
      { parte_id: partId },
      { ...reply, parte: { ...part, fin_en: time } },
    ),
    true,
  );
  assert.equal(
    isValidCommandResponse(
      'detener',
      { parte_id: taskId },
      { ...reply, parte: { ...part, fin_en: time } },
    ),
    false,
  );
});

test('lost replies, expired authentication and throttling keep the original operation for retry', () => {
  for (const status of [0, 401, 403, 408, 429, 500, 503])
    assert.equal(isRetryableStatus(status), true);
  for (const status of [200, 400, 404, 409, 422]) assert.equal(isRetryableStatus(status), false);
});

test('business conflicts are confirmed outcomes; empty or malformed responses remain unknown', () => {
  assert.equal(
    isValidCommandResponse('iniciar', {}, { ok: false, codigo: 'CRONOMETRO_ACTIVO' }),
    true,
  );
  assert.equal(isValidCommandResponse('iniciar', {}, { ok: false }), false);
  assert.equal(isValidCommandResponse('crear_proyecto', {}, null), false);
  assert.equal(isValidCommandResponse('crear_proyecto', {}, []), false);
  assert.equal(isValidCommandResponse('crear_proyecto', {}, { id: partId, version: 1 }), true);
  assert.equal(isValidCommandResponse('editar_proyecto', {}, { id: partId, version: 0 }), false);
  assert.equal(
    isValidCommandResponse('consultar_cronometro', {}, { parte: null, hora_servidor: time }),
    true,
  );
  assert.equal(isValidCommandResponse('consultar_cronometro', {}, { parte: null }), false);
  assert.equal(isValidCommandResponse('generar_semana', {}, { jornadas: [] }), true);
  assert.equal(isValidCommandResponse('generar_semana', {}, { jornadas: null }), false);
});

test('attendance confirms only complete responses matching the durable intent', () => {
  const row = {
    id: partId,
    usuario_id: userId,
    jornada_id: taskId,
    inicio_en: time,
    fin_en: null,
    eliminado_en: null,
    version: 1,
  };
  const payload = { id: partId };
  assert.equal(isValidCommandResponse('fichar_entrada', payload, row), true);
  assert.equal(isValidCommandResponse('crear_fichaje', payload, row), true);
  assert.equal(isValidCommandResponse('fichar_entrada', payload, { ...row, id: taskId }), false);
  assert.equal(isValidCommandResponse('fichar_entrada', payload, { ...row, version: 0 }), false);
  assert.equal(
    isValidCommandResponse('fichar_entrada', payload, { ...row, jornada_id: null }),
    false,
  );
  assert.equal(isValidCommandResponse('fichar_salida', payload, row), false);
  assert.equal(
    isValidCommandResponse('fichar_salida', payload, { ...row, fin_en: time, version: 2 }),
    true,
  );
  assert.equal(
    isValidCommandResponse('editar_fichaje', payload, { ...row, fin_en: 'invalid' }),
    false,
  );
  assert.equal(isValidCommandResponse('eliminar_fichaje', payload, row), false);
  assert.equal(
    isValidCommandResponse('eliminar_fichaje', payload, { ...row, eliminado_en: time, version: 2 }),
    true,
  );
  assert.equal(
    isValidCommandResponse('fichar_entrada', payload, { ...row, fin_en: time, version: 2 }),
    true,
  );
});

test('manual Odoo status confirms only a response containing the requested boolean', () => {
  const payload = { id: partId, version: 1, imputado_en_odoo: true };
  const row = { id: partId, version: 2, imputado_en_odoo: true };
  assert.equal(isValidCommandResponse('editar_parte', payload, row), true);
  assert.equal(isValidCommandResponse('editar_parte', payload, { ...row, id: taskId }), false);
  assert.equal(
    isValidCommandResponse('editar_parte', payload, { ...row, imputado_en_odoo: false }),
    false,
  );
  assert.equal(
    isValidCommandResponse('editar_parte', payload, { ...row, imputado_en_odoo: null }),
    false,
  );
  assert.equal(isValidCommandResponse('editar_parte', payload, { id: partId, version: 2 }), false);
  assert.equal(
    isValidCommandResponse('crear_parte', {}, { ...row, imputado_en_odoo: false }),
    true,
  );
});
