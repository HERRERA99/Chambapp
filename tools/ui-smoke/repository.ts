import type { WorkspaceData, Json, Note } from '../../src/domain/models';
export const uid = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
export const now = '2026-10-02T16:00:00Z';
const owned = { usuario_id: uid, creado_en: now, actualizado_en: now, version: 1 };
export let data: WorkspaceData = {
  profile: {
    id: uid,
    nombre: 'Prueba local',
    zona_horaria: 'Europe/Madrid',
    intervalo_redondeo_minutos: 60,
    modo_redondeo: 'superior',
    onboarding_completado: true,
    preferencias: {},
    creado_en: now,
    actualizado_en: now,
    version: 1,
  },
  projects: [
    {
      ...owned,
      id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
      nombre: 'Proyecto de prueba',
      descripcion: null,
      cliente: 'Demo',
      presupuesto_minutos: null,
      archivado_en: null,
      eliminado_en: null,
    },
    {
      ...owned,
      id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbb2',
      nombre: 'Portal de clientes',
      descripcion: null,
      cliente: 'Acme',
      presupuesto_minutos: null,
      archivado_en: null,
      eliminado_en: null,
    },
  ],
  tasks: [
    {
      ...owned,
      id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
      proyecto_id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
      titulo: 'Tarea de prueba',
      descripcion: null,
      estado: 'pendiente',
      estimacion_minutos: null,
      odoo_id: 'T443212',
      odoo_url: 'https://example.com/odoo/tasks/443212',
      archivado_en: null,
      eliminado_en: null,
    },
    {
      ...owned,
      id: 'cccccccc-cccc-4ccc-cccc-ccccccccccc2',
      proyecto_id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbb2',
      titulo: 'Revisar permisos de acceso',
      descripcion: null,
      estado: 'en_curso',
      estimacion_minutos: 120,
      odoo_id: null,
      odoo_url: null,
      archivado_en: null,
      eliminado_en: null,
    },
  ],
  notes: [
    {
      ...owned,
      id: '99999999-9999-4999-8999-999999999991',
      titulo: 'Reunión de planificación',
      contenido_md:
        '# Reunión de planificación\n\nAcuerdos para la próxima entrega del **portal de clientes**.\n\n## Próximos pasos\n\n- [x] Confirmar el alcance\n- [ ] Revisar los permisos de acceso\n- [ ] Preparar la demostración\n\n| Entrega | Responsable |\n| --- | --- |\n| Acceso al portal | Desarrollo |\n| Revisión final | Cliente |\n\n```ts\nconst entrega = { estado: "en curso" };\n```\n\n> Guardar las decisiones antes de empezar el siguiente bloque.\n\n[Referencia del proyecto](https://example.com/proyecto)\n',
      proyecto_ids: [
        'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
        'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbb2',
      ],
      tarea_ids: ['cccccccc-cccc-4ccc-cccc-cccccccccccc', 'cccccccc-cccc-4ccc-cccc-ccccccccccc2'],
    },
    {
      ...owned,
      id: '99999999-9999-4999-8999-999999999992',
      titulo: 'Ideas y recordatorios',
      contenido_md:
        '## Ideas\n\n- Simplificar la navegación.\n- Añadir ejemplos de uso.\n\nUna nota también puede guardarse sin asociaciones.\n',
      proyecto_ids: [],
      tarea_ids: [],
    },
    {
      ...owned,
      id: '99999999-9999-4999-8999-999999999993',
      titulo: 'Borrador de retrospectiva',
      contenido_md: '',
      proyecto_ids: ['bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'],
      tarea_ids: [],
    },
  ],
  entries: [
    {
      ...owned,
      id: 'dddddddd-dddd-4ddd-dddd-dddddddddddd',
      tarea_id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
      jornada_id: 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee',
      proyecto_id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
      inicio_en: '2026-10-02T07:07:12.125Z',
      fin_en: '2026-10-02T08:08:13.375Z',
      intervalo_redondeo_minutos: 60,
      modo_redondeo: 'superior',
      descripcion: 'Parte de prueba',
      eliminado_en: null,
      odoo_id: 'T443212',
      odoo_url: 'https://example.com/odoo/tasks/443212',
      fecha: '2026-10-02',
      zona_horaria: 'Europe/Madrid',
      inicio_imputado_en: '2026-10-02T07:07:12.125Z',
      fin_imputado_en: '2026-10-02T08:08:13.375Z',
      duracion_real_segundos: 3661.25,
      duracion_imputada_segundos: 7200,
      imputado_en_odoo: false,
    },
  ],
  configurations: [],
  days: [],
  jornadas: [
    {
      ...owned,
      id: 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee',
      fecha: '2026-10-02',
      zona_horaria: 'Europe/Madrid',
      configuracion_id: null,
      minutos_objetivo: 480,
      notas: null,
    },
  ],
  fichajes: [
    {
      ...owned,
      id: 'ffffffff-ffff-4fff-ffff-fffffffffff1',
      jornada_id: 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee',
      inicio_en: '2026-10-02T07:00:00Z',
      fin_en: '2026-10-02T11:00:00Z',
      eliminado_en: null,
      fecha: '2026-10-02',
      zona_horaria: 'Europe/Madrid',
      duracion_segundos: 14400,
    },
    {
      ...owned,
      id: 'ffffffff-ffff-4fff-ffff-fffffffffff2',
      jornada_id: 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee',
      inicio_en: '2026-10-02T13:00:00Z',
      fin_en: null,
      eliminado_en: null,
      fecha: '2026-10-02',
      zona_horaria: 'Europe/Madrid',
      duracion_segundos: null,
    },
  ],
  absences: [],
  serverTime: now,
  receivedAt: Date.now(),
};
export const operations: { action: string; payload: Record<string, Json | undefined> }[] = [];
const entryTemplate = data.entries[0]!;
const notify = () => window.dispatchEvent(new Event('chambapp-smoke-workspace'));

/** Synthetic scenarios for manual review: `?escenario=vacio` removes all activity. */
export function applyScenario(name: string | null) {
  if (name === 'vacio') data = { ...data, entries: [], fichajes: [] };
}

export function setFichajes(fichajes: WorkspaceData['fichajes']) {
  data = { ...data, fichajes };
  notify();
}

export function addEntry(entry: WorkspaceData['entries'][number]) {
  data = { ...data, entries: [...data.entries.filter((item) => item.id !== entry.id), entry] };
  notify();
}

export function newEntry(taskId: string, start: string): WorkspaceData['entries'][number] {
  const task = data.tasks.find((item) => item.id === taskId)!;
  return {
    ...entryTemplate,
    id: crypto.randomUUID(),
    tarea_id: taskId,
    proyecto_id: task.proyecto_id,
    odoo_id: task.odoo_id,
    odoo_url: task.odoo_url,
    inicio_en: start,
    fin_en: null,
    inicio_imputado_en: start,
    fin_imputado_en: null,
    duracion_real_segundos: null,
    duracion_imputada_segundos: null,
    descripcion: null,
    imputado_en_odoo: false,
  };
}
export async function executeCommand(action: string, payload: Record<string, Json | undefined>) {
  operations.push({ action, payload });
  if (action === 'guardar_nota' || action === 'eliminar_nota') {
    const previous = data.notes.find((note) => note.id === payload.id);
    if (action === 'eliminar_nota') {
      if (!previous) throw new Error('La nota ya no está disponible.');
      if (previous.version !== payload.version)
        throw new Error('La nota ha cambiado. Recarga los datos antes de eliminarla.');
      data = { ...data, notes: data.notes.filter((note) => note.id !== previous.id) };
      window.dispatchEvent(new Event('chambapp-smoke-workspace'));
      return previous;
    }
    const projectIds = Array.isArray(payload.proyecto_ids) ? payload.proyecto_ids.map(String) : [];
    const taskIds = Array.isArray(payload.tarea_ids) ? payload.tarea_ids.map(String) : [];
    if (
      previous &&
      payload.version === undefined &&
      previous.titulo === String(payload.titulo).trim() &&
      previous.contenido_md === payload.contenido_md &&
      JSON.stringify(previous.proyecto_ids) === JSON.stringify(projectIds) &&
      JSON.stringify(previous.tarea_ids) === JSON.stringify(taskIds)
    )
      return previous;
    if (previous && previous.version !== payload.version)
      throw new Error('La nota ha cambiado. Recarga los datos antes de guardar.');
    if (!previous && payload.version !== undefined)
      throw new Error('La nota ya no está disponible.');
    if (!payload.id || !String(payload.titulo ?? '').trim())
      throw new Error('Escribe un título para la nota.');
    if (
      projectIds.some(
        (id) => !data.projects.some((project) => project.id === id && !project.eliminado_en),
      ) ||
      taskIds.some((id) => !data.tasks.some((task) => task.id === id && !task.eliminado_en))
    ) {
      throw new Error('Una de las asociaciones ya no está disponible.');
    }
    const note: Note = {
      ...owned,
      id: String(payload.id),
      titulo: String(payload.titulo).trim(),
      contenido_md: String(payload.contenido_md ?? ''),
      proyecto_ids: projectIds,
      tarea_ids: taskIds,
      creado_en: previous?.creado_en ?? new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
      version: (previous?.version ?? 0) + 1,
    };
    data = { ...data, notes: [note, ...data.notes.filter((item) => item.id !== note.id)] };
    window.dispatchEvent(new Event('chambapp-smoke-workspace'));
    return note;
  }
  if (action === 'editar_perfil') {
    if (payload.version !== data.profile.version)
      throw new Error('El perfil ha cambiado en otra sesión.');
    await new Promise((resolve) => setTimeout(resolve, 600));
    if (payload.nombre === 'error') throw new Error('Error de prueba al guardar el perfil.');
    data = {
      ...data,
      profile: {
        ...data.profile,
        nombre: String(payload.nombre),
        zona_horaria: String(payload.zona_horaria),
        intervalo_redondeo_minutos: Number(payload.intervalo_redondeo_minutos),
        preferencias: (payload.preferencias ?? {}) as WorkspaceData['profile']['preferencias'],
        version: data.profile.version + 1,
      },
    };
    notify();
    return data.profile;
  }
  if (action === 'crear_configuracion_semanal') {
    const id = crypto.randomUUID();
    const allocation = (payload.reparto ?? {}) as Record<string, number>;
    data = {
      ...data,
      configurations: [
        ...data.configurations,
        {
          id,
          usuario_id: uid,
          minutos_semanales: Number(payload.minutos_semanales),
          vigente_desde: String(payload.vigente_desde),
          creado_en: now,
        },
      ],
      days: [
        ...data.days,
        ...Object.entries(allocation).map(([day, minutes]) => ({
          configuracion_id: id,
          dia_semana: Number(day),
          minutos_objetivo: Number(minutes),
        })),
      ],
    };
    notify();
    return { id };
  }
  if (action === 'crear_tarea') {
    const task = {
      ...data.tasks[0]!,
      id: crypto.randomUUID(),
      proyecto_id: String(payload.proyecto_id),
      titulo: String(payload.titulo),
      descripcion: (payload.descripcion as string | null) ?? null,
      estado: 'pendiente' as const,
      odoo_id: (payload.odoo_id as string | null) ?? null,
      odoo_url: (payload.odoo_url as string | null) ?? null,
      estimacion_minutos: null,
      actualizado_en: new Date().toISOString(),
    };
    data = { ...data, tasks: [...data.tasks, task] };
    notify();
    return task;
  }
  if (action !== 'editar_parte' && action !== 'crear_parte')
    throw new Error('Operación fuera de esta prueba.');
  const previous = data.entries.find((entry) => entry.id === payload.id);
  if (previous && previous.version !== payload.version)
    throw new Error('Conflicto de versión de prueba.');
  const base = previous ?? newEntry(String(payload.tarea_id ?? entryTemplate.tarea_id), now);
  const start = String(payload.inicio_en ?? base.inicio_en);
  const end = String(payload.fin_en ?? base.fin_en);
  const real = (Date.parse(end) - Date.parse(start)) / 1000;
  const entry = {
    ...base,
    ...payload,
    id: previous?.id ?? crypto.randomUUID(),
    version: (previous?.version ?? 0) + 1,
    inicio_en: start,
    fin_en: end,
    inicio_imputado_en: start,
    fin_imputado_en: end,
    imputado_en_odoo:
      typeof payload.imputado_en_odoo === 'boolean'
        ? payload.imputado_en_odoo
        : base.imputado_en_odoo,
    duracion_real_segundos: real,
    duracion_imputada_segundos: Math.ceil(real / 3600) * 3600,
  } as typeof base;
  data = { ...data, entries: [...data.entries.filter((item) => item.id !== entry.id), entry] };
  window.dispatchEvent(new Event('chambapp-smoke-workspace'));
  return entry;
}
