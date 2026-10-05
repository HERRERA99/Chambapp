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

  const credential = async (connection, key = null, save = false) =>
    (
      await connection.query('select public.chambapp_configurar_odoo($1,$2) configured', [
        key,
        save,
      ])
    ).rows[0].configured;
  assert.equal(await credential(ca), false);
  assert.equal(await credential(ca, ' example-private-key ', true), true);
  assert.equal(await credential(ca), true);
  assert.equal(await credential(cb), false);
  assert.equal(await credential(cb, 'other-key', true), true);
  await expectError(
    () => ca.query('select * from chambapp_private.odoo_credenciales'),
    /permission denied/,
  );
  await expectError(() => credential(anonymous), /permission denied/);
  await expectError(() => credential(noSession), /SESION_REQUERIDA/);
  await expectError(() => credential(ca, 'x'.repeat(4097), true), /API_KEY_ODOO_INVALIDA/);
  assert.equal(await credential(ca), true);
  assert.equal(await credential(ca, 'replacement-key', true), true);
  assert.equal(await credential(ca, '', true), false);
  assert.equal(await credential(cb), true);
  assert.equal(await credential(cb, '', true), false);
  ok(
    'Odoo keys can be saved/replaced/deleted; status is account scoped; secrets and anonymous writes are inaccessible',
  );
}
