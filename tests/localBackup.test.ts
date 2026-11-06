import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyImport,
  buildBackup,
  encryptBackup,
  previewImport,
  readBackup,
} from '../src/lib/local/backup.ts';
import { runLocalCommand } from '../src/lib/local/engine.ts';
import type { EngineContext, LocalAction } from '../src/lib/local/engine.ts';
import { emptySnapshot, LocalCommandError } from '../src/lib/local/types.ts';
import type { LocalSnapshot } from '../src/lib/local/types.ts';
import type { Json } from '../src/domain/models.ts';

const user = '00000000-0000-4000-8000-000000000001';
let counter = 0;
const newId = () => `30000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
const now = new Date('2026-11-06T12:00:00Z');
const ctx: EngineContext = {
  userId: user,
  now,
  profile: { zona_horaria: 'Europe/Madrid', intervalo_redondeo_minutos: 15 },
  cloudJornadas: [],
  cloudEntries: [],
  newId,
};

function apply(snapshot: LocalSnapshot, action: LocalAction, payload: Record<string, Json>) {
  const out = runLocalCommand(snapshot, action, payload, ctx);
  return { snapshot: out.snapshot, row: out.result as Record<string, any> };
}

function sample() {
  let snapshot = emptySnapshot(user);
  const project = apply(snapshot, 'crear_proyecto', { nombre: 'Kialens' });
  snapshot = project.snapshot;
  const task = apply(snapshot, 'crear_tarea', { proyecto_id: project.row.id, titulo: 'Revisar' });
  snapshot = task.snapshot;
  const entry = apply(snapshot, 'crear_parte', {
    tarea_id: task.row.id,
    inicio_en: '2026-11-06T08:00:00Z',
    fin_en: '2026-11-06T08:20:00Z',
    imputado_en_odoo: true,
  });
  return { snapshot: entry.snapshot, project: project.row, task: task.row, entry: entry.row };
}

const code = (expected: string) => (error: unknown) =>
  error instanceof LocalCommandError && error.code === expected;

test('plain backup: round trip keeps every row', async () => {
  const { snapshot } = sample();
  const file = JSON.stringify(buildBackup(snapshot, now));
  const read = await readBackup(file, user);
  assert.equal(read.kind, 'ok');
  if (read.kind !== 'ok') return;
  assert.deepEqual(read.data.proyectos, snapshot.proyectos);
  assert.deepEqual(read.data.partes, snapshot.partes);
  assert.deepEqual(read.data.imputaciones, snapshot.imputaciones);
});

test('encrypted backup: needs the password, rejects a wrong one, reads with the right one', async () => {
  const { snapshot } = sample();
  const encrypted = await encryptBackup(buildBackup(snapshot, now), 'contraseña-larga-1', 100_000);
  const file = JSON.stringify(encrypted);
  assert.ok(!file.includes('Kialens'), 'the project name must not appear in clear');
  assert.deepEqual(await readBackup(file, user), { kind: 'needs-password' });
  await assert.rejects(readBackup(file, user, 'otra-contraseña'), code('COPIA_CONTRASENA'));
  const read = await readBackup(file, user, 'contraseña-larga-1');
  assert.equal(read.kind, 'ok');
});

test('backups of another account, unknown formats and broken data are refused', async () => {
  const { snapshot, task } = sample();
  const backup = buildBackup(snapshot, now);
  const other = '00000000-0000-4000-8000-000000000002';
  await assert.rejects(readBackup(JSON.stringify(backup), other), code('COPIA_OTRA_CUENTA'));
  await assert.rejects(readBackup('no es json', user), code('COPIA_INVALIDA'));
  await assert.rejects(
    readBackup(JSON.stringify({ ...backup, version: 2 }), user),
    code('COPIA_INVALIDA'),
  );
  const orphan = structuredClone(backup);
  orphan.datos.tareas = [];
  await assert.rejects(readBackup(JSON.stringify(orphan), user), code('COPIA_INVALIDA'));
  const badRow = structuredClone(backup);
  badRow.datos.tareas = [{ ...task, estado: 'otra' }];
  await assert.rejects(readBackup(JSON.stringify(badRow), user), code('COPIA_INVALIDA'));
  const foreignRow = structuredClone(backup);
  foreignRow.datos.proyectos[0]!.usuario_id = other;
  await assert.rejects(readBackup(JSON.stringify(foreignRow), user), code('COPIA_INVALIDA'));
});

test('combine: newer version wins, ties use the later update, tombstones count', () => {
  const { snapshot, project, task } = sample();
  const file = buildBackup(snapshot, now).datos;
  // Here: the project is renamed (v2). In the file: the task is deleted (v2).
  const here = apply(snapshot, 'editar_proyecto', {
    id: project.id,
    version: 1,
    nombre: 'Aquí',
  }).snapshot;
  const there = apply(snapshot, 'eliminar_tarea', {
    id: task.id,
    version: 1,
    confirmar_cascada: true,
  }).snapshot;
  const incoming = buildBackup(there, now).datos;
  const preview = previewImport(here, incoming, new Set());
  assert.equal(preview.nuevos, 0);
  assert.ok(preview.masRecientesEnArchivo >= 1);
  assert.ok(preview.eliminadosEnArchivo >= 1);
  const merged = applyImport(here, incoming, 'combinar', new Set(), [], now);
  assert.equal(merged.proyectos[0]!.nombre, 'Aquí', 'local newer project stays');
  assert.notEqual(merged.tareas[0]!.eliminado_en, null, 'the deletion from the file wins');
  assert.equal(merged.meta.cambios_desde_copia, true);
  void file;
});

test('replace keeps only the file; records already in the cloud are skipped', () => {
  const { snapshot, project } = sample();
  const other = apply(emptySnapshot(user), 'crear_proyecto', { nombre: 'Otro' }).snapshot;
  const incoming = buildBackup(other, now).datos;
  const replaced = applyImport(snapshot, incoming, 'reemplazar', new Set(), [], now);
  assert.deepEqual(
    replaced.proyectos.map((row) => row.nombre),
    ['Otro'],
  );
  assert.equal(replaced.partes.length, 0);
  const own = buildBackup(snapshot, now).datos;
  const preview = previewImport(emptySnapshot(user), own, new Set([project.id]));
  assert.equal(preview.enLaNube, 3, 'the project and its task and entry');
  const skipped = applyImport(emptySnapshot(user), own, 'combinar', new Set([project.id]), [], now);
  assert.equal(skipped.proyectos.length, 0);
  assert.equal(skipped.imputaciones.length, 0);
});

test('an import that would overlap entries or leave two timers is refused', () => {
  const { snapshot } = sample();
  const incoming = buildBackup(snapshot, now).datos;
  assert.throws(
    () =>
      applyImport(
        emptySnapshot(user),
        incoming,
        'combinar',
        new Set(),
        [{ id: newId(), inicio_en: '2026-11-06T08:10:00Z', fin_en: '2026-11-06T08:30:00Z' }],
        now,
      ),
    code('PARTES_SOLAPADOS'),
  );
  const running = structuredClone(incoming);
  running.partes[0]!.fin_en = null;
  assert.throws(
    () =>
      applyImport(
        emptySnapshot(user),
        running,
        'combinar',
        new Set(),
        [{ id: newId(), inicio_en: '2026-11-06T11:00:00Z', fin_en: null }],
        now,
      ),
    code('CRONOMETRO_ACTIVO'),
  );
});
