import assert from 'node:assert/strict';
import test from 'node:test';
import { createCommandRouter } from '../src/lib/local/router.ts';
import type { CloudView, LocalAccess, LocalState, StorageMode } from '../src/lib/local/router.ts';
import { emptySnapshot } from '../src/lib/local/types.ts';
import type { LocalSnapshot } from '../src/lib/local/types.ts';
import { DataError } from '../src/lib/supabase/errors.ts';
import type { CommandAction, Json } from '../src/domain/models.ts';

const user = '00000000-0000-4000-8000-000000000001';
let counter = 0;
const newId = () => `40000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;
const cloudProject = '50000000-0000-4000-8000-000000000001';
const cloudTask = '50000000-0000-4000-8000-000000000002';
const cloudEntry = '50000000-0000-4000-8000-000000000003';

function harness(state: LocalState = 'sin-datos', mode: StorageMode = 'local') {
  const calls: { action: CommandAction; payload: Record<string, Json | undefined> }[] = [];
  let snapshot: LocalSnapshot | null =
    state === 'abierto' || state === 'sin-datos' ? emptySnapshot(user) : null;
  const view: CloudView = {
    projectIds: new Set([cloudProject]),
    taskIds: new Set([cloudTask]),
    entries: [
      {
        id: cloudEntry,
        tarea_id: cloudTask,
        inicio_en: '2026-11-06T07:00:00Z',
        fin_en: '2026-11-06T07:30:00Z',
      },
    ],
    imputationIds: new Set(),
    jornadas: [],
  };
  const access = (): LocalAccess => ({
    state: snapshot && snapshot.proyectos.length ? 'abierto' : state,
    snapshot,
    mutate: async (change) => {
      if (!snapshot) throw new Error('closed');
      const out = change(snapshot);
      snapshot = out.snapshot;
      return out.result;
    },
  });
  let currentMode = mode;
  const route = createCommandRouter({
    userId: user,
    cloud: async (action, payload) => {
      calls.push({ action, payload });
      if (action === 'consultar_cronometro')
        return { parte: null, hora_servidor: '2026-11-06T12:00:00Z' };
      return { id: newId(), version: 1, ok: true };
    },
    local: access,
    cloudView: () => view,
    mode: () => currentMode,
    profile: () => ({ zona_horaria: 'Europe/Madrid', intervalo_redondeo_minutos: 15 }),
    now: () => new Date('2026-11-06T12:00:00Z'),
    newId,
  });
  return {
    route,
    calls,
    view,
    snapshot: () => snapshot!,
    setMode: (value: StorageMode) => {
      currentMode = value;
    },
  };
}

const failsWith = (code: string) => (error: unknown) =>
  error instanceof DataError && error.code === code;

test('new projects go where the mode says (or to an explicit destination)', async () => {
  const h = harness('sin-datos', 'local');
  const local = (await h.route('crear_proyecto', { nombre: 'Local' })) as { id: string };
  assert.equal(h.snapshot().proyectos[0]!.id, local.id);
  assert.equal(h.calls.length, 0);
  h.setMode('nube');
  await h.route('crear_proyecto', { nombre: 'Nube' });
  assert.equal(h.calls.at(-1)!.action, 'crear_proyecto');
  await h.route('crear_proyecto', { nombre: 'Explícito', destino: 'local' });
  assert.equal(h.snapshot().proyectos.length, 2);
  await h.route('crear_proyecto', { nombre: 'A la nube', destino: 'nube' });
  assert.equal(h.calls.at(-1)!.payload.destino, undefined, 'destino never reaches Supabase');
});

test('tasks and entries follow their project; other actions stay in the cloud', async () => {
  const h = harness('sin-datos', 'local');
  const project = (await h.route('crear_proyecto', { nombre: 'Local' })) as { id: string };
  const task = (await h.route('crear_tarea', { proyecto_id: project.id, titulo: 'T' })) as {
    id: string;
  };
  await h.route('crear_parte', {
    tarea_id: task.id,
    inicio_en: '2026-11-06T08:00:00Z',
    fin_en: '2026-11-06T08:30:00Z',
  });
  assert.equal(h.snapshot().partes.length, 1);
  await h.route('crear_tarea', { proyecto_id: cloudProject, titulo: 'Nube' });
  await h.route('guardar_ausencia', { id: newId() });
  assert.deepEqual(
    h.calls.map((call) => call.action),
    ['crear_tarea', 'guardar_ausencia'],
  );
});

test('local data closed: writes to local ids are refused, cloud ids still work', async () => {
  const h = harness('bloqueado', 'local');
  const unknown = '60000000-0000-4000-8000-000000000001';
  await assert.rejects(
    h.route('editar_proyecto', { id: unknown, version: 1 }),
    failsWith('DATOS_LOCALES_BLOQUEADOS'),
  );
  await assert.rejects(
    h.route('crear_proyecto', { nombre: 'X' }),
    failsWith('DATOS_LOCALES_BLOQUEADOS'),
  );
  await h.route('editar_proyecto', { id: cloudProject, version: 1 });
  assert.equal(h.calls.length, 1);
  // Without any local data (nothing to protect), unknown ids go to the cloud.
  const empty = harness('sin-clave', 'nube');
  await empty.route('editar_proyecto', { id: unknown, version: 1 });
  assert.equal(empty.calls.length, 1);
});

test('one timeline: a cloud write may not overlap a local entry nor start a second timer', async () => {
  const h = harness('sin-datos', 'local');
  const project = (await h.route('crear_proyecto', { nombre: 'Local' })) as { id: string };
  const task = (await h.route('crear_tarea', { proyecto_id: project.id, titulo: 'T' })) as {
    id: string;
  };
  await h.route('crear_parte', {
    tarea_id: task.id,
    inicio_en: '2026-11-06T08:00:00Z',
    fin_en: '2026-11-06T08:30:00Z',
  });
  await assert.rejects(
    h.route('crear_parte', {
      tarea_id: cloudTask,
      inicio_en: '2026-11-06T08:15:00Z',
      fin_en: '2026-11-06T08:45:00Z',
    }),
    failsWith('PARTES_SOLAPADOS'),
  );
  await assert.rejects(
    h.route('editar_parte', { id: cloudEntry, version: 1, fin_en: '2026-11-06T08:10:00Z' }),
    failsWith('PARTES_SOLAPADOS'),
  );
  // And the local engine checks the cloud entries.
  await assert.rejects(
    h.route('crear_parte', {
      tarea_id: task.id,
      inicio_en: '2026-11-06T07:10:00Z',
      fin_en: '2026-11-06T07:20:00Z',
    }),
    failsWith('PARTES_SOLAPADOS'),
  );
  const started = (await h.route('iniciar', {
    operacion_id: newId(),
    tarea_id: task.id,
  })) as Record<string, any>;
  assert.equal(started.ok, true);
  const cloudStart = (await h.route('iniciar', {
    operacion_id: newId(),
    tarea_id: cloudTask,
  })) as Record<string, any>;
  assert.deepEqual([cloudStart.ok, cloudStart.codigo], [false, 'CRONOMETRO_ACTIVO']);
  const timer = (await h.route('consultar_cronometro')) as Record<string, any>;
  assert.equal(timer.parte.id, started.parte.id, 'the running local timer is reported');
  assert.equal(h.calls.filter((call) => call.action === 'iniciar').length, 0);
});

test('imputing entries from both stores at once is refused; local errors keep their code', async () => {
  const h = harness('sin-datos', 'local');
  const project = (await h.route('crear_proyecto', { nombre: 'Local' })) as { id: string };
  const task = (await h.route('crear_tarea', { proyecto_id: project.id, titulo: 'T' })) as {
    id: string;
  };
  const entry = (await h.route('crear_parte', {
    tarea_id: task.id,
    inicio_en: '2026-11-06T09:00:00Z',
    fin_en: '2026-11-06T09:30:00Z',
  })) as { id: string };
  await assert.rejects(
    h.route('imputar_partes', {
      partes: [
        { id: entry.id, version: 1 },
        { id: cloudEntry, version: 1 },
      ],
    }),
    failsWith('PARTES_DE_DISTINTO_GRUPO'),
  );
  await assert.rejects(
    h.route('editar_proyecto', { id: project.id, version: 7, nombre: 'X' }),
    failsWith('CONFLICTO_VERSION'),
  );
  const zone = await h
    .route('editar_tarea', { id: task.id, version: 1, proyecto_id: cloudProject })
    .catch((error) => error);
  assert.ok(zone instanceof DataError && zone.code === 'MOVER_ENTRE_ALMACENES');
  assert.match(zone.message, /Mover proyecto/);
});

test('closed local data is a temporary error: pending timer intents are kept', async () => {
  const h = harness('bloqueado', 'local');
  const error = await h
    .route('iniciar', { operacion_id: newId(), tarea_id: '60000000-0000-4000-8000-000000000009' })
    .catch((cause) => cause);
  assert.ok(error instanceof DataError && error.code === 'DATOS_LOCALES_BLOQUEADOS');
  assert.equal(error.retryable, true);
});
