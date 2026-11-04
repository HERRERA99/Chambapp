import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifyOdooImputations({
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
  const imp = async (connection, action, data = {}) =>
    (await connection.query('select public.chambapp_imputaciones($1,$2) r', [action, data])).rows[0]
      .r;
  const project = await rpc(ca, 'crear_proyecto', { nombre: 'Imputaciones agrupadas' });
  const task = await rpc(ca, 'crear_tarea', { proyecto_id: project.id, titulo: 'Agrupar' });
  const otherTask = await rpc(ca, 'crear_tarea', { proyecto_id: project.id, titulo: 'Otra' });
  const part = (tarea_id, inicio_en, fin_en) =>
    rpc(ca, 'crear_parte', { tarea_id, inicio_en, fin_en });
  // 25 + 20 + 10 minutes of the same task and day.
  let p1 = await part(task.id, '2026-09-16T07:00:00Z', '2026-09-16T07:25:00Z');
  let p2 = await part(task.id, '2026-09-16T08:00:00Z', '2026-09-16T08:20:00Z');
  let p3 = await part(task.id, '2026-09-16T09:00:00Z', '2026-09-16T09:10:00Z');
  const p4 = await part(otherTask.id, '2026-09-16T10:00:00Z', '2026-09-16T10:30:00Z');
  const p5 = await part(task.id, '2026-09-17T07:00:00Z', '2026-09-17T07:30:00Z');
  const ref = (entry) => ({ id: entry.id, version: entry.version });
  const imputationRows = async (id) =>
    (await admin.query('select * from public.imputaciones_odoo where id=$1', [id])).rows;

  const grouped = await imp(ca, 'imputar_partes', { partes: [ref(p2), ref(p1)] });
  assert.equal(grouped.tarea_id, task.id);
  assert.equal(grouped.jornada_id, p1.jornada_id);
  assert.equal(grouped.estado, 'manual');
  assert.deepEqual(
    grouped.partes.map((item) => [
      item.id,
      item.version,
      item.imputacion_odoo_id,
      item.imputado_en_odoo,
    ]),
    [
      [p1.id, p1.version + 1, grouped.id, true],
      [p2.id, p2.version + 1, grouped.id, true],
    ],
  );
  const detail = (
    await ca.query(
      'select id,imputacion_odoo_id,imputado_en_odoo,version from public.partes_detalle where id = any($1) order by inicio_en',
      [[p1.id, p2.id, p3.id]],
    )
  ).rows;
  assert.deepEqual(
    detail.map((row) => [row.imputacion_odoo_id, row.imputado_en_odoo]),
    [
      [grouped.id, true],
      [grouped.id, true],
      [null, false],
    ],
  );
  p1 = { ...p1, version: grouped.partes[0].version };
  p2 = { ...p2, version: grouped.partes[1].version };
  ok('imputar_partes groups entries of one task and day in one manual imputation');

  await expectError(() => imp(ca, 'imputar_partes', { partes: [ref(p1)] }), /PARTE_YA_IMPUTADO/);
  await expectError(
    () => imp(ca, 'imputar_partes', { partes: [{ id: p3.id, version: p3.version + 1 }] }),
    /CONFLICTO_VERSION/,
  );
  await expectError(
    () => imp(ca, 'imputar_partes', { partes: [ref(p3), ref(p4)] }),
    /PARTES_DE_DISTINTO_GRUPO/,
  );
  await expectError(
    () => imp(ca, 'imputar_partes', { partes: [ref(p3), ref(p5)] }),
    /PARTES_DE_DISTINTO_GRUPO/,
  );
  await expectError(() => imp(cb, 'imputar_partes', { partes: [ref(p3)] }), /PARTE_NO_DISPONIBLE/);
  for (const partes of [
    [],
    [ref(p3), ref(p3)],
    [{ id: p3.id, version: 0 }],
    [{ id: p3.id, version: '1' }],
    [{ id: p3.id, version: 1.5 }],
    [{ id: 'x', version: 1 }],
    [p3.id],
    Array.from({ length: 1001 }, () => ({ id: randomUUID(), version: 1 })),
  ])
    await expectError(() => imp(ca, 'imputar_partes', { partes }), /IMPUTACION_DATOS_INVALIDOS/);
  await expectError(() => imp(ca, 'imputar_partes', { partes: {} }), /IMPUTACION_DATOS_INVALIDOS/);
  await expectError(() => imp(ca, 'imputar_partes', []), /DATOS_INVALIDOS/);
  await expectError(() => imp(ca, 'otra_cosa', {}), /ACCION_NO_ADMITIDA/);
  await expectError(
    () => imp(noSession, 'imputar_partes', { partes: [ref(p3)] }),
    /SESION_REQUERIDA/,
  );
  await expectError(
    () => imp(anonymous, 'imputar_partes', { partes: [ref(p3)] }),
    /permission denied/,
  );
  // The 1000-entry bound is a payload bound, checked before looking any entry up.
  await expectError(
    () =>
      imp(ca, 'imputar_partes', {
        partes: Array.from({ length: 1000 }, () => ({ id: randomUUID(), version: 1 })),
      }),
    /PARTE_NO_DISPONIBLE/,
  );
  const timer = await rpc(ca, 'iniciar', { operacion_id: randomUUID(), tarea_id: task.id });
  await expectError(
    () => imp(ca, 'imputar_partes', { partes: [ref(timer.parte)] }),
    /PARTE_EN_CURSO/,
  );
  await rpc(ca, 'detener', { operacion_id: randomUUID(), parte_id: timer.parte.id });
  ok('imputar_partes rejects imputed, stale, running, foreign, mixed-group and malformed requests');

  await expectError(
    () =>
      ca.query(
        'insert into public.imputaciones_odoo(usuario_id,tarea_id,jornada_id) values($1,$2,$3)',
        [p1.usuario_id, task.id, p1.jornada_id],
      ),
    /permission denied/,
  );
  await expectError(
    () =>
      ca.query('update public.partes_horas set imputacion_odoo_id=$1 where id=$2', [
        grouped.id,
        p3.id,
      ]),
    /permission denied/,
  );
  await expectError(() => ca.query('delete from public.imputaciones_odoo'), /permission denied/);
  // Even a privileged write cannot put an entry of another task into the imputation.
  await expectError(
    () =>
      admin.query('update public.partes_horas set imputacion_odoo_id=$1 where id=$2', [
        grouped.id,
        p4.id,
      ]),
    /partes_horas_imputacion_odoo_fk/,
  );
  assert.equal(
    (
      await admin.query(
        'select count(*)::int n from public.partes_horas where imputado_en_odoo <> (imputacion_odoo_id is not null)',
      )
    ).rows[0].n,
    0,
  );
  assert.equal((await cb.query('select * from public.imputaciones_odoo')).rows.length, 0);
  assert.equal(
    (await ca.query('select * from public.imputaciones_odoo where id=$1', [grouped.id])).rows
      .length,
    1,
  );
  ok('imputations are read-only for clients, owner-scoped and cannot mix tasks or days');

  // Legacy path: marking creates a single-entry imputation, moving keeps the mark.
  const marked = await rpc(ca, 'editar_parte', {
    id: p3.id,
    version: p3.version,
    imputado_en_odoo: true,
  });
  assert.equal(marked.imputado_en_odoo, true);
  const single = marked.imputacion_odoo_id;
  assert.equal((await imputationRows(single))[0].tarea_id, task.id);
  const moved = await rpc(ca, 'editar_parte', {
    id: p3.id,
    version: marked.version,
    tarea_id: otherTask.id,
  });
  assert.equal(moved.imputado_en_odoo, true);
  assert.notEqual(moved.imputacion_odoo_id, single);
  assert.equal((await imputationRows(moved.imputacion_odoo_id))[0].tarea_id, otherTask.id);
  assert.equal((await imputationRows(single)).length, 0);
  const unmarked = await rpc(ca, 'editar_parte', {
    id: p3.id,
    version: moved.version,
    imputado_en_odoo: false,
  });
  assert.equal(unmarked.imputacion_odoo_id, null);
  assert.equal((await imputationRows(moved.imputacion_odoo_id)).length, 0);
  ok('legacy marks map to single-entry imputations; moving re-homes them and unmarking cleans up');

  const undone = await imp(ca, 'deshacer_imputacion', { id: grouped.id });
  assert.equal(undone.id, grouped.id);
  assert.deepEqual(
    undone.partes.map((item) => [
      item.id,
      item.version,
      item.imputacion_odoo_id,
      item.imputado_en_odoo,
    ]),
    [
      [p1.id, p1.version + 1, null, false],
      [p2.id, p2.version + 1, null, false],
    ],
  );
  assert.equal((await imputationRows(grouped.id)).length, 0);
  await expectError(
    () => imp(ca, 'deshacer_imputacion', { id: grouped.id }),
    /IMPUTACION_NO_DISPONIBLE/,
  );
  await expectError(
    () => imp(ca, 'deshacer_imputacion', { id: 'x' }),
    /IMPUTACION_DATOS_INVALIDOS/,
  );
  p1 = { ...p1, version: undone.partes[0].version };
  p2 = { ...p2, version: undone.partes[1].version };
  const again = await imp(ca, 'imputar_partes', { partes: [ref(p1), ref(p2)] });
  await expectError(
    () => imp(cb, 'deshacer_imputacion', { id: again.id }),
    /IMPUTACION_NO_DISPONIBLE/,
  );
  const tomb = await rpc(ca, 'eliminar_parte', { id: p2.id, version: again.partes[1].version });
  assert.equal(tomb.imputacion_odoo_id, again.id);
  const partial = await imp(ca, 'deshacer_imputacion', { id: again.id });
  assert.deepEqual(
    partial.partes.map((item) => item.id),
    [p1.id],
  );
  // The tombstone keeps its reference, so the imputation row stays (invisible in partes_detalle).
  assert.equal((await imputationRows(again.id)).length, 1);
  ok('deshacer_imputacion frees active entries, keeps tombstone references and is owner-scoped');

  p1 = { ...p1, version: partial.partes[0].version };
  const [first, second] = [await client(p1.usuario_id), await client(p1.usuario_id)];
  const races = await Promise.allSettled([
    imp(first, 'imputar_partes', { partes: [ref(p1)] }),
    imp(second, 'imputar_partes', { partes: [ref(p1)] }),
  ]);
  assert.equal(races.filter((item) => item.status === 'fulfilled').length, 1);
  assert.match(
    races.find((item) => item.status === 'rejected').reason.message,
    /CONFLICTO_VERSION|PARTE_YA_IMPUTADO/,
  );
  ok('concurrent imputations of the same entry: exactly one succeeds');
}
