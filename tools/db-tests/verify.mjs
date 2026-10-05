import EmbeddedPostgres from 'embedded-postgres';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyAttendance } from './attendance.mjs';
import { verifyOdooStatus } from './odoo-status.mjs';
import { verifySelectedStartAndCredentials } from './selected-start-and-credentials.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const databaseDir = await mkdtemp(join(tmpdir(), 'chambapp-db-test-'));
// persistent: true avoids deleting any host paths. Test data is isolated in this temp directory.
const postgres = new EmbeddedPostgres({
  databaseDir,
  port: 55439,
  user: 'postgres',
  password: randomUUID(),
  persistent: true,
  onLog() {},
  onError(message) {
    console.error(String(message));
  },
});
const clients = [];
let count = 0;
function ok(label) {
  count++;
  console.log(`OK ${count}: ${label}`);
}
async function expectError(work, match) {
  await assert.rejects(work, (error) => match.test(error.message));
}
try {
  await postgres.initialise();
  await postgres.start();
  const admin = postgres.getPgClient();
  await admin.connect();
  clients.push(admin);
  // Minimal Supabase Auth/role shim. Does not simulate GoTrue, PostgREST or JWT validation.
  await admin.query(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    grant usage on schema auth, public to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
  `);
  const migrations = (await readdir(join(root, 'supabase/migrations')))
    .filter((n) => n.endsWith('.sql'))
    .sort();
  // Verify an upgrade with persisted data, as well as applying the full migration chain.
  await admin.query(await readFile(join(root, 'supabase/migrations', migrations[0]), 'utf8'));
  const upgradeUser = randomUUID();
  await admin.query('insert into auth.users(id) values($1)', [upgradeUser]);
  await admin.query("select set_config('request.jwt.claim.sub',$1,false)", [upgradeUser]);
  const upgradeRpc = async (action, data) =>
    (await admin.query('select public.chambapp_operar($1,$2) r', [action, data])).rows[0].r;
  const upgradeProject = await upgradeRpc('crear_proyecto', { nombre: 'Upgrade fixture' });
  const upgradeTask = await upgradeRpc('crear_tarea', {
    proyecto_id: upgradeProject.id,
    titulo: 'Preserved work',
  });
  const upgradePart = await upgradeRpc('crear_parte', {
    tarea_id: upgradeTask.id,
    inicio_en: '2026-09-20T09:07:00+02:00',
    fin_en: '2026-09-20T13:15:00+02:00',
  });
  const columnTypes = async () =>
    (
      await admin.query(`select table_name,column_name,data_type,ordinal_position
    from information_schema.columns where table_schema='public' and table_name in
    ('partes_detalle','resumen_jornadas','resumen_tareas','resumen_proyectos','resumen_semanas')
    order by table_name,ordinal_position`)
    ).rows;
  const viewTypesBefore = await columnTypes();
  for (const file of migrations.slice(1))
    await admin.query(await readFile(join(root, 'supabase/migrations', file), 'utf8'));
  const existingViewColumns = new Set(
    viewTypesBefore.map((row) => `${row.table_name}.${row.column_name}`),
  );
  assert.deepEqual(
    (await columnTypes()).filter((row) =>
      existingViewColumns.has(`${row.table_name}.${row.column_name}`),
    ),
    viewTypesBefore,
  );
  const upgraded = (
    await admin.query('select * from public.partes_detalle where id=$1', [upgradePart.id])
  ).rows[0];
  assert.equal(upgraded.inicio_en.toISOString(), new Date(upgradePart.inicio_en).toISOString());
  assert.equal(upgraded.fin_en.toISOString(), new Date(upgradePart.fin_en).toISOString());
  assert.equal(
    upgraded.inicio_imputado_en.toISOString(),
    new Date(upgradePart.inicio_en).toISOString(),
  );
  assert.equal(upgraded.fin_imputado_en.toISOString(), new Date(upgradePart.fin_en).toISOString());
  assert.equal(Number(upgraded.duracion_imputada_segundos), 255 * 60);
  assert.equal(upgraded.odoo_id, null);
  assert.equal(upgraded.odoo_url, null);
  assert.equal(upgraded.imputado_en_odoo, false);
  await admin.query('delete from public.partes_horas where usuario_id=$1', [upgradeUser]);
  await admin.query('delete from public.jornadas where usuario_id=$1', [upgradeUser]);
  await admin.query('delete from public.tareas where usuario_id=$1', [upgradeUser]);
  await admin.query('delete from public.proyectos where usuario_id=$1', [upgradeUser]);
  await admin.query('delete from auth.users where id=$1', [upgradeUser]);
  await admin.query("select set_config('request.jwt.claim.sub','',false)");
  await admin.query(await readFile(join(root, 'supabase/verify.sql'), 'utf8'));
  ok(
    'migration chain upgrades persisted data, preserves exact instants/view types and applies with Supabase-like roles',
  );
  const a = randomUUID(),
    b = randomUUID();
  await admin.query('insert into auth.users values ($1,$2),($3,$4)', [
    a,
    { nombre: 'Ana', zona_horaria: 'invalid' },
    b,
    { nombre: '' },
  ]);
  assert.equal((await admin.query('select count(*)::int n from public.perfiles')).rows[0].n, 2);
  ok('Auth trigger creates profiles and ignores invalid optional timezone metadata');
  async function client(user, role = 'authenticated') {
    const c = postgres.getPgClient();
    await c.connect();
    clients.push(c);
    await c.query(`set role ${role}`);
    if (user) await c.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
    return c;
  }
  const ca = await client(a),
    cb = await client(b),
    anonymous = await client(null, 'anon');
  const rpc = async (c, action, data = {}) =>
    (await c.query('select public.chambapp_operar($1,$2) r', [action, data])).rows[0].r;
  const profile = (await ca.query('select * from public.perfiles')).rows[0];
  assert.equal(profile.id, a);
  assert.equal((await cb.query('select * from public.perfiles')).rows.length, 1);
  await expectError(() => anonymous.query('select * from public.perfiles'), /permission denied/);
  await expectError(() => rpc(anonymous, 'crear_proyecto', { nombre: 'x' }), /permission denied/);
  const noSession = await client(null);
  await expectError(() => rpc(noSession, 'crear_proyecto', { nombre: 'x' }), /SESION_REQUERIDA/);
  await expectError(
    () => ca.query("insert into public.proyectos(usuario_id,nombre) values ($1,'x')", [a]),
    /permission denied/,
  );
  await expectError(
    () => ca.query('select * from chambapp_private.operaciones_cronometro'),
    /permission denied/,
  );
  ok('RLS isolates reads; anonymous/direct writes/private operation access are denied');
  await expectError(
    () => rpc(ca, 'editar_perfil', { version: profile.version, zona_horaria: 'Not/AZone' }),
    /ZONA_HORARIA_INVALIDA/,
  );
  let configured = await rpc(ca, 'editar_perfil', {
    version: profile.version,
    intervalo_redondeo_minutos: 15,
    zona_horaria: 'Europe/Madrid',
  });
  await expectError(
    () => rpc(ca, 'editar_perfil', { version: profile.version, nombre: 'stale' }),
    /CONFLICTO_VERSION/,
  );
  ok('timezone validation and optimistic concurrency');
  assert.equal(configured.onboarding_completado, false);
  assert.deepEqual(configured.preferencias, {});
  configured = await rpc(ca, 'editar_perfil', {
    version: configured.version,
    onboarding_completado: true,
    preferencias: { idioma: 'es', recordatorio: { activo: true, hora: '09:00' }, flexible: true },
  });
  assert.equal(configured.onboarding_completado, true);
  assert.equal(configured.preferencias.recordatorio.hora, '09:00');
  await expectError(
    () => rpc(ca, 'editar_perfil', { version: configured.version, preferencias: [] }),
    /perfiles_preferencias_objeto/,
  );
  await expectError(
    () => rpc(ca, 'editar_perfil', { version: configured.version, preferencias: null }),
    /perfiles_preferencias_objeto/,
  );
  await expectError(
    () => rpc(ca, 'editar_perfil', { version: configured.version, onboarding_completado: null }),
    /not-null constraint/,
  );
  await expectError(
    () => rpc(ca, 'editar_perfil', { version: configured.version, intervalo_redondeo_minutos: 20 }),
    /perfiles_intervalo_redondeo_minutos_check/,
  );
  configured = await rpc(ca, 'editar_perfil', {
    version: configured.version,
    nombre: 'Ana configurada',
  });
  assert.equal(configured.preferencias.idioma, 'es');
  assert.equal(
    (await cb.query('select onboarding_completado from public.perfiles')).rows[0]
      .onboarding_completado,
    false,
  );
  ok(
    'onboarding/preferences are validated, persisted, retained when omitted and isolated per user',
  );
  let project = await rpc(ca, 'crear_proyecto', {
    nombre: 'Web',
    usuario_id: b,
    cliente: 'Cliente A',
    presupuesto_minutos: 480,
  });
  assert.equal(project.usuario_id, a);
  assert.equal(project.cliente, 'Cliente A');
  assert.equal(project.presupuesto_minutos, 480);
  const originalProjectVersion = project.version;
  project = await rpc(ca, 'editar_proyecto', {
    id: project.id,
    version: project.version,
    cliente: 'Cliente B',
    presupuesto_minutos: 0,
  });
  assert.equal(project.presupuesto_minutos, 0);
  await expectError(
    () =>
      rpc(ca, 'editar_proyecto', {
        id: project.id,
        version: originalProjectVersion,
        cliente: 'stale',
      }),
    /CONFLICTO_VERSION/,
  );
  await expectError(
    () =>
      rpc(ca, 'editar_proyecto', {
        id: project.id,
        version: project.version,
        presupuesto_minutos: -1,
      }),
    /proyectos_presupuesto_no_negativo/,
  );
  await expectError(
    () => rpc(ca, 'crear_proyecto', { nombre: 'invalid', cliente: ' ', presupuesto_minutos: 1 }),
    /proyectos_cliente_longitud/,
  );
  await expectError(
    () => rpc(ca, 'crear_proyecto', { nombre: 'invalid', presupuesto_minutos: -1 }),
    /proyectos_presupuesto_no_negativo/,
  );
  project = await rpc(ca, 'editar_proyecto', {
    id: project.id,
    version: project.version,
    cliente: null,
    presupuesto_minutos: null,
  });
  assert.equal(project.cliente, null);
  assert.equal(project.presupuesto_minutos, null);
  ok(
    'project client/budget support updates, clearing nullable fields and stale/invalid input rejection',
  );
  const task = await rpc(ca, 'crear_tarea', { proyecto_id: project.id, titulo: 'Portada' });
  const foreignProject = await rpc(cb, 'crear_proyecto', { nombre: 'Other' });
  await expectError(
    () => rpc(ca, 'crear_tarea', { proyecto_id: foreignProject.id, titulo: 'bad' }),
    /PROYECTO_NO_DISPONIBLE/,
  );
  await expectError(
    () => rpc(cb, 'editar_proyecto', { id: project.id, version: project.version, nombre: 'bad' }),
    /PROYECTO_NO_DISPONIBLE/,
  );
  ok('ownership is derived from session and cross-user links/edits are refused');
  const cfg = await rpc(ca, 'crear_configuracion_semanal', {
    minutos_semanales: 2251,
    vigente_desde: '2026-09-21',
    dias: [5, 3, 1, 4, 2],
  });
  const ds = (await ca.query('select * from public.dias_configuracion_semanal order by dia_semana'))
    .rows;
  assert.deepEqual(
    ds.map((x) => x.minutos_objetivo),
    [451, 450, 450, 450, 450],
  );
  await expectError(
    () =>
      rpc(ca, 'crear_configuracion_semanal', {
        minutos_semanales: 200,
        vigente_desde: '2026-09-28',
        dias: [1, 1],
      }),
    /DIAS_INVALIDOS/,
  );
  await expectError(
    () =>
      rpc(ca, 'crear_configuracion_semanal', {
        minutos_semanales: 200,
        vigente_desde: '2026-09-28',
        dias: [1, 2],
        reparto: { 1: 50, 2: 50 },
      }),
    /REPARTO_SEMANAL_INVALIDO/,
  );
  let week = await rpc(ca, 'generar_semana', { lunes: '2026-09-21' });
  assert.equal(week.jornadas.length, 5);
  const monday = week.jornadas[0];
  await rpc(ca, 'editar_jornada', {
    id: monday.id,
    version: monday.version,
    minutos_objetivo: 400,
  });
  week = await rpc(ca, 'generar_semana', { lunes: '2026-09-21' });
  assert.equal(week.jornadas[0].minutos_objetivo, 400);
  assert.equal(week.jornadas.length, 5);
  ok('weekly distribution preserves sums and generation preserves existing daily overrides');
  async function round(seconds, interval = 15) {
    const value = (
      await ca.query('select chambapp_private.redondear_duracion_superior($1,$2) s', [
        seconds,
        interval,
      ])
    ).rows[0].s;
    return value === null ? null : Number(value);
  }
  assert.equal(await round(248 * 60, 15), 255 * 60);
  assert.equal(await round(248 * 60, 30), 270 * 60);
  assert.equal(await round(248 * 60, 60), 300 * 60);
  assert.equal(await round(248 * 60, 5), 250 * 60);
  assert.equal(await round(248 * 60, 10), 250 * 60);
  assert.equal(await round(248 * 60 + 0.001, 0), 248 * 60 + 0.001);
  assert.equal(await round(0, 15), 0);
  assert.equal(await round(15 * 60, 15), 15 * 60);
  assert.equal(await round(15 * 60 + 0.001, 15), 30 * 60);
  assert.equal(await round(0.001, 60), 60 * 60);
  assert.equal(await round(null, 15), null);
  for (const invalid of [-1, 'NaN', 'Infinity'])
    await expectError(() => round(invalid), /REDONDEO_INVALIDO/);
  await expectError(() => round(1, 20), /REDONDEO_INVALIDO/);
  await expectError(
    () => anonymous.query('select chambapp_private.redondear_duracion_superior(1,15)'),
    /permission denied/,
  );
  ok(
    'total-duration ceiling for 0/5/10/15/30/60 including 4h8m, zero, boundaries and fractional seconds',
  );
  const manual = await rpc(ca, 'crear_parte', {
    tarea_id: task.id,
    inicio_en: '2026-09-21T09:07:00+02:00',
    fin_en: '2026-09-21T09:38:00+02:00',
  });
  const detail = (await ca.query('select * from public.partes_detalle where id=$1', [manual.id]))
    .rows[0];
  assert.equal(Number(detail.duracion_real_segundos), 31 * 60);
  assert.equal(Number(detail.duracion_imputada_segundos), 45 * 60);
  assert.equal(detail.inicio_imputado_en.toISOString(), new Date(manual.inicio_en).toISOString());
  assert.equal(detail.fin_imputado_en.toISOString(), new Date(manual.fin_en).toISOString());
  assert.equal((await cb.query('select * from public.partes_detalle')).rows.length, 0);
  const tiny = await rpc(ca, 'crear_parte', {
    tarea_id: task.id,
    inicio_en: '2026-09-21T10:07:00+02:00',
    fin_en: '2026-09-21T10:12:00+02:00',
  });
  assert.equal(
    Number(
      (
        await ca.query(
          'select duracion_imputada_segundos s from public.partes_detalle where id=$1',
          [tiny.id],
        )
      ).rows[0].s,
    ),
    15 * 60,
  );
  for (const [interval, expected] of [
    [0, 248],
    [5, 250],
    [10, 250],
    [15, 255],
    [30, 270],
    [60, 300],
  ]) {
    configured = await rpc(ca, 'editar_perfil', {
      version: configured.version,
      intervalo_redondeo_minutos: interval,
    });
    const day = 10 + interval / 5;
    const start = `2026-08-${String(day).padStart(2, '0')}T09:07:00+02:00`;
    const end = `2026-08-${String(day).padStart(2, '0')}T13:15:00+02:00`;
    const part = await rpc(ca, 'crear_parte', { tarea_id: task.id, inicio_en: start, fin_en: end });
    const row = (await ca.query('select * from public.partes_detalle where id=$1', [part.id]))
      .rows[0];
    assert.equal(row.inicio_en.toISOString(), new Date(start).toISOString());
    assert.equal(row.fin_en.toISOString(), new Date(end).toISOString());
    assert.equal(row.inicio_imputado_en.toISOString(), new Date(start).toISOString());
    assert.equal(row.fin_imputado_en.toISOString(), new Date(end).toISOString());
    assert.equal(Number(row.duracion_real_segundos), 248 * 60);
    assert.equal(Number(row.duracion_imputada_segundos), expected * 60);
  }
  configured = await rpc(ca, 'editar_perfil', {
    version: configured.version,
    intervalo_redondeo_minutos: 15,
  });
  await rpc(ca, 'crear_parte', {
    tarea_id: task.id,
    inicio_en: '2026-09-22T09:07:00+02:00',
    fin_en: '2026-09-22T09:38:00+02:00',
  });
  assert.equal(
    (
      await ca.query(
        "select count(distinct jornada_id)::int n from public.partes_horas where tarea_id=$1 and inicio_en >= '2026-09-21'",
        [task.id],
      )
    ).rows[0].n,
    2,
  );
  await expectError(
    () =>
      rpc(ca, 'crear_parte', {
        tarea_id: task.id,
        inicio_en: '2026-09-21T11:00:00+02:00',
        fin_en: '2026-09-21T11:00:00+02:00',
      }),
    /partes_horas_check/,
  );
  await expectError(
    () =>
      rpc(ca, 'crear_parte', {
        tarea_id: task.id,
        inicio_en: '2026-09-21T09:30:00+02:00',
        fin_en: '2026-09-21T10:00:00+02:00',
      }),
    /exclusion constraint/,
  );
  await expectError(
    () =>
      rpc(ca, 'crear_parte', {
        tarea_id: task.id,
        inicio_en: '2099-01-01T09:00:00Z',
        fin_en: '2099-01-01T10:00:00Z',
      }),
    /INTERVALO_REAL_FUTURO/,
  );
  ok(
    'manual parts retain exact instants, round total with every configured interval, preserve RLS and reject invalid intervals',
  );
  for (const [start, end, seconds] of [
    ['2026-03-29T01:58:00+01:00', '2026-03-29T03:06:00+02:00', 8 * 60],
    ['2025-10-26T02:58:00+02:00', '2025-10-26T02:06:00+01:00', 8 * 60],
    ['2025-10-27T09:00:00.125+01:00', '2025-10-27T09:15:00.126+01:00', 15 * 60 + 0.001],
  ]) {
    const part = await rpc(ca, 'crear_parte', { tarea_id: task.id, inicio_en: start, fin_en: end });
    const row = (await ca.query('select * from public.partes_detalle where id=$1', [part.id]))
      .rows[0];
    assert.equal(row.inicio_imputado_en.toISOString(), new Date(start).toISOString());
    assert.equal(row.fin_imputado_en.toISOString(), new Date(end).toISOString());
    assert.equal(Number(row.duracion_real_segundos), seconds);
    assert.equal(Number(row.duracion_imputada_segundos), seconds === 8 * 60 ? 15 * 60 : 30 * 60);
  }
  const totals = (
    await ca.query('select * from public.resumen_proyectos where proyecto_id=$1', [project.id])
  ).rows[0];
  const sums = (
    await ca.query(
      'select sum(duracion_real_segundos) real,sum(duracion_imputada_segundos) rounded from public.partes_detalle',
    )
  ).rows[0];
  assert.equal(totals.segundos_reales, sums.real);
  assert.equal(totals.segundos_imputados, sums.rounded);
  ok(
    'duration uses actual elapsed time across both DST transitions; subsecond boundaries and dependent aggregates match',
  );
  const changed = await rpc(ca, 'editar_perfil', {
    version: configured.version,
    zona_horaria: 'America/New_York',
    intervalo_redondeo_minutos: 5,
  });
  assert.equal(
    (
      await ca.query('select intervalo_redondeo_minutos from public.partes_horas where id=$1', [
        manual.id,
      ])
    ).rows[0].intervalo_redondeo_minutos,
    15,
  );
  assert.equal(
    (await ca.query('select zona_horaria from public.jornadas where id=$1', [manual.jornada_id]))
      .rows[0].zona_horaria,
    'Europe/Madrid',
  );
  const moved = await rpc(ca, 'editar_parte', {
    id: tiny.id,
    version: tiny.version,
    inicio_en: '2026-09-23T10:07:00+02:00',
    fin_en: '2026-09-23T10:12:00+02:00',
  });
  assert.notEqual(moved.jornada_id, tiny.jornada_id);
  await expectError(
    () => rpc(ca, 'editar_parte', { id: tiny.id, version: tiny.version, descripcion: 'stale' }),
    /CONFLICTO_VERSION/,
  );
  ok('historical timezone/rounding snapshots and reassignment when editing part date');
  const startId = randomUUID();
  const request = { operacion_id: startId, tarea_id: task.id };
  const started = await rpc(ca, 'iniciar', request);
  assert.equal(started.ok, true);
  const activeDetail = (
    await ca.query('select * from public.partes_detalle where id=$1', [started.parte.id])
  ).rows[0];
  assert.equal(
    activeDetail.inicio_imputado_en.toISOString(),
    new Date(started.parte.inicio_en).toISOString(),
  );
  assert.equal(activeDetail.fin_imputado_en, null);
  assert.equal(activeDetail.duracion_real_segundos, null);
  assert.equal(activeDetail.duracion_imputada_segundos, null);
  assert.deepEqual(await rpc(ca, 'iniciar', request), started);
  await expectError(
    () => rpc(ca, 'iniciar', { ...request, descripcion: 'changed' }),
    /OPERACION_ID_REUTILIZADO/,
  );
  const conflictId = randomUUID();
  const conflict = await rpc(ca, 'iniciar', { operacion_id: conflictId, tarea_id: task.id });
  assert.equal(conflict.codigo, 'CRONOMETRO_ACTIVO');
  assert.equal((await rpc(ca, 'consultar_cronometro')).parte.id, started.parte.id);
  const concurrentA = await client(a),
    concurrentB = await client(a);
  const settingsRace = await Promise.allSettled([
    rpc(concurrentA, 'editar_perfil', {
      version: changed.version,
      preferencias: { idioma: 'es', recordatorio: true },
    }),
    rpc(concurrentB, 'editar_perfil', {
      version: changed.version,
      preferencias: { idioma: 'en', recordatorio: false },
    }),
  ]);
  assert.equal(settingsRace.filter((x) => x.status === 'fulfilled').length, 1);
  assert.match(
    settingsRace.find((x) => x.status === 'rejected').reason.message,
    /CONFLICTO_VERSION/,
  );
  const attempts = await Promise.all([
    rpc(concurrentA, 'iniciar', { operacion_id: randomUUID(), tarea_id: task.id }),
    rpc(concurrentB, 'iniciar', { operacion_id: randomUUID(), tarea_id: task.id }),
  ]);
  assert.ok(attempts.every((x) => x.codigo === 'CRONOMETRO_ACTIVO'));
  await expectError(
    () => rpc(ca, 'editar_tarea', { id: task.id, version: task.version, archivado: true }),
    /HIJOS_ACTIVOS/,
  );
  const stopRequest = { operacion_id: randomUUID(), parte_id: started.parte.id };
  const stopped = await rpc(ca, 'detener', stopRequest);
  assert.equal(stopped.ok, true);
  assert.deepEqual(await rpc(ca, 'detener', stopRequest), stopped);
  const again = await rpc(ca, 'detener', {
    operacion_id: randomUUID(),
    parte_id: started.parte.id,
  });
  assert.equal(again.parte.fin_en, stopped.parte.fin_en);
  await expectError(
    () => rpc(cb, 'detener', { operacion_id: randomUUID(), parte_id: started.parte.id }),
    /PARTE_NO_DISPONIBLE/,
  );
  assert.equal(
    (await rpc(ca, 'consultar_operacion', { operacion_id: startId })).parte_actual.fin_en,
    stopped.parte.fin_en,
  );
  assert.equal((await rpc(cb, 'consultar_operacion', { operacion_id: startId })).encontrada, false);
  ok(
    'timer recovery, operation idempotency, conflict persistence, concurrency and cross-user stop protection',
  );
  const race = await Promise.all([
    rpc(concurrentA, 'iniciar', { operacion_id: randomUUID(), tarea_id: task.id }),
    rpc(concurrentB, 'iniciar', { operacion_id: randomUUID(), tarea_id: task.id }),
  ]);
  assert.equal(race.filter((x) => x.ok).length, 1);
  const active = race.find((x) => x.ok).parte;
  await expectError(
    () =>
      rpc(ca, 'eliminar_proyecto', {
        id: project.id,
        version: project.version,
        confirmar_cascada: true,
      }),
    /DETENER_O_DESCARTAR_ACTIVO/,
  );
  await expectError(
    () => rpc(ca, 'eliminar_proyecto', { id: project.id, version: project.version }),
    /CONFIRMACION_CASCADA/,
  );
  const deleted = await rpc(ca, 'eliminar_proyecto', {
    id: project.id,
    version: project.version,
    confirmar_cascada: true,
    descartar_activo: true,
  });
  assert.ok(deleted.eliminado_en);
  assert.equal((await ca.query('select count(*)::int n from public.partes_detalle')).rows[0].n, 0);
  assert.equal((await rpc(ca, 'consultar_cronometro')).parte, null);
  assert.equal(
    (await ca.query('select count(*)::int n from public.tareas where eliminado_en is null')).rows[0]
      .n,
    0,
  );
  assert.deepEqual(
    await rpc(ca, 'eliminar_proyecto', { id: project.id, version: project.version }),
    deleted,
  );
  assert.equal(
    (await rpc(ca, 'detener', { operacion_id: randomUUID(), parte_id: active.id })).codigo,
    'PARTE_ELIMINADO',
  );
  assert.ok(
    (await rpc(ca, 'consultar_operacion', { operacion_id: startId })).parte_actual.eliminado_en,
  );
  assert.ok(
    (await ca.query('select * from public.resumen_jornadas')).rows.every(
      (x) => Number(x.segundos_reales) === 0,
    ),
  );
  ok(
    'competing starts create one part; cascade deletion/active discard/retries preserve tombstones and totals',
  );
  await verifyAttendance({ admin, ca, cb, anonymous, client, rpc, expectError, ok });
  await verifyOdooStatus({ ca, cb, client, rpc, expectError, ok });
  await verifySelectedStartAndCredentials({
    admin,
    ca,
    cb,
    anonymous,
    noSession,
    client,
    rpc,
    expectError,
    ok,
  });
  await expectError(
    () =>
      admin.query('update public.configuraciones_semanales set minutos_semanales=1 where id=$1', [
        cfg.id,
      ]),
    /CREAR_NUEVA_VERSION/,
  );
  const catalog = (
    await admin.query(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','chambapp_private') and c.relkind='r'`)
  ).rows;
  assert.equal(catalog.length, 11);
  assert.ok(catalog.every((x) => x.relrowsecurity));
  const unsafe = (
    await admin.query(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef`)
  ).rows;
  assert.deepEqual(unsafe, []);
  const viewSecurity = (
    await admin.query(`select c.relname,c.reloptions from pg_class c
    join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v'`)
  ).rows;
  assert.equal(viewSecurity.length, 6);
  assert.ok(viewSecurity.every((x) => x.reloptions.includes('security_invoker=true')));
  assert.equal(
    (
      await admin.query(
        "select to_regprocedure('chambapp_private.redondear_superior(timestamptz,integer,text)') p",
      )
    ).rows[0].p,
    null,
  );
  assert.equal(
    (
      await admin.query(`select has_function_privilege('anon',
    'chambapp_private.redondear_duracion_superior(numeric,integer)','EXECUTE') allowed`)
    ).rows[0].allowed,
    false,
  );
  ok(
    'all eleven tables have RLS, weekly versions are immutable and public RPC is security invoker',
  );
  await admin.query(await readFile(join(root, 'supabase/verify.sql'), 'utf8'));
  console.log(
    `PASS: ${count} database verification groups. PostgreSQL ${(await admin.query('show server_version')).rows[0].server_version}.`,
  );
} finally {
  for (const c of clients) await c.end().catch(() => {});
  await postgres.stop().catch(() => {});
}
