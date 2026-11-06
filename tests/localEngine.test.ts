import assert from 'node:assert/strict';
import test from 'node:test';
import { entriesView, runLocalCommand } from '../src/lib/local/engine.ts';
import type { CloudInterval, EngineContext, LocalAction } from '../src/lib/local/engine.ts';
import { emptySnapshot, LocalCommandError } from '../src/lib/local/types.ts';
import type { LocalSnapshot } from '../src/lib/local/types.ts';
import { isValidCommandResponse } from '../src/lib/supabase/commandValidation.ts';
import type { Json } from '../src/domain/models.ts';

const user = '00000000-0000-4000-8000-000000000001';
let counter = 0;
const newId = () => `10000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

type World = {
  snapshot: LocalSnapshot;
  now: Date;
  cloudEntries: CloudInterval[];
  cloudJornadas: { id: string; fecha: string; zona_horaria: string }[];
  interval: number;
};

function world(): World {
  return {
    snapshot: emptySnapshot(user),
    now: new Date('2026-11-06T12:00:00Z'),
    cloudEntries: [],
    cloudJornadas: [],
    interval: 15,
  };
}

function context(w: World): EngineContext {
  return {
    userId: user,
    now: w.now,
    profile: { zona_horaria: 'Europe/Madrid', intervalo_redondeo_minutos: w.interval },
    cloudJornadas: w.cloudJornadas,
    cloudEntries: w.cloudEntries,
    newId,
  };
}

type Payload = { [key: string]: Json | undefined };

/** Runs a command, keeps the new snapshot and checks the reply like a cloud reply. */
function run(w: World, action: LocalAction, payload: Payload = {}) {
  const before = structuredClone(w.snapshot);
  const { snapshot, result } = runLocalCommand(w.snapshot, action, payload, context(w));
  assert.deepEqual(w.snapshot, before, 'the input snapshot must not change');
  assert.ok(
    isValidCommandResponse(action, payload, result),
    `${action} reply must pass the cloud validator: ${JSON.stringify(result)}`,
  );
  w.snapshot = snapshot;
  return result as Record<string, any>;
}

function rejects(w: World, action: LocalAction, payload: Payload, code: string) {
  assert.throws(
    () => runLocalCommand(w.snapshot, action, payload, context(w)),
    (error: unknown) => error instanceof LocalCommandError && error.code.startsWith(code),
    `${action} should fail with ${code}`,
  );
}

function setup() {
  const w = world();
  const project = run(w, 'crear_proyecto', { nombre: 'Kialens', cliente: 'ACME' });
  const task = run(w, 'crear_tarea', { proyecto_id: project.id, titulo: 'Revisar' });
  return { w, project, task };
}

test('projects: create, edit with version, archive, validation', () => {
  const w = world();
  const project = run(w, 'crear_proyecto', { nombre: 'Kialens', presupuesto_minutos: 120 });
  assert.equal(project.version, 1);
  assert.equal(project.archivado_en, null);
  rejects(w, 'crear_proyecto', { nombre: '   ' }, 'DATOS_INVALIDOS');
  rejects(w, 'crear_proyecto', { nombre: 'x'.repeat(201) }, 'DATOS_INVALIDOS');
  rejects(w, 'crear_proyecto', { nombre: 'A', presupuesto_minutos: -1 }, 'DATOS_INVALIDOS');
  rejects(w, 'editar_proyecto', { id: project.id, version: 9, nombre: 'B' }, 'CONFLICTO_VERSION');
  const edited = run(w, 'editar_proyecto', { id: project.id, version: 1, archivado: true });
  assert.equal(edited.version, 2);
  assert.equal(edited.nombre, 'Kialens');
  assert.equal(edited.archivado_en, w.now.toISOString());
  rejects(w, 'crear_tarea', { proyecto_id: project.id, titulo: 'T' }, 'PROYECTO_NO_DISPONIBLE');
  const restored = run(w, 'editar_proyecto', { id: project.id, version: 2, archivado: false });
  assert.equal(restored.archivado_en, null);
});

test('tasks: Odoo fields, states and parent rules', () => {
  const { w, project, task } = setup();
  assert.equal(task.estado, 'pendiente');
  rejects(
    w,
    'crear_tarea',
    { proyecto_id: project.id, titulo: 'T', estado: 'x' },
    'DATOS_INVALIDOS',
  );
  rejects(
    w,
    'crear_tarea',
    { proyecto_id: project.id, titulo: 'T', odoo_id: 'X12' },
    'tareas_odoo_id_formato',
  );
  rejects(
    w,
    'crear_tarea',
    { proyecto_id: project.id, titulo: 'T', odoo_url: 'ftp://x' },
    'tareas_odoo_url_formato',
  );
  const odoo = run(w, 'crear_tarea', {
    proyecto_id: project.id,
    titulo: 'Odoo',
    odoo_id: 'T457973',
    odoo_url: 'https://empresa.odoo.com/odoo/project/1/tasks/9',
  });
  assert.equal(odoo.odoo_id, 'T457973');
  const other = '20000000-0000-4000-8000-000000000001';
  rejects(
    w,
    'editar_tarea',
    { id: task.id, version: 1, proyecto_id: other },
    'MOVER_ENTRE_ALMACENES',
  );
  rejects(w, 'crear_tarea', { proyecto_id: other, titulo: 'T' }, 'PROYECTO_NO_DISPONIBLE');
});

test('entries: create, derived view, rounding and future/overlap rules', () => {
  const { w, task, project } = setup();
  const entry = run(w, 'crear_parte', {
    tarea_id: task.id,
    inicio_en: '2026-11-06T08:00:00Z',
    fin_en: '2026-11-06T08:20:00Z',
    descripcion: 'Análisis',
  });
  assert.equal(entry.fecha, '2026-11-06');
  assert.equal(entry.zona_horaria, 'Europe/Madrid');
  assert.equal(entry.intervalo_redondeo_minutos, 15);
  const [view] = entriesView(w.snapshot);
  assert.equal(view!.proyecto_id, project.id);
  assert.equal(view!.duracion_real_segundos, 1200);
  assert.equal(view!.duracion_imputada_segundos, 1800);
  // Exact interval (0): no rounding.
  w.interval = 0;
  run(w, 'crear_parte', {
    tarea_id: task.id,
    inicio_en: '2026-11-06T09:00:00Z',
    fin_en: '2026-11-06T09:00:30Z',
  });
  assert.equal(entriesView(w.snapshot)[1]!.duracion_imputada_segundos, 30);
  // Overlap with a local entry, with a cloud entry, future and inverted intervals.
  const overlap = {
    tarea_id: task.id,
    inicio_en: '2026-11-06T08:10:00Z',
    fin_en: '2026-11-06T08:30:00Z',
  };
  rejects(w, 'crear_parte', overlap, 'PARTES_SOLAPADOS');
  w.cloudEntries.push({
    id: newId(),
    inicio_en: '2026-11-06T10:00:00Z',
    fin_en: '2026-11-06T11:00:00Z',
  });
  rejects(
    w,
    'crear_parte',
    { tarea_id: task.id, inicio_en: '2026-11-06T10:30:00Z', fin_en: '2026-11-06T10:45:00Z' },
    'PARTES_SOLAPADOS',
  );
  // Touching ends do not overlap ('[)').
  run(w, 'crear_parte', {
    tarea_id: task.id,
    inicio_en: '2026-11-06T11:00:00Z',
    fin_en: '2026-11-06T11:15:00Z',
  });
  rejects(
    w,
    'crear_parte',
    { tarea_id: task.id, inicio_en: '2026-11-06T11:50:00Z', fin_en: '2026-11-06T12:10:00Z' },
    'INTERVALO_REAL_FUTURO',
  );
  rejects(
    w,
    'crear_parte',
    { tarea_id: task.id, inicio_en: '2026-11-06T07:00:00Z', fin_en: '2026-11-06T06:00:00Z' },
    'FECHA_INICIO_INVALIDA',
  );
  rejects(
    w,
    'crear_parte',
    { tarea_id: task.id, inicio_en: '2026-11-06T07:00:00Z' },
    'INTERVALO_COMPLETO_REQUERIDO',
  );
});

test('entries: the day follows the profile zone and an existing cloud workday', () => {
  const { w, task } = setup();
  // 23:30 UTC on the 5th is the 6th in Madrid.
  const late = run(w, 'crear_parte', {
    tarea_id: task.id,
    inicio_en: '2026-11-05T23:30:00Z',
    fin_en: '2026-11-05T23:45:00Z',
  });
  assert.equal(late.fecha, '2026-11-06');
  const local = w.snapshot.jornadas_locales['2026-11-06']!;
  assert.equal(late.jornada_id, local.id);
  const cloudDay = { id: newId(), fecha: '2026-11-04', zona_horaria: 'America/New_York' };
  w.cloudJornadas.push(cloudDay);
  const onCloudDay = run(w, 'crear_parte', {
    tarea_id: task.id,
    inicio_en: '2026-11-04T10:00:00Z',
    fin_en: '2026-11-04T10:15:00Z',
  });
  assert.equal(onCloudDay.jornada_id, cloudDay.id);
  assert.equal(onCloudDay.zona_horaria, 'America/New_York');
  // Moving it to a day whose workday has another zone needs confirmation.
  rejects(
    w,
    'editar_parte',
    {
      id: onCloudDay.id,
      version: 1,
      inicio_en: '2026-11-06T10:00:00Z',
      fin_en: '2026-11-06T10:15:00Z',
    },
    'CONFIRMAR_CAMBIO_ZONA:Europe/Madrid',
  );
  const moved = run(w, 'editar_parte', {
    id: onCloudDay.id,
    version: 1,
    inicio_en: '2026-11-06T10:00:00Z',
    fin_en: '2026-11-06T10:15:00Z',
    confirmar_zona: 'Europe/Madrid',
  });
  assert.equal(moved.fecha, '2026-11-06');
  assert.equal(moved.jornada_id, local.id);
  assert.equal(moved.version, 2);
});

test('timer: start, idempotency, one timer across stores, stop and no reopening', () => {
  const { w, task } = setup();
  const op = newId();
  const started = run(w, 'iniciar', { operacion_id: op, tarea_id: task.id });
  assert.equal(started.ok, true);
  assert.equal(started.parte.fin_en, null);
  // Same operation again returns the same result; reused with other data fails.
  const again = run(w, 'iniciar', { operacion_id: op, tarea_id: task.id });
  assert.deepEqual(again, started);
  rejects(
    w,
    'iniciar',
    { operacion_id: op, tarea_id: task.id, descripcion: 'x' },
    'OPERACION_ID_REUTILIZADO',
  );
  const second = run(w, 'iniciar', { operacion_id: newId(), tarea_id: task.id });
  assert.deepEqual([second.ok, second.codigo], [false, 'CRONOMETRO_ACTIVO']);
  const timer = run(w, 'consultar_cronometro');
  assert.equal(timer.parte.id, started.parte.id);
  const lookup = run(w, 'consultar_operacion', { operacion_id: op });
  assert.equal(lookup.encontrada, true);
  assert.equal(lookup.parte_actual.id, started.parte.id);
  w.now = new Date('2026-11-06T12:10:00Z');
  const stopOp = newId();
  const stopped = run(w, 'detener', { operacion_id: stopOp, parte_id: started.parte.id });
  assert.equal(stopped.parte.fin_en, '2026-11-06T12:10:00.000Z');
  assert.equal(stopped.parte.version, 2);
  rejects(
    w,
    'editar_parte',
    { id: started.parte.id, version: 2, fin_en: null },
    'NO_REABRIR_PARTE',
  );
  rejects(
    w,
    'iniciar',
    { operacion_id: newId(), tarea_id: task.id, inicio_en: '2026-11-06T12:00' },
    'ZONA_HORARIA_REQUERIDA',
  );
  // A running cloud timer blocks a local start.
  w.cloudEntries.push({ id: newId(), inicio_en: '2026-11-06T12:15:00Z', fin_en: null });
  w.now = new Date('2026-11-06T12:20:00Z');
  const blocked = run(w, 'iniciar', { operacion_id: newId(), tarea_id: task.id });
  assert.deepEqual([blocked.ok, blocked.codigo], [false, 'CRONOMETRO_ACTIVO']);
});

test('delete: cascade confirmation, active timer, tombstones and repeat', () => {
  const { w, project, task } = setup();
  const done = run(w, 'crear_parte', {
    tarea_id: task.id,
    inicio_en: '2026-11-06T08:00:00Z',
    fin_en: '2026-11-06T08:20:00Z',
  });
  run(w, 'iniciar', { operacion_id: newId(), tarea_id: task.id });
  rejects(w, 'eliminar_proyecto', { id: project.id, version: 1 }, 'CONFIRMACION_CASCADA_REQUERIDA');
  rejects(
    w,
    'eliminar_proyecto',
    { id: project.id, version: 1, confirmar_cascada: true },
    'DETENER_O_DESCARTAR_ACTIVO',
  );
  const deleted = run(w, 'eliminar_proyecto', {
    id: project.id,
    version: 1,
    confirmar_cascada: true,
    descartar_activo: true,
  });
  assert.equal(deleted.eliminado_en, w.now.toISOString());
  assert.equal(deleted.version, 2);
  assert.ok(w.snapshot.tareas.every((row) => row.eliminado_en !== null));
  assert.ok(w.snapshot.partes.every((row) => row.eliminado_en !== null));
  assert.equal(entriesView(w.snapshot).length, 0);
  // Deleting again returns the tombstone; editing a deleted row fails.
  const repeat = run(w, 'eliminar_proyecto', { id: project.id, version: 99 });
  assert.equal(repeat.id, project.id);
  rejects(w, 'editar_parte', { id: done.id, version: 2, descripcion: 'x' }, 'PARTE_NO_DISPONIBLE');
});

test('archiving a parent with a running timer is refused', () => {
  const { w, project, task } = setup();
  run(w, 'iniciar', { operacion_id: newId(), tarea_id: task.id });
  rejects(
    w,
    'editar_proyecto',
    { id: project.id, version: 1, archivado: true },
    'HIJOS_ACTIVOS_EN_PADRE_ELIMINADO_O_ARCHIVADO',
  );
  rejects(
    w,
    'editar_tarea',
    { id: task.id, version: 1, archivado: true },
    'HIJOS_ACTIVOS_EN_PADRE_ELIMINADO_O_ARCHIVADO',
  );
});

test('imputations: group rules, undo, legacy flag and moves', () => {
  const { w, task, project } = setup();
  const a = run(w, 'crear_parte', {
    tarea_id: task.id,
    inicio_en: '2026-11-06T08:00:00Z',
    fin_en: '2026-11-06T08:20:00Z',
  });
  const b = run(w, 'crear_parte', {
    tarea_id: task.id,
    inicio_en: '2026-11-06T09:00:00Z',
    fin_en: '2026-11-06T09:20:00Z',
  });
  const otherDay = run(w, 'crear_parte', {
    tarea_id: task.id,
    inicio_en: '2026-11-05T09:00:00Z',
    fin_en: '2026-11-05T09:20:00Z',
  });
  rejects(w, 'imputar_partes', { partes: [] }, 'IMPUTACION_DATOS_INVALIDOS');
  rejects(
    w,
    'imputar_partes',
    {
      partes: [
        { id: a.id, version: 1 },
        { id: a.id, version: 1 },
      ],
    },
    'IMPUTACION_DATOS_INVALIDOS',
  );
  rejects(w, 'imputar_partes', { partes: [{ id: a.id, version: 2 }] }, 'CONFLICTO_VERSION');
  rejects(
    w,
    'imputar_partes',
    {
      partes: [
        { id: a.id, version: 1 },
        { id: otherDay.id, version: 1 },
      ],
    },
    'PARTES_DE_DISTINTO_GRUPO',
  );
  const imputed = run(w, 'imputar_partes', {
    partes: [
      { id: b.id, version: 1 },
      { id: a.id, version: 1 },
    ],
  });
  assert.deepEqual(
    imputed.partes.map((row: { id: string }) => row.id),
    [a.id, b.id],
  );
  rejects(w, 'imputar_partes', { partes: [{ id: a.id, version: 2 }] }, 'PARTE_YA_IMPUTADO');
  const undone = run(w, 'deshacer_imputacion', { id: imputed.id });
  assert.equal(undone.partes.length, 2);
  assert.equal(w.snapshot.imputaciones.length, 0);
  rejects(w, 'deshacer_imputacion', { id: imputed.id }, 'IMPUTACION_NO_DISPONIBLE');
  // Legacy flag on create and edit; a marked entry moved to another day gets its own imputation.
  const legacy = run(w, 'crear_parte', {
    tarea_id: task.id,
    inicio_en: '2026-11-04T08:00:00Z',
    fin_en: '2026-11-04T08:20:00Z',
    imputado_en_odoo: true,
  });
  assert.equal(legacy.imputado_en_odoo, true);
  const firstImputation = legacy.imputacion_odoo_id;
  const moved = run(w, 'editar_parte', {
    id: legacy.id,
    version: 1,
    inicio_en: '2026-11-03T08:00:00Z',
    fin_en: '2026-11-03T08:20:00Z',
  });
  assert.notEqual(moved.imputacion_odoo_id, firstImputation);
  assert.equal(w.snapshot.imputaciones.length, 1, 'the unused imputation is removed');
  const unmarked = run(w, 'editar_parte', { id: legacy.id, version: 2, imputado_en_odoo: false });
  assert.equal(unmarked.imputacion_odoo_id, null);
  assert.equal(w.snapshot.imputaciones.length, 0);
  rejects(
    w,
    'crear_parte',
    {
      tarea_id: task.id,
      inicio_en: '2026-11-02T08:00:00Z',
      fin_en: '2026-11-02T08:20:00Z',
      imputado_en_odoo: 'si',
    },
    'IMPUTACION_ODOO_INVALIDA',
  );
  // A running entry cannot be imputed.
  const running = run(w, 'iniciar', { operacion_id: newId(), tarea_id: task.id });
  rejects(
    w,
    'imputar_partes',
    { partes: [{ id: running.parte.id, version: 1 }] },
    'PARTE_EN_CURSO',
  );
  void project;
});

test('snapshot meta marks changes since the last backup; reads do not', () => {
  const w = world();
  const before = w.snapshot;
  run(w, 'consultar_cronometro');
  assert.equal(w.snapshot, before);
  run(w, 'crear_proyecto', { nombre: 'A' });
  assert.equal(w.snapshot.meta.cambios_desde_copia, true);
  assert.equal(w.snapshot.meta.actualizado_en, w.now.toISOString());
});

test('another account cannot run commands on this snapshot', () => {
  const w = world();
  w.snapshot = emptySnapshot('00000000-0000-4000-8000-000000000999');
  rejects(w, 'crear_proyecto', { nombre: 'A' }, 'SESION_REQUERIDA');
});
