// Plan 12: the local edition database (docker/db). Applies the real shim, every cloud
// migration and the local migration to a fresh embedded PostgreSQL, then checks the
// pre-request generation guard, full backups (export / replace-all import), atomic
// rejection of malformed backups and the classification of every trigger.
// PostgREST is simulated: each request is one transaction as "authenticated" with
// request.method / request.path / request.headers set, calling antes_peticion() first.
import EmbeddedPostgres from 'embedded-postgres';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const USER = '00000000-0000-4000-8000-000000000001';
const postgres = new EmbeddedPostgres({
  databaseDir: await mkdtemp(join(tmpdir(), 'chambapp-local-edition-')),
  port: 55441,
  user: 'postgres',
  password: randomUUID(),
  persistent: true,
  initdbFlags: ['--encoding=UTF8'],
  onLog() {},
  onError(message) {
    console.error(String(message));
  },
});

let count = 0;
const ok = (label) => console.log(`OK ${++count}: ${label}`);
const envelope = (size = 32) =>
  `v1.${randomBytes(12).toString('base64url')}.${randomBytes(size).toString('base64url')}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

// Triggers and what a restore does with each (docker/README.md, "Clasificación de triggers").
// persistido: its rule on persisted rows is re-checked after import.
// edicion: only restricts later edits; not applicable to restored state.
// historial: versioning, timestamps or side effects; bypassed on import.
const TRIGGERS = {
  'auth.users:chambapp_crear_perfil': 'historial',
  'public.perfiles:validar_fila': 'persistido',
  'public.proyectos:validar_fila': 'persistido',
  'public.tareas:validar_fila': 'persistido',
  'public.jornadas:validar_fila': 'persistido',
  'public.partes_horas:validar_fila': 'persistido',
  'public.proyectos:validar_arbol': 'persistido',
  'public.tareas:validar_arbol': 'persistido',
  'public.partes_horas:validar_arbol': 'persistido',
  'public.configuraciones_semanales:validar_configuracion': 'persistido',
  'public.dias_configuracion_semanal:validar_configuracion': 'persistido',
  'public.configuraciones_semanales:configuracion_inmutable': 'edicion',
  'public.dias_configuracion_semanal:configuracion_inmutable': 'edicion',
  'public.dias_configuracion_semanal:validar_dia_nuevo': 'edicion',
  'public.fichajes:validar_fichaje': 'persistido',
  'public.ausencias:ausencias_version': 'historial',
  'public.notas:notas_version': 'historial',
  'public.notas:notas_cifrado_obligatorio': 'persistido',
  'public.credenciales:credenciales_version': 'historial',
  'public.proyectos:proyectos_borrar_credenciales': 'historial',
  'public.partes_horas:sincronizar_imputacion_odoo': 'historial',
  'public.partes_horas:limpiar_imputacion_odoo': 'historial',
  'public.nota_proyectos:enlace_propio': 'persistido',
  'public.nota_tareas:enlace_propio': 'persistido',
  'public.credenciales:enlace_propio': 'persistido',
};
const BACKUP_TABLES = [
  'public.perfiles',
  'public.configuraciones_semanales',
  'public.dias_configuracion_semanal',
  'public.jornadas',
  'public.proyectos',
  'public.tareas',
  'public.imputaciones_odoo',
  'public.partes_horas',
  'public.fichajes',
  'public.ausencias',
  'public.bovedas',
  'public.notas',
  'public.nota_proyectos',
  'public.nota_tareas',
  'public.credenciales',
];
const CLEARED_TABLES = [
  'chambapp_private.operaciones_cronometro',
  'chambapp_private.operaciones_fichajes',
  'chambapp_private.traspasos',
];

const connections = [];
try {
  await postgres.initialise();
  await postgres.start();
  const admin = postgres.getPgClient();
  await admin.connect();
  connections.push(admin);

  // ---- migrations, in the order docker/db/migrate.sh applies them
  const files = [];
  for (const [dir, folder] of [
    ['shim', 'docker/db/shim'],
    ['supabase', 'supabase/migrations'],
    ['local', 'docker/db/local'],
  ]) {
    for (const name of (await readdir(join(root, folder))).filter((n) => n.endsWith('.sql')).sort())
      files.push({ name: `${dir}/${name}`, path: join(root, folder, name) });
  }
  for (const file of files) {
    const text = (await readFile(file.path, 'utf8')).replace(/\r/g, '');
    const statements = text
      .split('\n')
      .map((line) => line.trim().toLowerCase())
      .filter((line) => line && !line.startsWith('--'));
    assert.equal(statements[0], 'begin;', `${file.name} empieza por begin;`);
    assert.equal(statements.at(-1), 'commit;', `${file.name} termina en commit;`);
    assert.equal(statements.filter((line) => line === 'begin;').length, 1, file.name);
    assert.equal(statements.filter((line) => line === 'commit;').length, 1, file.name);
    await admin.query(text);
  }
  ok(
    `shim + ${files.length - 2} cloud migrations + local migration apply; all wrapped once in begin/commit`,
  );

  const profile = (await admin.query('select * from public.perfiles')).rows;
  assert.equal(profile.length, 1);
  assert.equal(profile[0].id, USER);
  assert.equal(profile[0].onboarding_completado, false);
  ok('the fixed local user and its profile exist (onboarding pending)');

  // ---- PostgREST-like requests
  async function connect() {
    const c = postgres.getPgClient();
    await c.connect();
    connections.push(c);
    return c;
  }
  const main = await connect();
  /** One request: own transaction, authenticated role, pre-request hook, then the call. */
  async function request(c, sql, params, { method = 'POST', path, gen, keepOpen = false }) {
    await c.query('begin');
    try {
      await c.query('set local role authenticated');
      await c.query(
        `select set_config('request.method',$1,true), set_config('request.path',$2,true),
          set_config('request.headers',$3,true)`,
        [method, path, JSON.stringify(gen === undefined ? {} : { 'x-chambapp-generacion': gen })],
      );
      await c.query('select chambapp_local.antes_peticion()');
      const result = await c.query(sql, params);
      if (!keepOpen) await c.query('commit');
      return result.rows[0]?.r;
    } catch (error) {
      await c.query('rollback');
      throw error;
    }
  }
  const estado = (c = main) =>
    request(c, 'select public.chambapp_copia_estado() r', [], {
      path: '/rpc/chambapp_copia_estado',
    });
  let generation = (await estado()).generacion;
  const call = (fn, action, data, c = main, gen = generation) =>
    request(c, `select public.${fn}($1,$2) r`, [action, data], { path: `/rpc/${fn}`, gen });
  const op = (action, data) => call('chambapp_operar', action, data);
  const exportar = (c = main) =>
    request(c, 'select public.chambapp_copia_exportar() r', [], {
      path: '/rpc/chambapp_copia_exportar',
    });
  const importar = (datos, expected = generation, c = main) =>
    request(
      c,
      'select public.chambapp_copia_importar($1) r',
      [{ generacion_esperada: expected, datos }],
      {
        path: '/rpc/chambapp_copia_importar',
      },
    );
  const rejects = (work, pattern) =>
    assert.rejects(work, (error) => pattern.test(`${error.message} ${error.code} ${error.detail}`));

  const first = await estado();
  assert.match(first.instalacion, /^[0-9a-f-]{36}$/);
  await rejects(
    () => call('chambapp_operar', 'crear_proyecto', { nombre: 'x' }, main, randomUUID()),
    /GENERACION_CAMBIADA/,
  );
  await rejects(
    () =>
      request(main, 'select public.chambapp_operar(\'crear_proyecto\',\'{"nombre":"x"}\') r', [], {
        path: '/rpc/chambapp_operar',
      }),
    /PT409/,
  );
  // Reads need no generation.
  await request(main, 'select count(*)::int r from public.proyectos', [], {
    method: 'GET',
    path: '/proyectos',
  });
  ok(
    'writes need the current generation (409 GENERACION_CAMBIADA otherwise); reads and backup RPCs do not',
  );

  // ---- a workspace that exercises every delete path
  await op('editar_perfil', {
    version: profile[0].version,
    onboarding_completado: true,
    zona_horaria: 'Europe/Madrid',
  });
  await op('crear_configuracion_semanal', {
    minutos_semanales: 2400,
    vigente_desde: '2026-09-21',
    dias: [1, 2, 3, 4, 5],
  });
  const p1 = await op('crear_proyecto', { nombre: 'Cliente A' });
  const p2 = await op('crear_proyecto', { nombre: 'Se borrará' });
  const t1 = await op('crear_tarea', { proyecto_id: p1.id, titulo: 'Desarrollo' });
  const t2 = await op('crear_tarea', { proyecto_id: p1.id, titulo: 'Tarea borrada' });
  const t3 = await op('crear_tarea', { proyecto_id: p2.id, titulo: 'Hija de borrado' });
  const e1 = await op('crear_parte', {
    tarea_id: t1.id,
    inicio_en: '2026-09-21T09:00:00+02:00',
    fin_en: '2026-09-21T10:00:00+02:00',
  });
  const e2 = await op('crear_parte', {
    tarea_id: t1.id,
    inicio_en: '2026-09-21T10:30:00+02:00',
    fin_en: '2026-09-21T11:00:00+02:00',
  });
  const e3 = await op('crear_parte', {
    tarea_id: t1.id,
    inicio_en: '2026-09-22T09:00:00+02:00',
    fin_en: '2026-09-22T09:30:00+02:00',
  });
  await call('chambapp_imputaciones', 'imputar_partes', {
    partes: [
      { id: e1.id, version: e1.version },
      { id: e2.id, version: e2.version },
    ],
  });
  await op('eliminar_parte', { id: e3.id, version: e3.version });
  const timer = await op('iniciar', { operacion_id: randomUUID(), tarea_id: t1.id });
  await op('detener', { operacion_id: randomUUID(), parte_id: timer.parte.id });
  const tarea2 = (await admin.query('select version from public.tareas where id=$1', [t2.id]))
    .rows[0];
  await op('eliminar_tarea', {
    id: t2.id,
    version: Number(tarea2.version),
    confirmar_cascada: true,
  });
  const linked = await call('chambapp_notas', 'guardar_nota', {
    id: randomUUID(),
    titulo: 'Nota enlazada',
    contenido_md: 'Enlazada a un proyecto y una tarea que se borran.',
    proyecto_ids: [p2.id],
    tarea_ids: [t3.id],
  });
  const doomedNote = await call('chambapp_notas', 'guardar_nota', {
    id: randomUUID(),
    titulo: 'Borrada',
    contenido_md: '',
    proyecto_ids: [],
    tarea_ids: [],
  });
  await call('chambapp_notas', 'eliminar_nota', { id: doomedNote.id, version: doomedNote.version });
  const project2 = (await admin.query('select version from public.proyectos where id=$1', [p2.id]))
    .rows[0];
  await op('eliminar_proyecto', {
    id: p2.id,
    version: Number(project2.version),
    confirmar_cascada: true,
  });
  const fichaje = await op('fichar_entrada', { id: randomUUID() });
  await op('fichar_salida', { id: fichaje.id, version: fichaje.version });
  const removed = await op('fichar_entrada', { id: randomUUID() });
  await op('fichar_salida', { id: removed.id, version: removed.version });
  const removedNow = (
    await admin.query('select version from public.fichajes where id=$1', [removed.id])
  ).rows[0];
  await op('eliminar_fichaje', { id: removed.id, version: Number(removedNow.version) });
  const absence = await call('chambapp_calendario', 'guardar_ausencia', {
    id: randomUUID(),
    titulo: 'Vacaciones',
    tipo: 'vacaciones',
    inicio: '2026-08-03',
    fin: '2026-08-07',
  });
  const gone = await call('chambapp_calendario', 'guardar_ausencia', {
    id: randomUUID(),
    titulo: 'Puente',
    tipo: 'vacaciones',
    inicio: '2026-10-12',
    fin: '2026-10-12',
  });
  await call('chambapp_calendario', 'eliminar_ausencia', { id: gone.id, version: gone.version });
  const vaultGeneration = randomUUID();
  await call('chambapp_boveda', 'crear_boveda', {
    generacion: vaultGeneration,
    sal: randomBytes(16).toString('base64url'),
    iteraciones: 600000,
    clave_envuelta: envelope(48),
  });
  await call('chambapp_notas', 'guardar_nota', {
    id: randomUUID(),
    cifrado: envelope(),
    boveda_generacion: vaultGeneration,
    proyecto_ids: [p1.id],
    tarea_ids: [],
  });
  await call('chambapp_credenciales', 'guardar_credencial', {
    id: randomUUID(),
    proyecto_id: p1.id,
    boveda_generacion: vaultGeneration,
    cifrado: envelope(),
  });
  const doomedSecret = await call('chambapp_credenciales', 'guardar_credencial', {
    id: randomUUID(),
    proyecto_id: p1.id,
    boveda_generacion: vaultGeneration,
    cifrado: envelope(),
  });
  await call('chambapp_credenciales', 'eliminar_credencial', {
    id: doomedSecret.id,
    version: doomedSecret.version,
  });
  assert.ok(absence.id && linked.id);

  const backup = await exportar();
  assert.equal(backup.formato, 'chambapp-servidor-datos');
  assert.equal(backup.version, 1);
  assert.deepEqual(Object.keys(backup.tablas).sort(), [...BACKUP_TABLES].sort());
  const links = backup.tablas['public.nota_proyectos'];
  assert.ok(links.some((row) => row.proyecto_id === p2.id));
  assert.equal(backup.tablas['chambapp_private.odoo_credenciales'], undefined);
  ok('export contains every table, including links to deleted records (and no Odoo key)');

  // ---- round trip
  await op('crear_proyecto', { nombre: 'Después de la copia' });
  const restored = await importar(backup);
  assert.equal(restored.ok, true);
  assert.notEqual(restored.generacion, generation);
  const oldGeneration = generation;
  generation = restored.generacion;
  assert.equal((await estado()).generacion, generation);
  const again = await exportar();
  assert.deepEqual(again.tablas, backup.tablas);
  assert.equal(
    (await admin.query('select count(*)::int n from chambapp_private.operaciones_cronometro'))
      .rows[0].n,
    0,
  );
  assert.equal(
    (await admin.query('select count(*)::int n from chambapp_private.operaciones_fichajes')).rows[0]
      .n,
    0,
  );
  const view = (
    await admin.query('select proyecto_ids, tarea_ids from public.notas_detalle where id=$1', [
      linked.id,
    ])
  ).rows[0];
  assert.deepEqual(view, { proyecto_ids: [], tarea_ids: [] });
  ok(
    'import replaces everything exactly (versions kept), clears dedup records and rotates the generation',
  );

  await rejects(
    () => call('chambapp_operar', 'crear_proyecto', { nombre: 'Tarde' }, main, oldGeneration),
    /GENERACION_CAMBIADA/,
  );
  await rejects(() => importar(backup, oldGeneration), /GENERACION_CAMBIADA/);
  ok('requests and imports from the previous generation are rejected');

  // ---- malformed backups are rejected atomically
  const snapshot = await exportar();
  async function rejected(label, mutate, pattern = /COPIA_INVALIDA/) {
    const copy = clone(backup);
    mutate(copy.tablas, copy);
    await rejects(() => importar(copy), pattern);
    assert.equal((await estado()).generacion, generation, label);
    assert.deepEqual((await exportar()).tablas, snapshot.tablas, label);
  }
  const rows = (tablas, name) => tablas[name];
  await rejected('formato', (_, copy) => (copy.formato = 'otro'));
  await rejected('versión', (_, copy) => (copy.version = 2));
  await rejected('tabla desconocida', (tablas) => (tablas['public.otra'] = []));
  await rejected('falta tabla', (tablas) => delete tablas['public.fichajes']);
  await rejected(
    'fila ajena',
    (tablas) => (rows(tablas, 'public.proyectos')[0].usuario_id = randomUUID()),
  );
  await rejected('parte huérfano', (tablas) => {
    rows(tablas, 'public.partes_horas')[0].tarea_id = randomUUID();
  });
  await rejected('nota con otra generación', (tablas) => {
    rows(tablas, 'public.notas').find((n) => n.cifrado).boveda_generacion = randomUUID();
  });
  await rejected('credencial sin bóveda', (tablas) => (tablas['public.bovedas'] = []));
  await rejected('semana mal repartida', (tablas) => {
    rows(tablas, 'public.configuraciones_semanales')[0].minutos_semanales += 1;
  });
  await rejected('zona horaria inválida', (tablas) => {
    rows(tablas, 'public.perfiles')[0].zona_horaria = 'Marte/Olympus';
  });
  await rejected('tarea viva de proyecto borrado', (tablas) => {
    rows(tablas, 'public.tareas').find((t) => t.id === t3.id).eliminado_en = null;
  });
  await rejected('intervalo futuro', (tablas) => {
    const live = rows(tablas, 'public.partes_horas').filter((h) => !h.eliminado_en);
    const entry = live.sort((a, b) => Date.parse(b.inicio_en) - Date.parse(a.inicio_en))[0];
    entry.inicio_en = '2999-01-01T00:00:00+00:00';
    entry.fin_en = '2999-01-01T01:00:00+00:00';
  });
  await rejected('sin perfil', (tablas) => (tablas['public.perfiles'] = []));
  await rejected('solape (EXCLUDE)', (tablas) => {
    const live = rows(tablas, 'public.partes_horas').filter((h) => !h.eliminado_en);
    live[1].inicio_en = live[0].inicio_en;
    live[1].fin_en = live[0].fin_en;
  });
  ok('malformed backups are rejected and leave data and generation untouched');

  // ---- dedup after restore: export open → close → restore → close again
  const open = await op('fichar_entrada', { id: randomUUID() });
  const withOpen = await exportar();
  const closeRequest = { id: open.id, version: open.version };
  await op('fichar_salida', closeRequest);
  generation = (await importar(withOpen)).generacion;
  assert.equal(
    (await admin.query('select fin_en from public.fichajes where id=$1', [open.id])).rows[0].fin_en,
    null,
  );
  await op('fichar_salida', closeRequest);
  assert.notEqual(
    (await admin.query('select fin_en from public.fichajes where id=$1', [open.id])).rows[0].fin_en,
    null,
  );
  ok('closing an attendance again after restoring it open really closes it (no stale dedup)');

  // ---- a write in flight when an import starts
  const writer = await connect();
  const importer = await connect();
  await request(
    writer,
    "select public.chambapp_operar('crear_proyecto', $1) r",
    [{ nombre: 'En vuelo' }],
    {
      path: '/rpc/chambapp_operar',
      gen: generation,
      keepOpen: true,
    },
  );
  const current = await exportar();
  let importDone = false;
  const pendingImport = importar(current, generation, importer).then((value) => {
    importDone = true;
    return value;
  });
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(importDone, false, 'import waits for the write in flight');
  await writer.query('commit');
  const afterFlight = await pendingImport;
  assert.equal(
    (await admin.query("select count(*)::int n from public.proyectos where nombre='En vuelo'"))
      .rows[0].n,
    0,
    'the restore replaced the data written before it',
  );
  await rejects(
    () => call('chambapp_operar', 'crear_proyecto', { nombre: 'Tarde' }, writer, generation),
    /GENERACION_CAMBIADA/,
  );
  generation = afterFlight.generacion;
  ok('an import waits for writes in flight; later writes of the old generation are rejected');

  // ---- two imports at once: one restores, the other gets a generation conflict
  const other = await connect();
  const both = await Promise.allSettled([
    importar(current, generation, importer),
    importar(current, generation, other),
  ]);
  assert.equal(both.filter((r) => r.status === 'fulfilled').length, 1);
  const failure = both.find((r) => r.status === 'rejected').reason;
  assert.match(`${failure.message} ${failure.code}`, /GENERACION_CAMBIADA|PT409/);
  generation = both.find((r) => r.status === 'fulfilled').value.generacion;
  ok('two concurrent imports: one restores, the other gets GENERACION_CAMBIADA (no deadlock)');

  // ---- classification and completeness
  const triggers = (
    await admin.query(`select n.nspname || '.' || c.relname || ':' || t.tgname k
      from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
      where not t.tgisinternal and n.nspname in ('public','chambapp_private','auth')
      order by 1`)
  ).rows.map((r) => r.k);
  assert.deepEqual(triggers, Object.keys(TRIGGERS).sort(), 'every trigger is classified');
  const owned = (
    await admin.query(`select n.nspname || '.' || c.relname t from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r' and n.nspname in ('public','chambapp_private')
        and (exists(select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'usuario_id'
               and not a.attisdropped)
             or c.relname in ('perfiles','dias_configuracion_semanal'))
      order by 1`)
  ).rows.map((r) => r.t);
  assert.deepEqual(
    owned,
    [...BACKUP_TABLES, ...CLEARED_TABLES].sort(),
    'every user table is backed up or cleared',
  );
  const sqlLists = (
    await admin.query('select chambapp_local.tablas_copia() a, chambapp_local.tablas_vaciadas() b')
  ).rows[0];
  assert.deepEqual(sqlLists.a, BACKUP_TABLES);
  assert.deepEqual(sqlLists.b, CLEARED_TABLES);
  ok('every trigger is classified and every user table is either restored or cleared');

  console.log(`PASS: ${count} local edition checks.`);
} finally {
  for (const c of connections) await c.end().catch(() => {});
  await postgres.stop().catch(() => {});
}
