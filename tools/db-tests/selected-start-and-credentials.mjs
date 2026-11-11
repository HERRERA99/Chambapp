import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifySelectedStartAndCredentials({
  admin,
  ca,
  cb,
  anonymous,
  noSession,
  client,
  rpc,
  expectError,
  ok,
}) {
  const user = randomUUID();
  await admin.query('insert into auth.users(id) values($1)', [user]);
  const c = await client(user);
  const project = await rpc(c, 'crear_proyecto', { nombre: 'Selected start' });
  const task = await rpc(c, 'crear_tarea', {
    proyecto_id: project.id,
    titulo: 'Retroactive timer',
  });
  const previous = await rpc(c, 'crear_parte', {
    tarea_id: task.id,
    inicio_en: '2026-08-01T08:00:00+02:00',
    fin_en: '2026-08-01T09:00:00.123456+02:00',
  });
  const payload = { operacion_id: randomUUID(), tarea_id: task.id, inicio_en: previous.fin_en };
  const started = await rpc(c, 'iniciar', payload);
  assert.equal(started.ok, true);
  assert.equal(started.parte.inicio_en, previous.fin_en);
  assert.equal(started.parte.fin_en, null);
  assert.equal(started.parte.imputado_en_odoo, false);
  assert.equal(
    (await c.query('select fecha::text from public.partes_detalle where id=$1', [started.parte.id]))
      .rows[0].fecha,
    '2026-08-01',
  );
  assert.deepEqual(await rpc(c, 'iniciar', payload), started);
  await expectError(
    () => rpc(c, 'iniciar', { ...payload, inicio_en: '2026-08-01T10:00:00+02:00' }),
    /OPERACION_ID_REUTILIZADO/,
  );
  await rpc(c, 'detener', { operacion_id: randomUUID(), parte_id: started.parte.id });
  await expectError(
    () =>
      rpc(c, 'iniciar', {
        operacion_id: randomUUID(),
        tarea_id: task.id,
        inicio_en: '2026-08-01T08:30:00+02:00',
      }),
    /exclusion constraint/,
  );
  await expectError(
    () =>
      rpc(c, 'iniciar', {
        operacion_id: randomUUID(),
        tarea_id: task.id,
        inicio_en: '2099-01-01T08:00:00Z',
      }),
    /INTERVALO_REAL_FUTURO/,
  );
  await expectError(
    () =>
      rpc(c, 'iniciar', {
        operacion_id: randomUUID(),
        tarea_id: task.id,
        inicio_en: '2026-08-01T08:00:00',
      }),
    /ZONA_HORARIA_REQUERIDA/,
  );
  const normal = await rpc(c, 'iniciar', { operacion_id: randomUUID(), tarea_id: task.id });
  assert.equal(normal.parte.inicio_en, normal.hora_servidor);
  await rpc(c, 'detener', { operacion_id: randomUUID(), parte_id: normal.parte.id });
  ok(
    'selected timer start preserves exact last end, historical date and retries; overlaps/future/offsetless starts rejected; current start unchanged',
  );

  // The Odoo API key was removed (20261111000000_remove_odoo_api_key.sql).
  await expectError(
    () => ca.query('select public.chambapp_configurar_odoo($1,$2)', [null, false]),
    /does not exist/,
  );
  assert.equal(
    (await admin.query("select to_regclass('chambapp_private.odoo_credenciales') t")).rows[0].t,
    null,
  );
  ok('the Odoo API key RPC and table no longer exist');
}
