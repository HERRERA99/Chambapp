import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifyCalendar({ ca, cb, anonymous, noSession, rpc, expectError, ok }) {
  const calendar = async (client, action, data = {}) =>
    (await client.query('select public.chambapp_calendario($1,$2) r', [action, data])).rows[0].r;
  const data = {
    id: randomUUID(),
    titulo: 'Vacaciones',
    tipo: 'vacaciones',
    inicio: '2026-07-06',
    fin: '2026-07-10',
  };
  let absence = await calendar(ca, 'guardar_ausencia', data);
  assert.equal((await calendar(ca, 'guardar_ausencia', data)).id, absence.id);
  assert.equal((await cb.query('select * from public.ausencias')).rows.length, 0);
  await expectError(
    () => calendar(cb, 'guardar_ausencia', { ...data, version: absence.version }),
    /no disponible/,
  );
  await expectError(() => calendar(anonymous, 'guardar_ausencia', data), /permission denied/);
  await expectError(() => calendar(noSession, 'guardar_ausencia', data), /SESION_REQUERIDA/);
  const owner = (await ca.query('select id from public.perfiles')).rows[0].id;
  await expectError(
    () =>
      cb.query(
        `insert into public.ausencias(usuario_id,titulo,tipo,inicio,fin)
    values($1,'Intrusión','festivo','2026-07-06','2026-07-06')`,
        [owner],
      ),
    /row-level security/,
  );
  await expectError(
    () => calendar(ca, 'guardar_ausencia', { ...data, id: randomUUID(), fin: '2026-07-01' }),
    /check constraint/,
  );
  absence = await calendar(ca, 'guardar_ausencia', {
    ...data,
    version: absence.version,
    titulo: 'Vacaciones editadas',
  });
  await expectError(
    () => calendar(ca, 'guardar_ausencia', { ...data, version: 1 }),
    /CONFLICTO_VERSION/,
  );
  ok(
    'calendar CRUD validates dates, protects versions, supports safe create retry and isolates accounts',
  );

  const cfg = await rpc(ca, 'crear_configuracion_semanal', {
    minutos_semanales: 2400,
    vigente_desde: '2026-07-06',
    dias: [1, 2, 3, 4, 5],
  });
  assert.ok(cfg.id);
  const generated = await rpc(ca, 'generar_semana', { lunes: '2026-07-06' });
  const monday = generated.jornadas.find((day) => day.fecha === '2026-07-06');
  assert.equal(monday.minutos_objetivo, 480);
  const effective = async () =>
    Number(
      (
        await ca.query(
          "select minutos_objetivo from public.resumen_semanas where lunes='2026-07-06'",
        )
      ).rows[0].minutos_objetivo,
    );
  assert.equal(await effective(), 0);
  const holiday = await calendar(ca, 'guardar_ausencia', {
    id: randomUUID(),
    titulo: 'Festivo solapado',
    tipo: 'festivo',
    inicio: '2026-07-06',
    fin: '2026-07-06',
  });
  await calendar(ca, 'eliminar_ausencia', { id: absence.id, version: absence.version });
  assert.equal(await effective(), 1920);
  await calendar(ca, 'eliminar_ausencia', { id: holiday.id, version: holiday.version });
  assert.equal(await effective(), 2400);
  ok(
    'generated days retain original targets; effective weekly views exclude overlapping absences and restore on removal',
  );

  const sync = {
    ambito: 'ES:ES-MD',
    anio: 2026,
    festivos: [{ fecha: '2026-07-06', titulo: 'Importado' }],
  };
  assert.equal((await calendar(ca, 'sincronizar_festivos', sync)).sincronizados, 1);
  await calendar(ca, 'sincronizar_festivos', {
    ...sync,
    festivos: [{ fecha: '2026-07-06', titulo: 'Nombre actualizado' }],
  });
  const imported = (await ca.query("select * from public.ausencias where fuente='nager'")).rows;
  assert.equal(imported.length, 1);
  assert.equal(imported[0].titulo, 'Nombre actualizado');
  assert.equal(await effective(), 1920);
  await expectError(
    () =>
      calendar(ca, 'sincronizar_festivos', {
        ...sync,
        festivos: [
          { fecha: '2026-07-07', titulo: 'Válido' },
          { fecha: '2027-07-08', titulo: 'Año incorrecto' },
        ],
      }),
    /DATOS_INVALIDOS/,
  );
  assert.equal(
    (await ca.query("select count(*) from public.ausencias where inicio='2026-07-07'")).rows[0]
      .count,
    '0',
  );
  assert.equal(
    (await cb.query('select * from public.resumen_semanas where usuario_id=$1', [owner])).rows
      .length,
    0,
  );
  ok(
    'holiday synchronization is atomic, repeatable, updates names and respects RLS in weekly views',
  );

  const project = await rpc(ca, 'crear_proyecto', { nombre: 'Tablero' });
  let task = await rpc(ca, 'crear_tarea', { proyecto_id: project.id, titulo: 'Tarjeta' });
  for (const state of ['en_curso', 'completada', 'pendiente']) {
    task = await rpc(ca, 'editar_tarea', { id: task.id, version: task.version, estado: state });
    assert.equal(task.estado, state);
  }
  await expectError(
    () => rpc(ca, 'editar_tarea', { id: task.id, version: 1, estado: 'completada' }),
    /CONFLICTO_VERSION/,
  );
  await expectError(
    () => rpc(cb, 'editar_tarea', { id: task.id, version: task.version, estado: 'completada' }),
    /TAREA_NO_DISPONIBLE/,
  );
  ok(
    'board transitions persist through existing task RPC with concurrency checks and ownership protection',
  );
}
