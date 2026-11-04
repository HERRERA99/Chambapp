import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifyNotes({
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
  const notes = async (connection, action, data = {}) =>
    (await connection.query('select public.chambapp_notas($1,$2) r', [action, data])).rows[0].r;
  const project = await rpc(ca, 'crear_proyecto', { nombre: 'Notas A' });
  const otherProject = await rpc(cb, 'crear_proyecto', { nombre: 'Notas B' });
  const task = await rpc(ca, 'crear_tarea', { proyecto_id: project.id, titulo: 'Preparar notas' });
  const otherTask = await rpc(cb, 'crear_tarea', {
    proyecto_id: otherProject.id,
    titulo: 'Privada',
  });
  const body = '\uFEFF# Reunión\r\n\r\n- [ ] Tarea\r\n\r\n```ts\r\nconst x = "áé 📝";\r\n```\r\n';
  const payload = {
    id: randomUUID(),
    titulo: '  Reunión del proyecto  ',
    contenido_md: body,
    proyecto_ids: [project.id],
    tarea_ids: [task.id],
  };
  let note = await notes(ca, 'guardar_nota', payload);
  assert.equal(note.titulo, payload.titulo.trim());
  assert.equal(note.contenido_md, body);
  assert.deepEqual(note.proyecto_ids, [project.id]);
  assert.deepEqual(note.tarea_ids, [task.id]);
  assert.deepEqual(await notes(ca, 'guardar_nota', payload), note);
  await expectError(
    () => notes(ca, 'guardar_nota', { ...payload, contenido_md: 'changed' }),
    /NOTA_ID_REUTILIZADO/,
  );
  assert.equal(
    (await ca.query('select * from public.notas_detalle where id=$1', [note.id])).rows[0]
      .contenido_md,
    body,
  );
  assert.equal(
    (await cb.query('select * from public.notas_detalle where id=$1', [note.id])).rows.length,
    0,
  );
  for (const table of ['notas', 'nota_proyectos', 'nota_tareas'])
    assert.equal((await cb.query(`select * from public.${table}`)).rows.length, 0);
  await expectError(() => notes(anonymous, 'guardar_nota', payload), /permission denied/);
  await expectError(() => notes(noSession, 'guardar_nota', payload), /SESION_REQUERIDA/);
  await expectError(
    () => notes(cb, 'guardar_nota', { ...payload, version: note.version }),
    /NOTA_NO_DISPONIBLE/,
  );
  await expectError(
    () => notes(cb, 'eliminar_nota', { id: note.id, version: note.version }),
    /NOTA_NO_DISPONIBLE/,
  );
  await expectError(
    () =>
      cb.query('insert into public.notas(usuario_id,titulo) values($1,$2)', [
        note.usuario_id,
        'intrusion',
      ]),
    /permission denied/,
  );
  ok(
    'notes preserve Markdown byte-for-byte, safely retry creation and isolate reads and writes by account',
  );

  for (const [field, value, error] of [
    ['proyecto_ids', [otherProject.id], /PROYECTO_NO_DISPONIBLE/],
    ['tarea_ids', [otherTask.id], /TAREA_NO_DISPONIBLE/],
    ['tarea_ids', [randomUUID()], /TAREA_NO_DISPONIBLE/],
  ]) {
    await expectError(
      () =>
        notes(ca, 'guardar_nota', {
          ...payload,
          version: note.version,
          titulo: 'Must roll back',
          [field]: value,
        }),
      error,
    );
    const unchanged = (await ca.query('select * from public.notas_detalle where id=$1', [note.id]))
      .rows[0];
    assert.equal(unchanged.titulo, note.titulo);
    assert.equal(Number(unchanged.version), note.version);
    assert.deepEqual(unchanged.proyecto_ids, [project.id]);
    assert.deepEqual(unchanged.tarea_ids, [task.id]);
  }
  await expectError(
    () =>
      admin.query(
        'insert into public.nota_proyectos(nota_id,usuario_id,proyecto_id) values($1,$2,$3)',
        [note.id, note.usuario_id, otherProject.id],
      ),
    /foreign key/,
  );
  await expectError(
    () =>
      admin.query('insert into public.nota_tareas(nota_id,usuario_id,tarea_id) values($1,$2,$3)', [
        note.id,
        note.usuario_id,
        otherTask.id,
      ]),
    /foreign key/,
  );
  // Writes only go through chambapp_notas: direct DML is denied for every account.
  for (const connection of [ca, cb])
    for (const [sql, values] of [
      [
        'insert into public.nota_tareas(nota_id,usuario_id,tarea_id) values($1,$2,$3)',
        [note.id, note.usuario_id, task.id],
      ],
      ['update public.notas set titulo=$1 where id=$2', ['x', note.id]],
      ['delete from public.nota_proyectos where nota_id=$1', [note.id]],
    ])
      await expectError(() => connection.query(sql, values), /permission denied/);
  ok(
    'note relation validation is atomic and composite foreign keys prevent links across account boundaries',
  );

  for (const invalid of [
    { titulo: '' },
    { titulo: 'x'.repeat(201) },
    { contenido_md: null },
    { proyecto_ids: null },
    { tarea_ids: ['not-a-uuid'] },
    { tarea_ids: [null] },
  ])
    await expectError(
      () => notes(ca, 'guardar_nota', { ...payload, id: randomUUID(), ...invalid }),
      /NOTA_DATOS_INVALIDOS/,
    );
  await expectError(
    () =>
      notes(ca, 'guardar_nota', { ...payload, id: randomUUID(), contenido_md: 'é'.repeat(500001) }),
    /NOTA_DEMASIADO_GRANDE/,
  );
  await expectError(
    () =>
      notes(ca, 'guardar_nota', {
        ...payload,
        id: randomUUID(),
        proyecto_ids: Array(101).fill(project.id),
      }),
    /NOTA_DEMASIADOS_VINCULOS/,
  );
  const maxSize = await notes(ca, 'guardar_nota', {
    ...payload,
    id: randomUUID(),
    titulo: '📝'.repeat(200),
    contenido_md: 'é'.repeat(500000),
    proyecto_ids: [],
    tarea_ids: [],
  });
  assert.equal(maxSize.contenido_md.length, 500000);
  await notes(ca, 'eliminar_nota', { id: maxSize.id, version: maxSize.version });
  ok('notes enforce Unicode title length, UTF-8 byte size and bounded valid relation arrays');

  note = await notes(ca, 'guardar_nota', {
    ...payload,
    version: note.version,
    titulo: 'Revisada',
    contenido_md: '',
  });
  assert.equal(note.version, 2);
  assert.equal(note.contenido_md, '');
  await expectError(
    () => notes(ca, 'guardar_nota', { ...payload, version: 1 }),
    /CONFLICTO_VERSION/,
  );
  await expectError(
    () => notes(ca, 'eliminar_nota', { id: note.id, version: 1 }),
    /CONFLICTO_VERSION/,
  );
  const concurrent = await client(note.usuario_id);
  const writes = await Promise.allSettled([
    notes(ca, 'guardar_nota', { ...payload, version: note.version, titulo: 'Concurrent A' }),
    notes(concurrent, 'guardar_nota', {
      ...payload,
      version: note.version,
      titulo: 'Concurrent B',
    }),
  ]);
  assert.equal(writes.filter((result) => result.status === 'fulfilled').length, 1);
  assert.match(
    writes.find((result) => result.status === 'rejected').reason.message,
    /CONFLICTO_VERSION/,
  );
  note = writes.find((result) => result.status === 'fulfilled').value;
  assert.equal(note.version, 3);
  ok('note edits and deletes check versions and competing edits cannot overwrite each other');

  const archived = await rpc(ca, 'editar_proyecto', {
    id: project.id,
    version: project.version,
    archivado: true,
  });
  assert.ok(archived.archivado_en);
  note = await notes(ca, 'guardar_nota', { ...payload, version: note.version });
  assert.deepEqual(note.proyecto_ids, [project.id]);
  await rpc(ca, 'eliminar_proyecto', {
    id: project.id,
    version: archived.version,
    confirmar_cascada: true,
  });
  const detached = (await ca.query('select * from public.notas_detalle where id=$1', [note.id]))
    .rows[0];
  assert.equal(detached.contenido_md, body);
  assert.deepEqual(detached.proyecto_ids, []);
  assert.deepEqual(detached.tarea_ids, []);
  await expectError(
    () => notes(ca, 'guardar_nota', { ...payload, id: randomUUID() }),
    /PROYECTO_NO_DISPONIBLE/,
  );
  const deleted = await notes(ca, 'eliminar_nota', { id: note.id, version: note.version });
  assert.equal(deleted.id, note.id);
  assert.equal(
    (await ca.query('select * from public.notas where id=$1', [note.id])).rows.length,
    0,
  );
  assert.equal(
    (await ca.query('select * from public.nota_proyectos where nota_id=$1', [note.id])).rows.length,
    0,
  );
  assert.equal(
    (await ca.query('select * from public.nota_tareas where nota_id=$1', [note.id])).rows.length,
    0,
  );
  ok(
    'archiving preserves note links; project deletion hides stale links, keeps Markdown and note deletion cleans associations',
  );

  // Pause a note insert after the RPC's link validation, then let the existing
  // workspace RPC soft-delete a referenced record on a different connection.
  // This reproduces the interleaving without relying on timer-based scheduling.
  const gate = 64827319;
  const writerPid = (await ca.query('select pg_backend_pid() pid')).rows[0].pid;
  await admin.query(`
    create function public.notes_test_gate() returns trigger language plpgsql as $$
    begin
      perform pg_advisory_xact_lock(${gate});
      return new;
    end;
    $$;
    create trigger notes_test_gate before insert on public.notas
      for each row execute function public.notes_test_gate();
  `);
  try {
    for (const kind of ['project', 'task']) {
      const raceProject = await rpc(concurrent, 'crear_proyecto', {
        nombre: 'Concurrent note link',
      });
      const raceTask = await rpc(concurrent, 'crear_tarea', {
        proyecto_id: raceProject.id,
        titulo: 'Delete while saving',
      });
      const racePayload = {
        ...payload,
        id: randomUUID(),
        proyecto_ids: kind === 'project' ? [raceProject.id] : [],
        tarea_ids: kind === 'task' ? [raceTask.id] : [],
      };
      await admin.query('select pg_advisory_lock($1)', [gate]);
      let pendingDelete;
      const pendingSave = notes(ca, 'guardar_nota', racePayload).then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      try {
        let waiting = false;
        for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
          waiting = (
            await admin.query(
              "select exists(select 1 from pg_locks where pid=$1 and locktype='advisory' and not granted) waiting",
              [writerPid],
            )
          ).rows[0].waiting;
          if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.ok(waiting, 'note must reach the deterministic pause after link validation');
        // The paused save holds the profile lock, so the deletion queues behind it.
        // Start it without waiting, then release the gate and wait for both.
        pendingDelete = (
          kind === 'project'
            ? rpc(concurrent, 'eliminar_proyecto', {
                id: raceProject.id,
                version: raceProject.version,
                confirmar_cascada: true,
              })
            : rpc(concurrent, 'eliminar_tarea', {
                id: raceTask.id,
                version: raceTask.version,
                confirmar_cascada: true,
              })
        ).then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
      } finally {
        await admin.query('select pg_advisory_unlock($1)', [gate]);
      }
      const bounded = (work) =>
        Promise.race([
          work,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('concurrent note test timed out')), 15000),
          ),
        ]);
      const [outcome, deletion] = await bounded(Promise.all([pendingSave, pendingDelete]));
      assert.ok(!deletion.error, 'the deletion runs after the save releases the profile lock');
      // Serialized: the save committed first with a valid link, then the deletion
      // hid the link. A rejected save must have rolled back completely.
      if (outcome.error) {
        assert.match(
          outcome.error.message,
          kind === 'project' ? /PROYECTO_NO_DISPONIBLE/ : /TAREA_NO_DISPONIBLE/,
        );
        assert.equal(
          (await ca.query('select count(*)::int n from public.notas where id=$1', [racePayload.id]))
            .rows[0].n,
          0,
        );
        assert.equal(
          (
            await ca.query('select count(*)::int n from public.nota_proyectos where nota_id=$1', [
              racePayload.id,
            ])
          ).rows[0].n,
          0,
        );
        assert.equal(
          (
            await ca.query('select count(*)::int n from public.nota_tareas where nota_id=$1', [
              racePayload.id,
            ])
          ).rows[0].n,
          0,
        );
      } else {
        const saved = (
          await ca.query('select * from public.notas_detalle where id=$1', [racePayload.id])
        ).rows[0];
        assert.deepEqual(saved.proyecto_ids, []);
        assert.deepEqual(saved.tarea_ids, []);
        await notes(ca, 'eliminar_nota', { id: saved.id, version: Number(saved.version) });
      }
    }
  } finally {
    await admin.query('select pg_advisory_unlock($1)', [gate]);
    await admin.query(
      'drop trigger notes_test_gate on public.notas; drop function public.notes_test_gate();',
    );
  }
  ok(
    'a note save and a concurrent project or task removal serialize on the profile without deadlock',
  );
}
