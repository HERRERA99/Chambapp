// Smoke test of the local edition against real containers (Plan 12).
//   node tools/docker-smoke/smoke.mjs [--build] [--keep]
// Uses its own compose project (chambapp-smoke), port 47899 and volume
// (chambapp-smoke-data); never touches a real installation. --keep leaves it running.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 47899;
const BASE = `http://127.0.0.1:${PORT}`;
const env = {
  ...process.env,
  CHAMBAPP_TAG: process.env.CHAMBAPP_TAG ?? 'dev',
  CHAMBAPP_PORT: String(PORT),
  CHAMBAPP_VOLUME: 'chambapp-smoke-data',
  MSYS_NO_PATHCONV: '1',
};
const compose = (...args) =>
  execFileSync(
    'docker',
    ['compose', '-p', 'chambapp-smoke', '-f', join(root, 'docker/docker-compose.yml'), ...args],
    { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
let count = 0;
const ok = (label) => console.log(`OK ${++count}: ${label}`);

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`${BASE}/rest/v1/rpc/chambapp_copia_estado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (response.ok) return;
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('La instalación de prueba no responde.');
}

if (process.argv.includes('--build')) {
  execFileSync(
    'docker',
    [
      'compose',
      '-p',
      'chambapp-smoke',
      '-f',
      join(root, 'docker/docker-compose.yml'),
      '-f',
      join(root, 'docker/docker-compose.build.yml'),
      'build',
    ],
    { env, stdio: 'inherit' },
  );
}
compose('up', '-d');
await waitReady();

// ---- one published port, on 127.0.0.1 only
const services = compose('ps', '--format', 'json')
  .trim()
  .split(/\r?\n/)
  .map((line) => JSON.parse(line));
const list = services
  .flatMap((service) => (service.Publishers ?? []).map((p) => ({ ...p, service: service.Service })))
  .filter((p) => p.PublishedPort);
const published = JSON.stringify(list);

assert.equal(list.length, 1, published);
assert.equal(list[0].service, 'web');
assert.equal(list[0].URL, '127.0.0.1');
assert.equal(list[0].PublishedPort, PORT);
ok('only web publishes a port, 127.0.0.1:47899');

// ---- HTTP protections
const status = (path, init) => fetch(`${BASE}${path}`, init).then((r) => r.status);
assert.equal(await status('/'), 200);
assert.equal(await status('/proyectos'), 200, 'deep links fall back to the app');
assert.equal(
  await status('/rest/v1/rpc/chambapp_copia_estado', {
    method: 'POST',
    headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
    body: '{}',
  }),
  403,
);
const evilHost = spawnSync(
  'curl',
  ['-s', '-o', '/dev/null', '-w', '%{http_code}', '-H', 'Host: evil.example', `${BASE}/`],
  {
    encoding: 'utf8',
  },
);
assert.equal(evilHost.stdout, '403');
ok('foreign Origin and Host get 403');

// ---- the app's own client (supabase-js) with the generation header
let generation = null;
const db = createClient(BASE, 'chambapp-local', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: {
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (generation) headers.set('X-Chambapp-Generacion', generation);
      return fetch(input, { ...init, headers });
    },
  },
});
const rpc = async (fn, args) => {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw Object.assign(new Error(error.message), error);
  return data;
};
const op = (action, data = {}) => rpc('chambapp_operar', { p_accion: action, p_datos: data });
const state = await rpc('chambapp_copia_estado', {});
generation = state.generacion;
const profile = (await db.from('perfiles').select('*').single()).data;
await op('editar_perfil', { version: profile.version, onboarding_completado: true });
const project = await op('crear_proyecto', { nombre: `Smoke ${Date.now()}` });
const task = await op('crear_tarea', { proyecto_id: project.id, titulo: 'Probar Docker' });
const timer = await op('iniciar', { operacion_id: crypto.randomUUID(), tarea_id: task.id });
await op('detener', { operacion_id: crypto.randomUUID(), parte_id: timer.parte.id });
await op('crear_parte', {
  tarea_id: task.id,
  inicio_en: '2026-09-21T09:00:00+02:00',
  fin_en: '2026-09-21T10:00:00+02:00',
});
const fichaje = await op('fichar_entrada', { id: crypto.randomUUID() });
await op('fichar_salida', { id: fichaje.id, version: fichaje.version });
await rpc('chambapp_notas', {
  p_accion: 'guardar_nota',
  p_datos: {
    id: crypto.randomUUID(),
    titulo: 'Nota',
    contenido_md: 'Hola',
    proyecto_ids: [],
    tarea_ids: [],
  },
});
const entries = (await db.from('partes_detalle').select('id')).data;
assert.ok(entries.length >= 2);
ok('profile, projects, tasks, timer, manual entry, attendance and notes work through PostgREST');

// ---- backups and generation
const backup = await rpc('chambapp_copia_exportar', {});
assert.equal(backup.formato, 'chambapp-servidor-datos');
await op('crear_proyecto', { nombre: 'Después de la copia' });
const old = generation;
const restored = await rpc('chambapp_copia_importar', {
  p_datos: { generacion_esperada: generation, datos: backup },
});
generation = restored.generacion;
assert.notEqual(generation, old);
const again = await rpc('chambapp_copia_exportar', {});
assert.deepEqual(again.tablas, backup.tablas);
const stale = await fetch(`${BASE}/rest/v1/rpc/chambapp_operar`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Chambapp-Generacion': old },
  body: JSON.stringify({ p_accion: 'crear_proyecto', p_datos: { nombre: 'Tarde' } }),
});
assert.equal(stale.status, 409);
assert.match(await stale.text(), /GENERACION_CAMBIADA/);
ok('export → import round trip through PostgREST; stale generation gets 409');

// ---- data survives a restart; migrations are not applied twice
compose('restart');
await waitReady();
assert.deepEqual((await rpc('chambapp_copia_exportar', {})).tablas, backup.tablas);
const rerun = compose('run', '--rm', 'migrate');
assert.match(rerun, /listo \(0 migraciones nuevas\)/);
ok('data survives a restart and a second migrate applies nothing');

// ---- a migration failing half-way leaves nothing behind
const extra = mkdtempSync(join(tmpdir(), 'chambapp-migracion-'));
writeFileSync(
  join(extra, '99999999999999_falla.sql'),
  'begin;\ncreate table public.debe_desaparecer(x int);\nselect 1/0;\ncommit;\n',
);
const failed = spawnSync(
  'docker',
  [
    'compose',
    '-p',
    'chambapp-smoke',
    '-f',
    join(root, 'docker/docker-compose.yml'),
    'run',
    '--rm',
    '-e',
    'CHAMBAPP_MIGRATION_DIRS=shim supabase local prueba',
    '-v',
    `${extra}:/chambapp/migrations/prueba:ro`,
    'migrate',
  ],
  { env, encoding: 'utf8' },
);
assert.notEqual(failed.status, 0, 'the broken migration fails');
const psql = (sql) =>
  compose('exec', '-T', 'db', 'psql', '-U', 'postgres', '-d', 'chambapp', '-tAc', sql).trim();
assert.equal(psql("select to_regclass('public.debe_desaparecer') is null"), 't');
assert.equal(
  psql("select count(*) from chambapp_local.migraciones where nombre like 'prueba/%'"),
  '0',
);
ok('a migration that fails half-way leaves neither objects nor a ledger row');

// ---- resources
const stats = execFileSync(
  'docker',
  ['stats', '--no-stream', '--format', '{{.Name}} {{.MemUsage}}'],
  { encoding: 'utf8' },
)
  .split('\n')
  .filter((line) => line.startsWith('chambapp-smoke'));
const mib = (text) => {
  const [value, unit] = text.match(/([\d.]+)\s*([KMG]i?B)/).slice(1);
  return (
    Number(value) * ({ KiB: 1 / 1024, MiB: 1, GiB: 1024, kB: 1 / 1000, MB: 1, GB: 1000 }[unit] ?? 1)
  );
};
const total = stats.reduce((sum, line) => sum + mib(line.split(' ')[1]), 0);
console.log(stats.join('\n'));
console.log(`Memoria total: ${total.toFixed(1)} MiB`);
assert.ok(total < 160, `memoria en reposo ${total} MiB`);
ok(`idle memory ${total.toFixed(0)} MiB`);

if (!process.argv.includes('--keep')) compose('down', '-v');
console.log(`PASS: ${count} Docker smoke checks.`);
