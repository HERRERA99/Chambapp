import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';

// Plan 11: links to records kept in the browser, and moving a project between stores.
const envelope = (size = 32) =>
  `v1.${randomBytes(12).toString('base64url')}.${randomBytes(size).toString('base64url')}`;

export async function verifyLocalStorage({ admin, client, rpc, expectError, ok }) {
  const userA = randomUUID();
  const userB = randomUUID();
  await admin.query('insert into auth.users values ($1,$2),($3,$4)', [
    userA,
    { nombre: 'Local A' },
    userB,
    { nombre: 'Local B' },
  ]);
  const ca = await client(userA);
  const cb = await client(userB);
  const call = async (connection, fn, action, data) =>
    (await connection.query(`select public.${fn}($1,$2) r`, [action, data])).rows[0].r;
  const notes = (c, action, data) => call(c, 'chambapp_notas', action, data);
  const credentials = (c, action, data) => call(c, 'chambapp_credenciales', action, data);
  const moves = (c, action, data) => call(c, 'chambapp_traspasos', action, data);

  // ---- notes link local ids, never another account's or deleted cloud records
  const localProject = randomUUID();
  const localTask = randomUUID();
  const own = await rpc(ca, 'crear_proyecto', { nombre: 'Nube A' });
  const foreign = await rpc(cb, 'crear_proyecto', { nombre: 'Nube B' });
  const foreignTask = await rpc(cb, 'crear_tarea', { proyecto_id: foreign.id, titulo: 'Ajena' });
  const note = await notes(ca, 'guardar_nota', {
    id: randomUUID(),
    titulo: 'Con enlaces locales',
    contenido_md: 'x',
    proyecto_ids: [localProject, own.id],
    tarea_ids: [localTask],
  });
  assert.deepEqual(note.proyecto_ids, [localProject, own.id].sort());
  assert.deepEqual(note.tarea_ids, [localTask]);
  await expectError(
    () =>
      notes(ca, 'guardar_nota', {
        id: randomUUID(),
        titulo: 'Ajena',
        contenido_md: 'x',
        proyecto_ids: [foreign.id],
        tarea_ids: [],
      }),
    /PROYECTO_NO_DISPONIBLE/,
  );
  await expectError(
    () =>
      notes(ca, 'guardar_nota', {
        id: randomUUID(),
        titulo: 'Ajena',
        contenido_md: 'x',
        proyecto_ids: [],
        tarea_ids: [foreignTask.id],
      }),
    /TAREA_NO_DISPONIBLE/,
  );
  // Another account sees neither the note nor anything about the local ids.
  assert.equal((await cb.query('select * from public.nota_proyectos')).rows.length, 0);
  // A deleted cloud project disappears from the links; local ids stay.
  await rpc(ca, 'eliminar_proyecto', { id: own.id, version: own.version, confirmar_cascada: true });
  const after = (await ca.query('select * from public.notas_detalle where id=$1', [note.id]))
    .rows[0];
  assert.deepEqual(after.proyecto_ids, [localProject]);
  ok(
    'notes link projects and tasks kept in the browser; other accounts and deleted records refused',
  );

  // ---- credentials of local projects
  const vaultGeneration = randomUUID();
  await call(ca, 'chambapp_boveda', 'crear_boveda', {
    generacion: vaultGeneration,
    sal: randomBytes(16).toString('base64url'),
    iteraciones: 600000,
    clave_envuelta: envelope(48),
  });
  const secret = await credentials(ca, 'guardar_credencial', {
    id: randomUUID(),
    proyecto_id: localProject,
    boveda_generacion: vaultGeneration,
    cifrado: envelope(),
  });
  assert.equal(secret.proyecto_id, localProject);
  assert.equal(
    (
      await ca.query('select count(*)::int n from public.credenciales_detalle where id=$1', [
        secret.id,
      ])
    ).rows[0].n,
    1,
  );
  await expectError(
    () =>
      credentials(ca, 'guardar_credencial', {
        id: randomUUID(),
        proyecto_id: foreign.id,
        boveda_generacion: vaultGeneration,
        cifrado: envelope(),
      }),
    /PROYECTO_NO_DISPONIBLE/,
  );
  ok('credentials can belong to a project kept in the browser, never to another account');

  // ---- local → cloud: same ids, entries, imputations, archived state; idempotent
  const moved = {
    id: randomUUID(),
    nombre: 'Movido',
    descripcion: null,
    cliente: 'ACME',
    presupuesto_minutos: 60,
    archivado: true,
  };
  const taskA = randomUUID();
  const taskB = randomUUID();
  const imputation = randomUUID();
  const part = (task, start, end, extra = {}) => ({
    id: randomUUID(),
    tarea_id: task,
    inicio_en: start,
    fin_en: end,
    intervalo_redondeo_minutos: 15,
    descripcion: 'Trabajo',
    fecha: start.slice(0, 10),
    zona_horaria: 'Europe/Madrid',
    imputacion_odoo_id: null,
    ...extra,
  });
  const parts = [
    part(taskA, '2026-10-05T08:00:00Z', '2026-10-05T08:20:00Z', { imputacion_odoo_id: imputation }),
    part(taskA, '2026-10-05T09:00:00Z', '2026-10-05T09:20:00Z', { imputacion_odoo_id: imputation }),
    part(taskB, '2026-10-06T09:00:00Z', '2026-10-06T09:45:00Z'),
  ];
  const payload = {
    traspaso_id: randomUUID(),
    proyecto: moved,
    tareas: [
      {
        id: taskA,
        proyecto_id: moved.id,
        titulo: 'A',
        estado: 'en_curso',
        odoo_id: 'T12',
        archivado: false,
      },
      { id: taskB, proyecto_id: moved.id, titulo: 'B', archivado: true },
    ],
    partes: parts,
  };
  const imported = await moves(ca, 'importar_proyecto', payload);
  assert.deepEqual(imported, { proyecto_id: moved.id, tareas: 2, partes: 3 });
  assert.deepEqual(
    await moves(ca, 'importar_proyecto', payload),
    imported,
    'retry returns the result',
  );
  await expectError(
    () => moves(ca, 'importar_proyecto', { ...payload, proyecto: { ...moved, nombre: 'Otro' } }),
    /TRASPASO_ID_REUTILIZADO/,
  );
  await expectError(
    () => moves(ca, 'importar_proyecto', { ...payload, traspaso_id: randomUUID() }),
    /TRASPASO_ID_EXISTENTE/,
  );
  const project = (await ca.query('select * from public.proyectos where id=$1', [moved.id]))
    .rows[0];
  assert.ok(project.archivado_en, 'archived again after the import');
  const tasks = (
    await ca.query(
      'select id, archivado_en, odoo_id from public.tareas where proyecto_id=$1 order by titulo',
      [moved.id],
    )
  ).rows;
  assert.equal(tasks[0].odoo_id, 'T12');
  assert.equal(tasks[0].archivado_en, null);
  assert.ok(tasks[1].archivado_en);
  const entries = (
    await ca.query(
      'select id, imputacion_odoo_id, imputado_en_odoo, fecha from public.partes_detalle where proyecto_id=$1 order by inicio_en',
      [moved.id],
    )
  ).rows;
  assert.deepEqual(
    entries.map((row) => row.id),
    parts.map((row) => row.id),
  );
  assert.equal(entries[0].imputacion_odoo_id, imputation);
  assert.equal(entries[1].imputacion_odoo_id, imputation);
  assert.equal(entries[2].imputado_en_odoo, false);
  // Another account cannot import ids already used, nor read them.
  await expectError(
    () =>
      moves(cb, 'importar_proyecto', {
        traspaso_id: randomUUID(),
        proyecto: { ...moved, archivado: false },
        tareas: [],
        partes: [],
      }),
    /TRASPASO_ID_EXISTENTE/,
  );
  // Tasks of another project, an open entry, a group over two days: refused.
  await expectError(
    () =>
      moves(ca, 'importar_proyecto', {
        traspaso_id: randomUUID(),
        proyecto: { id: randomUUID(), nombre: 'Mal formado' },
        tareas: [{ id: randomUUID(), proyecto_id: randomUUID(), titulo: 'T' }],
        partes: [],
      }),
    /TRASPASO_DATOS_INVALIDOS/,
  );
  const openProject = randomUUID();
  const openTask = randomUUID();
  await expectError(
    () =>
      moves(ca, 'importar_proyecto', {
        traspaso_id: randomUUID(),
        proyecto: { id: openProject, nombre: 'Abierto' },
        tareas: [{ id: openTask, proyecto_id: openProject, titulo: 'T' }],
        partes: [part(openTask, '2026-10-07T09:00:00Z', null)],
      }),
    /DETENER_O_DESCARTAR_ACTIVO/,
  );
  const groupProject = randomUUID();
  const groupTask = randomUUID();
  const mixed = randomUUID();
  await expectError(
    () =>
      moves(ca, 'importar_proyecto', {
        traspaso_id: randomUUID(),
        proyecto: { id: groupProject, nombre: 'Grupo' },
        tareas: [{ id: groupTask, proyecto_id: groupProject, titulo: 'T' }],
        partes: [
          part(groupTask, '2026-10-08T09:00:00Z', '2026-10-08T09:10:00Z', {
            imputacion_odoo_id: mixed,
          }),
          part(groupTask, '2026-10-09T09:00:00Z', '2026-10-09T09:10:00Z', {
            imputacion_odoo_id: mixed,
          }),
        ],
      }),
    /PARTES_DE_DISTINTO_GRUPO/,
  );
  assert.equal(
    (
      await ca.query('select count(*)::int n from public.proyectos where id = any($1)', [
        [openProject, groupProject],
      ])
    ).rows[0].n,
    0,
    'a failed import leaves nothing behind',
  );
  ok(
    'a local project moves to the cloud with the same ids, imputations and archive state; retries are safe',
  );

  // ---- cloud → local: physical removal, links and credentials survive
  const linked = await notes(ca, 'guardar_nota', {
    id: randomUUID(),
    cifrado: envelope(),
    boveda_generacion: vaultGeneration,
    proyecto_ids: [moved.id],
    tarea_ids: [taskA],
  });
  await credentials(ca, 'guardar_credencial', {
    id: randomUUID(),
    proyecto_id: moved.id,
    boveda_generacion: vaultGeneration,
    cifrado: envelope(),
  });
  const running = await rpc(ca, 'crear_proyecto', { nombre: 'Con cronómetro' });
  const runningTask = await rpc(ca, 'crear_tarea', { proyecto_id: running.id, titulo: 'T' });
  await rpc(ca, 'iniciar', { operacion_id: randomUUID(), tarea_id: runningTask.id });
  await expectError(
    () =>
      moves(ca, 'purgar_proyecto', {
        traspaso_id: randomUUID(),
        proyecto_id: running.id,
        confirmar: true,
      }),
    /DETENER_O_DESCARTAR_ACTIVO/,
  );
  await expectError(
    () =>
      moves(cb, 'purgar_proyecto', {
        traspaso_id: randomUUID(),
        proyecto_id: moved.id,
        confirmar: true,
      }),
    /PROYECTO_NO_DISPONIBLE/,
  );
  await expectError(
    () => moves(ca, 'purgar_proyecto', { traspaso_id: randomUUID(), proyecto_id: moved.id }),
    /TRASPASO_DATOS_INVALIDOS/,
  );
  const purge = { traspaso_id: randomUUID(), proyecto_id: moved.id, confirmar: true };
  assert.deepEqual(await moves(ca, 'purgar_proyecto', purge), {
    proyecto_id: moved.id,
    purgado: true,
  });
  assert.deepEqual(await moves(ca, 'purgar_proyecto', purge), {
    proyecto_id: moved.id,
    purgado: true,
  });
  for (const [table, column] of [
    ['proyectos', 'id'],
    ['tareas', 'proyecto_id'],
  ])
    assert.equal(
      (
        await admin.query(`select count(*)::int n from public.${table} where ${column}=$1`, [
          moved.id,
        ])
      ).rows[0].n,
      0,
    );
  assert.equal(
    (
      await admin.query('select count(*)::int n from public.partes_horas where id = any($1)', [
        parts.map((row) => row.id),
      ])
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await admin.query('select count(*)::int n from public.imputaciones_odoo where id=$1', [
        imputation,
      ])
    ).rows[0].n,
    0,
  );
  const kept = (await ca.query('select * from public.notas_detalle where id=$1', [linked.id]))
    .rows[0];
  assert.deepEqual(kept.proyecto_ids, [moved.id]);
  assert.deepEqual(kept.tarea_ids, [taskA]);
  assert.equal(
    (
      await ca.query(
        'select count(*)::int n from public.credenciales_detalle where proyecto_id=$1',
        [moved.id],
      )
    ).rows[0].n,
    1,
  );
  ok(
    'a cloud project moved to the browser is removed physically; its notes and credentials stay linked',
  );
}
