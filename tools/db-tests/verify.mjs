import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const databaseDir = await mkdtemp(join(tmpdir(), 'chambapp-db-test-'));
// persistent: true avoids deleting any host paths. Test data is isolated in this temp directory.
const postgres = new EmbeddedPostgres({ databaseDir, port: 55439, user: 'postgres',
  password: randomUUID(), persistent: true, onLog() {}, onError(message) { console.error(String(message)); } });
const clients = [];
let count = 0;
function ok(label) { count++; console.log(`OK ${count}: ${label}`); }
async function expectError(work, match) {
  await assert.rejects(work, error => match.test(error.message));
}
try {
  await postgres.initialise();
  await postgres.start();
  const admin = postgres.getPgClient(); await admin.connect(); clients.push(admin);
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
  const migrations = (await readdir(join(root,'supabase/migrations'))).filter(n=>n.endsWith('.sql')).sort();
  for (const file of migrations) await admin.query(await readFile(join(root,'supabase/migrations',file),'utf8'));
  await admin.query(await readFile(join(root,'supabase/verify.sql'),'utf8'));
  ok('migration applies on PostgreSQL 17 with Supabase-like roles/default grants');
  const a = randomUUID(), b = randomUUID();
  await admin.query('insert into auth.users values ($1,$2),($3,$4)', [a,{nombre:'Ana',zona_horaria:'invalid'},b,{nombre:''}]);
  assert.equal((await admin.query('select count(*)::int n from public.perfiles')).rows[0].n,2);
  ok('Auth trigger creates profiles and ignores invalid optional timezone metadata');
  async function client(user, role='authenticated') {
    const c = postgres.getPgClient(); await c.connect(); clients.push(c);
    await c.query(`set role ${role}`);
    if (user) await c.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
    return c;
  }
  const ca = await client(a), cb = await client(b), anonymous = await client(null,'anon');
  const rpc = async (c, action, data={}) => (await c.query('select public.chambapp_operar($1,$2) r',[action,data])).rows[0].r;
  const profile = (await ca.query('select * from public.perfiles')).rows[0];
  assert.equal(profile.id,a); assert.equal((await cb.query('select * from public.perfiles')).rows.length,1);
  await expectError(()=>anonymous.query('select * from public.perfiles'),/permission denied/);
  await expectError(()=>rpc(anonymous,'crear_proyecto',{nombre:'x'}),/permission denied/);
  const noSession = await client(null);
  await expectError(()=>rpc(noSession,'crear_proyecto',{nombre:'x'}),/SESION_REQUERIDA/);
  await expectError(()=>ca.query("insert into public.proyectos(usuario_id,nombre) values ($1,'x')",[a]),/permission denied/);
  await expectError(()=>ca.query('select * from chambapp_private.operaciones_cronometro'),/permission denied/);
  ok('RLS isolates reads; anonymous/direct writes/private operation access are denied');
  await expectError(()=>rpc(ca,'editar_perfil',{version:profile.version,zona_horaria:'Not/AZone'}),/ZONA_HORARIA_INVALIDA/);
  const configured = await rpc(ca,'editar_perfil',{version:profile.version,intervalo_redondeo_minutos:15,zona_horaria:'Europe/Madrid'});
  await expectError(()=>rpc(ca,'editar_perfil',{version:profile.version,nombre:'stale'}),/CONFLICTO_VERSION/);
  ok('timezone validation and optimistic concurrency');
  const project = await rpc(ca,'crear_proyecto',{nombre:'Web',usuario_id:b}); assert.equal(project.usuario_id,a);
  const task = await rpc(ca,'crear_tarea',{proyecto_id:project.id,titulo:'Portada'});
  const foreignProject = await rpc(cb,'crear_proyecto',{nombre:'Other'});
  await expectError(()=>rpc(ca,'crear_tarea',{proyecto_id:foreignProject.id,titulo:'bad'}),/PROYECTO_NO_DISPONIBLE/);
  await expectError(()=>rpc(cb,'editar_proyecto',{id:project.id,version:project.version,nombre:'bad'}),/PROYECTO_NO_DISPONIBLE/);
  ok('ownership is derived from session and cross-user links/edits are refused');
  const cfg = await rpc(ca,'crear_configuracion_semanal',{minutos_semanales:2251,vigente_desde:'2026-09-21',dias:[5,3,1,4,2]});
  const ds = (await ca.query('select * from public.dias_configuracion_semanal order by dia_semana')).rows;
  assert.deepEqual(ds.map(x=>x.minutos_objetivo),[451,450,450,450,450]);
  await expectError(()=>rpc(ca,'crear_configuracion_semanal',{minutos_semanales:200,vigente_desde:'2026-09-28',dias:[1,1]}),/DIAS_INVALIDOS/);
  await expectError(()=>rpc(ca,'crear_configuracion_semanal',{minutos_semanales:200,vigente_desde:'2026-09-28',dias:[1,2],reparto:{1:50,2:50}}),/REPARTO_SEMANAL_INVALIDO/);
  let week = await rpc(ca,'generar_semana',{lunes:'2026-09-21'}); assert.equal(week.jornadas.length,5);
  const monday = week.jornadas[0];
  await rpc(ca,'editar_jornada',{id:monday.id,version:monday.version,minutos_objetivo:400});
  week = await rpc(ca,'generar_semana',{lunes:'2026-09-21'});
  assert.equal(week.jornadas[0].minutos_objetivo,400); assert.equal(week.jornadas.length,5);
  ok('weekly distribution preserves sums and generation preserves existing daily overrides');
  async function round(instant,interval=15,zone='Europe/Madrid') {
    return (await ca.query('select chambapp_private.redondear_superior($1,$2,$3) t',[instant,interval,zone])).rows[0].t.toISOString();
  }
  assert.equal(await round('2026-09-21T09:07:00+02:00'),'2026-09-21T07:15:00.000Z');
  assert.equal(await round('2026-09-21T09:15:00+02:00'),'2026-09-21T07:15:00.000Z');
  assert.equal(await round('2026-09-21T09:15:00.001+02:00'),'2026-09-21T07:30:00.000Z');
  assert.equal(await round('2026-09-21T09:07:00+02:00',10),'2026-09-21T07:10:00.000Z');
  assert.equal(await round('2026-09-21T09:07:00+02:00',5),'2026-09-21T07:10:00.000Z');
  assert.equal(await round('2026-03-29T01:58:00+01:00'),'2026-03-29T01:00:00.000Z');
  assert.equal(await round('2026-10-25T02:58:00+02:00'),'2026-10-25T01:00:00.000Z');
  assert.equal(await round('2026-10-25T02:07:00+01:00'),'2026-10-25T01:15:00.000Z');
  ok('5/10/15-minute ceiling, exact boundaries, seconds and both DST transitions');
  const manual = await rpc(ca,'crear_parte',{tarea_id:task.id,inicio_en:'2026-09-21T09:07:00+02:00',fin_en:'2026-09-21T09:38:00+02:00'});
  const detail = (await ca.query('select * from public.partes_detalle where id=$1',[manual.id])).rows[0];
  assert.equal(Number(detail.duracion_real_segundos),31*60); assert.equal(Number(detail.duracion_imputada_segundos),30*60);
  const tiny = await rpc(ca,'crear_parte',{tarea_id:task.id,inicio_en:'2026-09-21T10:07:00+02:00',fin_en:'2026-09-21T10:12:00+02:00'});
  assert.equal(Number((await ca.query('select duracion_imputada_segundos s from public.partes_detalle where id=$1',[tiny.id])).rows[0].s),0);
  await rpc(ca,'crear_parte',{tarea_id:task.id,inicio_en:'2026-09-22T09:07:00+02:00',fin_en:'2026-09-22T09:38:00+02:00'});
  assert.equal((await ca.query('select count(distinct jornada_id)::int n from public.partes_horas where tarea_id=$1',[task.id])).rows[0].n,2);
  await expectError(()=>rpc(ca,'crear_parte',{tarea_id:task.id,inicio_en:'2026-09-21T09:30:00+02:00',fin_en:'2026-09-21T10:00:00+02:00'}),/exclusion constraint/);
  await expectError(()=>rpc(ca,'crear_parte',{tarea_id:task.id,inicio_en:'2099-01-01T09:00:00Z',fin_en:'2099-01-01T10:00:00Z'}),/INTERVALO_REAL_FUTURO/);
  ok('manual parts, zero imputable duration, multi-day task, overlap/future restrictions');
  const changed = await rpc(ca,'editar_perfil',{version:configured.version,zona_horaria:'America/New_York',intervalo_redondeo_minutos:5});
  assert.equal((await ca.query('select intervalo_redondeo_minutos from public.partes_horas where id=$1',[manual.id])).rows[0].intervalo_redondeo_minutos,15);
  assert.equal((await ca.query('select zona_horaria from public.jornadas where id=$1',[manual.jornada_id])).rows[0].zona_horaria,'Europe/Madrid');
  const moved = await rpc(ca,'editar_parte',{id:tiny.id,version:tiny.version,inicio_en:'2026-09-23T10:07:00+02:00',fin_en:'2026-09-23T10:12:00+02:00'});
  assert.notEqual(moved.jornada_id,tiny.jornada_id);
  await expectError(()=>rpc(ca,'editar_parte',{id:tiny.id,version:tiny.version,descripcion:'stale'}),/CONFLICTO_VERSION/);
  ok('historical timezone/rounding snapshots and reassignment when editing part date');
  const startId = randomUUID(); const request = {operacion_id:startId,tarea_id:task.id};
  const started = await rpc(ca,'iniciar',request); assert.equal(started.ok,true);
  assert.deepEqual(await rpc(ca,'iniciar',request),started);
  await expectError(()=>rpc(ca,'iniciar',{...request,descripcion:'changed'}),/OPERACION_ID_REUTILIZADO/);
  const conflictId = randomUUID();
  const conflict = await rpc(ca,'iniciar',{operacion_id:conflictId,tarea_id:task.id}); assert.equal(conflict.codigo,'CRONOMETRO_ACTIVO');
  assert.equal((await rpc(ca,'consultar_cronometro')).parte.id,started.parte.id);
  const concurrentA = await client(a), concurrentB = await client(a);
  const attempts = await Promise.all([rpc(concurrentA,'iniciar',{operacion_id:randomUUID(),tarea_id:task.id}),rpc(concurrentB,'iniciar',{operacion_id:randomUUID(),tarea_id:task.id})]);
  assert.ok(attempts.every(x=>x.codigo==='CRONOMETRO_ACTIVO'));
  await expectError(()=>rpc(ca,'editar_tarea',{id:task.id,version:task.version,archivado:true}),/HIJOS_ACTIVOS/);
  const stopRequest = {operacion_id:randomUUID(),parte_id:started.parte.id};
  const stopped = await rpc(ca,'detener',stopRequest); assert.equal(stopped.ok,true);
  assert.deepEqual(await rpc(ca,'detener',stopRequest),stopped);
  const again = await rpc(ca,'detener',{operacion_id:randomUUID(),parte_id:started.parte.id});
  assert.equal(again.parte.fin_en,stopped.parte.fin_en);
  await expectError(()=>rpc(cb,'detener',{operacion_id:randomUUID(),parte_id:started.parte.id}),/PARTE_NO_DISPONIBLE/);
  assert.equal((await rpc(ca,'consultar_operacion',{operacion_id:startId})).parte_actual.fin_en,stopped.parte.fin_en);
  assert.equal((await rpc(cb,'consultar_operacion',{operacion_id:startId})).encontrada,false);
  ok('timer recovery, operation idempotency, conflict persistence, concurrency and cross-user stop protection');
  const race = await Promise.all([rpc(concurrentA,'iniciar',{operacion_id:randomUUID(),tarea_id:task.id}),rpc(concurrentB,'iniciar',{operacion_id:randomUUID(),tarea_id:task.id})]);
  assert.equal(race.filter(x=>x.ok).length,1);
  const active = race.find(x=>x.ok).parte;
  await expectError(()=>rpc(ca,'eliminar_proyecto',{id:project.id,version:project.version,confirmar_cascada:true}),/DETENER_O_DESCARTAR_ACTIVO/);
  await expectError(()=>rpc(ca,'eliminar_proyecto',{id:project.id,version:project.version}),/CONFIRMACION_CASCADA/);
  const deleted = await rpc(ca,'eliminar_proyecto',{id:project.id,version:project.version,confirmar_cascada:true,descartar_activo:true});
  assert.ok(deleted.eliminado_en);
  assert.equal((await ca.query('select count(*)::int n from public.partes_detalle')).rows[0].n,0);
  assert.equal((await rpc(ca,'consultar_cronometro')).parte,null);
  assert.equal((await ca.query('select count(*)::int n from public.tareas where eliminado_en is null')).rows[0].n,0);
  assert.deepEqual(await rpc(ca,'eliminar_proyecto',{id:project.id,version:project.version}),deleted);
  assert.equal((await rpc(ca,'detener',{operacion_id:randomUUID(),parte_id:active.id})).codigo,'PARTE_ELIMINADO');
  assert.ok((await rpc(ca,'consultar_operacion',{operacion_id:startId})).parte_actual.eliminado_en);
  assert.ok((await ca.query('select * from public.resumen_jornadas')).rows.every(x=>Number(x.segundos_reales)===0));
  ok('competing starts create one part; cascade deletion/active discard/retries preserve tombstones and totals');
  await expectError(()=>admin.query('update public.configuraciones_semanales set minutos_semanales=1 where id=$1',[cfg.id]),/CREAR_NUEVA_VERSION/);
  const catalog = (await admin.query(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','chambapp_private') and c.relkind='r'`)).rows;
  assert.equal(catalog.length,8); assert.ok(catalog.every(x=>x.relrowsecurity));
  const unsafe = (await admin.query(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef`)).rows;
  assert.deepEqual(unsafe,[]);
  ok('all eight tables have RLS, weekly versions are immutable and public RPC is security invoker');
  console.log(`PASS: ${count} database verification groups. PostgreSQL ${(await admin.query('show server_version')).rows[0].server_version}.`);
} finally {
  for (const c of clients) await c.end().catch(()=>{});
  await postgres.stop().catch(()=>{});
}
