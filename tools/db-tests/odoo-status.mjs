import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifyOdooStatus({ ca, cb, client, rpc, expectError, ok }) {
  const project = await rpc(ca, 'crear_proyecto', { nombre: 'Manual Odoo status' });
  const task = await rpc(ca, 'crear_tarea', {
    proyecto_id: project.id,
    titulo: 'Without Odoo link',
  });
  assert.equal(task.odoo_url, null);
  const first = await rpc(ca, 'crear_parte', {
    tarea_id: task.id,
    inicio_en: '2026-09-15T08:15:00.000001Z',
    fin_en: '2026-09-15T08:15:00.000002Z',
  });
  assert.equal(first.imputado_en_odoo, false);
  const tagged = await rpc(ca, 'crear_parte', {
    tarea_id: task.id,
    inicio_en: '2026-09-15T09:07:12.125Z',
    fin_en: '2026-09-15T10:08:13.375Z',
    imputado_en_odoo: true,
  });
  assert.equal(tagged.imputado_en_odoo, true);
  const read = async (id) =>
    (await ca.query('select * from public.partes_detalle where id=$1', [id])).rows[0];
  const original = await read(first.id);
  let changed = await rpc(ca, 'editar_parte', {
    id: first.id,
    version: first.version,
    imputado_en_odoo: true,
  });
  assert.equal(changed.version, first.version + 1);
  assert.equal(changed.inicio_en, first.inicio_en);
  assert.equal(changed.fin_en, first.fin_en);
  assert.equal(changed.jornada_id, first.jornada_id);
  const stripStatus = ({ imputado_en_odoo, version, actualizado_en, ...rest }) => rest;
  const marked = await read(first.id);
  assert.equal(marked.imputado_en_odoo, true);
  assert.deepEqual(stripStatus(marked), stripStatus(original));
  assert.equal(Number(marked.duracion_real_segundos), 0.000001);
  changed = await rpc(ca, 'editar_parte', {
    id: changed.id,
    version: changed.version,
    descripcion: 'Still marked',
  });
  assert.equal(changed.imputado_en_odoo, true);
  const cleared = await rpc(ca, 'editar_parte', {
    id: changed.id,
    version: changed.version,
    imputado_en_odoo: false,
  });
  assert.equal(cleared.imputado_en_odoo, false);
  assert.equal(cleared.inicio_en, first.inicio_en);
  assert.equal(cleared.fin_en, first.fin_en);
  ok(
    'manual Odoo status defaults to pending, works without a task link and preserves exact timestamps/durations when toggled',
  );

  for (const imputado_en_odoo of [null, 'true', 1, [], {}]) {
    await expectError(
      () => rpc(ca, 'editar_parte', { id: cleared.id, version: cleared.version, imputado_en_odoo }),
      /IMPUTACION_ODOO_INVALIDA/,
    );
    await expectError(
      () =>
        rpc(ca, 'crear_parte', {
          tarea_id: task.id,
          inicio_en: '2026-09-15T11:00:00Z',
          fin_en: '2026-09-15T12:00:00Z',
          imputado_en_odoo,
        }),
      /IMPUTACION_ODOO_INVALIDA/,
    );
  }
  await expectError(
    () =>
      rpc(ca, 'editar_parte', { id: cleared.id, version: first.version, imputado_en_odoo: true }),
    /CONFLICTO_VERSION/,
  );
  await expectError(
    () =>
      rpc(cb, 'editar_parte', { id: cleared.id, version: cleared.version, imputado_en_odoo: true }),
    /PARTE_NO_DISPONIBLE/,
  );
  assert.equal(
    (await cb.query('select * from public.partes_detalle where id=$1', [cleared.id])).rows.length,
    0,
  );
  await expectError(
    () =>
      ca.query('update public.partes_horas set imputado_en_odoo=true where id=$1', [cleared.id]),
    /permission denied/,
  );
  const otherA = await client(cleared.usuario_id),
    otherB = await client(cleared.usuario_id);
  const races = await Promise.allSettled([
    rpc(otherA, 'editar_parte', {
      id: cleared.id,
      version: cleared.version,
      imputado_en_odoo: true,
    }),
    rpc(otherB, 'editar_parte', {
      id: cleared.id,
      version: cleared.version,
      imputado_en_odoo: false,
    }),
  ]);
  assert.equal(races.filter((item) => item.status === 'fulfilled').length, 1);
  assert.match(
    races.find((item) => item.status === 'rejected').reason.message,
    /CONFLICTO_VERSION/,
  );
  ok(
    'Odoo status accepts only booleans and retains RPC ownership, RLS, direct-write protection and optimistic concurrency',
  );

  const started = await rpc(ca, 'iniciar', { operacion_id: randomUUID(), tarea_id: task.id });
  assert.equal(started.parte.imputado_en_odoo, false);
  const active = await rpc(ca, 'editar_parte', {
    id: started.parte.id,
    version: started.parte.version,
    imputado_en_odoo: true,
  });
  assert.equal(active.fin_en, null);
  assert.equal(active.inicio_en, started.parte.inicio_en);
  const stopped = await rpc(ca, 'detener', { operacion_id: randomUUID(), parte_id: active.id });
  assert.equal(stopped.parte.imputado_en_odoo, true);
  const tombstone = await rpc(ca, 'eliminar_parte', { id: tagged.id, version: tagged.version });
  assert.equal(tombstone.imputado_en_odoo, true);
  assert.equal(
    (await ca.query('select * from public.partes_detalle where id=$1', [tagged.id])).rows.length,
    0,
  );
  await expectError(
    () =>
      rpc(ca, 'editar_parte', {
        id: tagged.id,
        version: tombstone.version,
        imputado_en_odoo: false,
      }),
    /PARTE_NO_DISPONIBLE/,
  );
  ok(
    'timer creation starts pending, stopping preserves manual status and deleted parts cannot be marked',
  );
}
