import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifyAttendance({ admin, ca, cb, anonymous, client, rpc, expectError, ok }) {
  const project = await rpc(ca, 'crear_proyecto', { nombre: 'Odoo integration' });
  let task = await rpc(ca, 'crear_tarea', {
    proyecto_id: project.id,
    titulo: 'Odoo task',
    odoo_id: 'T443212',
    odoo_url: 'https://odoo.example.com:8069/web#id=443212&model=project.task',
  });
  assert.equal(task.odoo_id, 'T443212');
  assert.equal(task.odoo_url, 'https://odoo.example.com:8069/web#id=443212&model=project.task');
  const part = await rpc(ca, 'crear_parte', {
    tarea_id: task.id,
    inicio_en: '2026-06-01T08:00:00Z',
    fin_en: '2026-06-01T09:00:00Z',
  });
  let details = (await ca.query('select * from public.partes_detalle where id=$1', [part.id]))
    .rows[0];
  assert.equal(details.odoo_id, task.odoo_id);
  assert.equal(details.odoo_url, task.odoo_url);
  task = await rpc(ca, 'editar_tarea', {
    id: task.id,
    version: task.version,
    titulo: 'Changed title',
  });
  assert.equal(task.odoo_id, 'T443212');
  assert.equal(task.odoo_url, details.odoo_url);
  await expectError(
    () => rpc(cb, 'editar_tarea', { id: task.id, version: task.version, odoo_id: 'T1' }),
    /TAREA_NO_DISPONIBLE/,
  );
  task = await rpc(ca, 'editar_tarea', {
    id: task.id,
    version: task.version,
    odoo_id: null,
    odoo_url: null,
  });
  assert.equal(task.odoo_id, null);
  assert.equal(task.odoo_url, null);
  details = (await ca.query('select * from public.partes_detalle where id=$1', [part.id])).rows[0];
  assert.equal(details.odoo_id, null);
  assert.equal(details.odoo_url, null);
  for (const odoo_id of ['443212', 't443212', 'T-1', 'T', ' T1', 'T1\n', `T${'1'.repeat(64)}`]) {
    await expectError(
      () => rpc(ca, 'crear_tarea', { proyecto_id: project.id, titulo: 'Invalid Odoo ID', odoo_id }),
      /tareas_odoo_id_formato/,
    );
  }
  for (const odoo_url of [
    'javascript:alert(1)',
    'https://',
    'ftp://odoo.example.com',
    'https://user:password@odoo.example.com',
    'https://odoo.example.com/a b',
    'https://odoo.example.com\\web',
    'https://odoo.example.com/\nweb',
    'https://odoo.example.com:99999/web',
    'https://%zz/web',
    'https://[a::b::c]/web',
    'https://999.999.999.999/web',
    'https://foo.1/web',
    `https://odoo.example.com/${'a'.repeat(2048)}`,
  ]) {
    await expectError(
      () => rpc(ca, 'editar_tarea', { id: task.id, version: task.version, odoo_url }),
      /tareas_odoo_url_formato/,
    );
  }
  for (const odoo_url of [
    'http://localhost:8069/web#id=1',
    'https://127.0.0.1:65535/web',
    'https://[2001:db8::1]:8069/web#id=1',
    'https://xn--maana-pta.example/web',
  ]) {
    task = await rpc(ca, 'editar_tarea', { id: task.id, version: task.version, odoo_url });
    assert.equal(task.odoo_url, odoo_url);
  }
  ok(
    'Odoo references persist, update linked part details, clear independently and reject unsafe or invalid URLs/IDs',
  );

  const user = randomUUID();
  await admin.query('insert into auth.users(id) values($1)', [user]);
  const c = await client(user),
    concurrentA = await client(user),
    concurrentB = await client(user);
  const attendance = (action, data = {}) => rpc(c, action, data);
  const create = (inicio_en, fin_en = null, id = randomUUID()) =>
    attendance('crear_fichaje', { id, inicio_en, fin_en });
  const firstRequest = {
    id: randomUUID(),
    usuario_id: randomUUID(),
    inicio_en: '2026-07-06T08:00:00+02:00',
    fin_en: '2026-07-06T12:00:00+02:00',
  };
  let first = await attendance('crear_fichaje', firstRequest);
  assert.equal(first.usuario_id, user);
  assert.equal(first.version, 1);
  assert.deepEqual(await attendance('crear_fichaje', firstRequest), first);
  assert.equal((await c.query('select count(*)::int n from public.fichajes')).rows[0].n, 1);
  await expectError(
    () => attendance('crear_fichaje', { ...firstRequest, fin_en: '2026-07-06T12:01:00+02:00' }),
    /FICHAJE_ID_REUTILIZADO/,
  );
  await expectError(() => attendance('fichar_entrada', { id: first.id }), /FICHAJE_ID_REUTILIZADO/);
  const detail = (
    await c.query('select d.*, fecha::text fecha_iso from public.fichajes_detalle d where id=$1', [
      first.id,
    ])
  ).rows[0];
  assert.equal(detail.fecha_iso, '2026-07-06');
  assert.equal(detail.zona_horaria, 'Europe/Madrid');
  assert.equal(Number(detail.duracion_segundos), 4 * 3600);
  const afternoon = await create('2026-07-06T12:00:00+02:00', '2026-07-06T16:00:00+02:00');
  assert.equal(afternoon.jornada_id, first.jornada_id);
  assert.equal(
    Number(
      (await c.query('select sum(duracion_segundos) n from public.fichajes_detalle')).rows[0].n,
    ),
    8 * 3600,
  );
  assert.equal((await c.query('select * from public.partes_detalle')).rows.length, 0);
  ok(
    'manual attendance supports multiple abutting sessions, exact unrounded totals and idempotent creation independently of task time',
  );

  assert.equal((await ca.query('select * from public.fichajes')).rows.length, 0);
  assert.equal((await cb.query('select * from public.fichajes_detalle')).rows.length, 0);
  await expectError(() => anonymous.query('select * from public.fichajes'), /permission denied/);
  await expectError(
    () => anonymous.query('select * from public.fichajes_detalle'),
    /permission denied/,
  );
  await expectError(
    () =>
      anonymous.query('select chambapp_private.operar($1,$2)', [
        'fichar_entrada',
        { id: randomUUID() },
      ]),
    /permission denied/,
  );
  await expectError(
    () => c.query('select * from chambapp_private.operaciones_fichajes'),
    /permission denied/,
  );
  await expectError(
    () =>
      c.query('select chambapp_private.operar_legacy($1,$2)', [
        'crear_proyecto',
        { nombre: 'bypass' },
      ]),
    /permission denied/,
  );
  for (const query of [
    () =>
      c.query(
        'insert into public.fichajes(id,usuario_id,jornada_id,inicio_en) values($1,$2,$3,now())',
        [randomUUID(), user, first.jornada_id],
      ),
    () => c.query('update public.fichajes set fin_en=now() where id=$1', [first.id]),
    () => c.query('delete from public.fichajes where id=$1', [first.id]),
  ])
    await expectError(query, /permission denied/);
  for (const action of ['fichar_salida', 'editar_fichaje', 'eliminar_fichaje']) {
    await expectError(
      () => rpc(ca, action, { id: first.id, version: first.version, inicio_en: first.inicio_en }),
      /FICHAJE_NO_DISPONIBLE/,
    );
  }
  await expectError(
    () =>
      admin.query(
        'insert into public.fichajes(id,usuario_id,jornada_id,inicio_en,fin_en) values($1,$2,$3,$4,$5)',
        [
          randomUUID(),
          task.usuario_id,
          first.jornada_id,
          '2026-07-04T08:00:00Z',
          '2026-07-04T09:00:00Z',
        ],
      ),
    /foreign key constraint/,
  );
  ok(
    'attendance tables/views enforce ownership; anonymous access, direct writes, private ledgers and legacy bypass are denied',
  );

  await expectError(
    () => create('2026-07-06T11:00:00+02:00', '2026-07-06T13:00:00+02:00'),
    /exclusion constraint/,
  );
  await expectError(
    () => create('2026-07-10T08:00:00', '2026-07-10T09:00:00Z'),
    /ZONA_HORARIA_REQUERIDA/,
  );
  await expectError(() => create(null, '2026-07-10T09:00:00Z'), /ENTRADA_REQUERIDA/);
  await expectError(
    () => create('2026-07-10T09:00:00Z', '2026-07-10T09:00:00Z'),
    /fichajes_intervalo_valido/,
  );
  await expectError(
    () => create('2026-07-10T09:00:00Z', '2026-07-10T08:00:00Z'),
    /fichajes_intervalo_valido/,
  );
  await expectError(
    () => create('2099-01-01T09:00:00Z', '2099-01-01T10:00:00Z'),
    /INTERVALO_REAL_FUTURO/,
  );
  await expectError(
    () => create('2026-07-10T09:00:00Z', '2099-01-01T10:00:00Z'),
    /INTERVALO_REAL_FUTURO/,
  );
  let night = await create('2026-07-08T23:00:00+02:00', '2026-07-09T02:00:00+02:00');
  assert.equal(
    Number(
      (
        await c.query('select duracion_segundos n from public.fichajes_detalle where id=$1', [
          night.id,
        ])
      ).rows[0].n,
    ),
    3 * 3600,
  );
  await create('2026-07-09T02:00:00+02:00', '2026-07-09T03:00:00+02:00');
  for (const [start, end] of [
    ['2026-03-29T01:58:00+01:00', '2026-03-29T03:06:00+02:00'],
    ['2025-10-26T02:58:00+02:00', '2025-10-26T02:06:00+01:00'],
  ]) {
    const dst = await create(start, end);
    assert.equal(
      Number(
        (
          await c.query('select duracion_segundos n from public.fichajes_detalle where id=$1', [
            dst.id,
          ])
        ).rows[0].n,
      ),
      8 * 60,
    );
  }
  ok(
    'attendance rejects overlaps, missing offsets/future/invalid intervals and supports overnight shifts and both DST transitions',
  );

  const original = first;
  const editRequest = {
    id: first.id,
    version: first.version,
    inicio_en: '2026-07-06T08:15:00+02:00',
  };
  first = await attendance('editar_fichaje', editRequest);
  assert.equal(first.version, 2);
  assert.equal(first.fin_en, original.fin_en);
  assert.deepEqual(await attendance('editar_fichaje', editRequest), first);
  assert.deepEqual(await attendance('crear_fichaje', firstRequest), original);
  await expectError(
    () => attendance('editar_fichaje', { ...editRequest, inicio_en: '2026-07-06T08:30:00+02:00' }),
    /CONFLICTO_VERSION/,
  );
  await expectError(
    () => attendance('eliminar_fichaje', { id: first.id, version: 1 }),
    /CONFLICTO_VERSION/,
  );
  await expectError(
    () => attendance('editar_fichaje', { id: first.id, version: first.version, fin_en: null }),
    /exclusion constraint/,
  );
  const reopenRequest = { id: night.id, version: night.version, fin_en: null };
  // Reopening would swallow the following session; deleted rows are excluded from overlap checks.
  await expectError(() => attendance('editar_fichaje', reopenRequest), /exclusion constraint/);
  const isolated = await create('2026-07-12T09:00:00Z', '2026-07-12T10:00:00Z');
  const reopened = await attendance('editar_fichaje', {
    id: isolated.id,
    version: isolated.version,
    fin_en: null,
  });
  assert.equal(reopened.fin_en, null);
  const closed = await attendance('editar_fichaje', {
    id: reopened.id,
    version: reopened.version,
    fin_en: isolated.fin_en,
  });
  assert.equal(closed.fin_en, isolated.fin_en);
  const deletedRequest = { id: first.id, version: first.version };
  const deleted = await attendance('eliminar_fichaje', deletedRequest);
  assert.ok(deleted.eliminado_en);
  assert.deepEqual(await attendance('eliminar_fichaje', deletedRequest), deleted);
  assert.equal(
    (await c.query('select * from public.fichajes_detalle where id=$1', [first.id])).rows.length,
    0,
  );
  assert.ok(
    (await c.query('select * from public.fichajes where id=$1', [first.id])).rows[0].eliminado_en,
  );
  await expectError(
    () =>
      attendance('editar_fichaje', {
        id: first.id,
        version: deleted.version,
        fin_en: isolated.fin_en,
      }),
    /FICHAJE_NO_DISPONIBLE/,
  );
  await expectError(
    () => admin.query('update public.fichajes set eliminado_en=null where id=$1', [first.id]),
    /REGISTRO_ELIMINADO/,
  );
  await create(original.inicio_en, original.fin_en);
  ok(
    'attendance edits and deletes preserve versions, omission/null semantics, replay original outcomes and retain non-overlapping tombstones',
  );

  const profile = (await c.query('select * from public.perfiles')).rows[0];
  await attendance('editar_perfil', { version: profile.version, zona_horaria: 'America/New_York' });
  assert.equal(
    (await c.query('select zona_horaria from public.fichajes_detalle where id=$1', [night.id]))
      .rows[0].zona_horaria,
    'Europe/Madrid',
  );
  night = await attendance('editar_fichaje', {
    id: night.id,
    version: night.version,
    inicio_en: '2026-07-10T23:00:00+02:00',
    fin_en: '2026-07-11T02:00:00+02:00',
  });
  assert.equal(
    (await c.query('select zona_horaria from public.fichajes_detalle where id=$1', [night.id]))
      .rows[0].zona_horaria,
    'Europe/Madrid',
  );
  await create('2026-07-14T09:00:00-04:00', '2026-07-14T10:00:00-04:00');
  const moveRequest = {
    id: night.id,
    version: night.version,
    inicio_en: '2026-07-14T16:00:00Z',
    fin_en: '2026-07-14T17:00:00Z',
  };
  await expectError(
    () => attendance('editar_fichaje', moveRequest),
    /CONFIRMAR_CAMBIO_ZONA:America\/New_York/,
  );
  night = await attendance('editar_fichaje', {
    ...moveRequest,
    confirmar_zona: 'America/New_York',
  });
  assert.equal(
    (await c.query('select zona_horaria from public.fichajes_detalle where id=$1', [night.id]))
      .rows[0].zona_horaria,
    'America/New_York',
  );
  ok(
    'attendance keeps historic timezones and requires confirmation before moving to an existing day with another timezone',
  );

  const sessionProject = await attendance('crear_proyecto', { nombre: 'Independent timer' });
  const sessionTask = await attendance('crear_tarea', {
    proyecto_id: sessionProject.id,
    titulo: 'Task timer',
  });
  const timer = await attendance('iniciar', {
    operacion_id: randomUUID(),
    tarea_id: sessionTask.id,
  });
  const startRequest = { id: randomUUID() };
  const entries = await Promise.all([
    rpc(concurrentA, 'fichar_entrada', startRequest),
    rpc(concurrentB, 'fichar_entrada', startRequest),
  ]);
  assert.deepEqual(entries[0], entries[1]);
  const active = entries[0];
  assert.equal(active.fin_en, null);
  assert.equal(
    (await c.query('select * from public.fichajes_detalle where id=$1', [active.id])).rows[0]
      .duracion_segundos,
    null,
  );
  assert.equal((await attendance('consultar_cronometro')).parte.id, timer.parte.id);
  await expectError(
    () => attendance('fichar_entrada', { id: randomUUID() }),
    /exclusion constraint|duplicate key/,
  );
  await expectError(() => create(active.inicio_en, null), /exclusion constraint|duplicate key/);
  const closeRequest = { id: active.id, version: active.version };
  const exits = await Promise.all([
    rpc(concurrentA, 'fichar_salida', closeRequest),
    rpc(concurrentB, 'fichar_salida', closeRequest),
  ]);
  assert.deepEqual(exits[0], exits[1]);
  assert.ok(exits[0].fin_en);
  assert.equal(exits[0].version, 2);
  assert.deepEqual(await attendance('fichar_entrada', startRequest), active);
  assert.deepEqual(await attendance('fichar_salida', closeRequest), exits[0]);
  assert.equal((await attendance('consultar_cronometro')).parte.id, timer.parte.id);
  const correctionRequest = {
    id: active.id,
    version: exits[0].version,
    inicio_en: active.inicio_en,
  };
  const corrected = await attendance('editar_fichaje', correctionRequest);
  assert.equal(corrected.version, 3);
  assert.deepEqual(await attendance('fichar_salida', closeRequest), exits[0]);
  await attendance('detener', { operacion_id: randomUUID(), parte_id: timer.parte.id });
  const beforeCascade = (await c.query('select count(*)::int n from public.fichajes_detalle'))
    .rows[0].n;
  await attendance('eliminar_proyecto', {
    id: sessionProject.id,
    version: sessionProject.version,
    confirmar_cascada: true,
  });
  assert.equal(
    (await c.query('select count(*)::int n from public.fichajes_detalle')).rows[0].n,
    beforeCascade,
  );
  ok(
    'automatic clock in/out use server time; concurrent replays commit once and task timers/cascade deletions remain independent',
  );

  const starts = await Promise.allSettled([
    rpc(concurrentA, 'fichar_entrada', { id: randomUUID() }),
    rpc(concurrentB, 'fichar_entrada', { id: randomUUID() }),
  ]);
  assert.equal(starts.filter((x) => x.status === 'fulfilled').length, 1);
  assert.match(
    starts.find((x) => x.status === 'rejected').reason.message,
    /exclusion constraint|duplicate key/,
  );
  const winner = starts.find((x) => x.status === 'fulfilled').value;
  const edits = await Promise.allSettled([
    rpc(concurrentA, 'editar_fichaje', {
      id: winner.id,
      version: winner.version,
      inicio_en: winner.inicio_en,
    }),
    rpc(concurrentB, 'editar_fichaje', {
      id: winner.id,
      version: winner.version,
      inicio_en: new Date(new Date(winner.inicio_en).getTime() + 1).toISOString(),
    }),
  ]);
  assert.equal(edits.filter((x) => x.status === 'fulfilled').length, 1);
  assert.match(edits.find((x) => x.status === 'rejected').reason.message, /CONFLICTO_VERSION/);
  const final = edits.find((x) => x.status === 'fulfilled').value;
  await attendance('eliminar_fichaje', { id: final.id, version: final.version });
  ok(
    'competing attendance starts create one session and competing edits enforce optimistic concurrency',
  );
}
