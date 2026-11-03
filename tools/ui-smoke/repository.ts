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
// Extra tasks and a full current week of entries for /tareas and /parte-semanal.
const extraTasks: WorkspaceData['tasks'] = [
  [
    'ccccccc3',
    'Migrar facturación al nuevo ERP y validar los asientos contables del cierre mensual',
    'en_curso',
    'T512004',
    null,
  ],
  ['ccccccc4', 'Preparar demo del portal', 'pendiente', null, null],
  ['ccccccc5', 'Corregir exportación CSV', 'completada', 'T498120', null],
  ['ccccccc6', 'Prototipo descartado', 'pendiente', null, now],
  // Enough completed tasks to paginate the archive view (15 per page).
  ...Array.from({ length: 22 }, (_, index) => [
    `cccccc${String(index + 10).padStart(2, '0')}`,
    index === 0
      ? 'Revisión completa de la integración contable con el ERP corporativo y conciliación de facturas de proveedores'
      : `Tarea finalizada ${index + 1}`,
    'completada',
    index % 3 === 0 ? `T7${String(index).padStart(5, '0')}` : null,
    null,
  ]),
].map(([suffix, titulo, estado, odoo_id, archivado_en]) => ({
  ...owned,
  id: `cccccccc-cccc-4ccc-cccc-${String(suffix).padStart(12, 'c')}`,
  proyecto_id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
  titulo: String(titulo),
  descripcion: null,
  estado: estado as 'pendiente' | 'en_curso' | 'completada',
  estimacion_minutos: 240,
  odoo_id: odoo_id as string | null,
  odoo_url: null,
  archivado_en: archivado_en as string | null,
  eliminado_en: null,
}));
function weekEntries(): WorkspaceData['entries'] {
  const today = new Date();
  const monday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const taskIds = [
    'cccccccc-cccc-4ccc-cccc-cccccccccccc',
    'cccccccc-cccc-4ccc-cccc-ccccccccccc2',
    'cccccccc-cccc-4ccc-cccc-ccccccccccc3',
    'cccccccc-cccc-4ccc-cccc-ccccccccccc4',
  ];
  const entries: WorkspaceData['entries'] = [];
  for (let day = 0; day < 5; day++) {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + day);
    const fecha = date.toISOString().slice(0, 10);
    const slots =
      day === 2
        ? [
            [7, 9.5],
            [10, 11],
            [11.25, 13],
            [14, 15.4],
            [15.5, 17],
          ]
        : [
            [7, 9.25],
            [9.5, 12],
            [13, 16.1],
          ];
    slots.forEach(([from, to], index) => {
      const start = new Date(date.getTime() + from! * 3600_000).toISOString();
      const end = new Date(date.getTime() + to! * 3600_000).toISOString();
      const real = (to! - from!) * 3600;
      const open = day === 4 && index === slots.length - 1;
      entries.push({
        ...owned,
        id: `dddddddd-dddd-4ddd-dddd-${String(day * 10 + index).padStart(12, '0')}`,
        tarea_id: taskIds[(day + index) % taskIds.length]!,
        jornada_id: 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee',
        proyecto_id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
        inicio_en: start,
        fin_en: open ? null : end,
        intervalo_redondeo_minutos: 15,
        modo_redondeo: 'superior',
        descripcion: null,
        eliminado_en: null,
        odoo_id: null,
        odoo_url: null,
        fecha,
        zona_horaria: 'Europe/Madrid',
        inicio_imputado_en: start,
        fin_imputado_en: open ? null : end,
        duracion_real_segundos: open ? null : real,
        duracion_imputada_segundos: open ? null : Math.ceil(real / 900) * 900,
        imputado_en_odoo: day < 2,
      });
    });
  }
  // Saturday overnight entry: shows the weekend column and a (+1) range.
  const saturday = new Date(monday);
  saturday.setUTCDate(monday.getUTCDate() + 5);
  const satStart = new Date(saturday.getTime() + 20 * 3600_000).toISOString();
  const satEnd = new Date(saturday.getTime() + 23.5 * 3600_000).toISOString();
  entries.push({
    ...entries[0]!,
    id: 'dddddddd-dddd-4ddd-dddd-000000000099',
    fecha: saturday.toISOString().slice(0, 10),
    inicio_en: satStart,
    fin_en: satEnd,
    inicio_imputado_en: satStart,
    fin_imputado_en: satEnd,
    duracion_real_segundos: 3.5 * 3600,
    duracion_imputada_segundos: 3.5 * 3600,
    imputado_en_odoo: false,
  });
  return entries;
}
// More notes so the library paginates (8 per page); some linked to the ERP task.
const extraNotes: WorkspaceData['notes'] = Array.from({ length: 12 }, (_, index) => ({
  ...owned,
  id: `99999999-9999-4999-8999-9999999999${String(index + 10).padStart(2, '0')}`,
  titulo: index === 0 ? 'Acta de cierre contable' : `Nota de seguimiento ${index + 1}`,
  contenido_md: Array.from(
    { length: 60 },
    (_, line) =>
      `${line % 10 === 0 ? `## Sección ${line / 10 + 1}\n\n` : ''}Línea ${line + 1} de la nota ${index + 1}.`,
  ).join('\n\n'),
  proyecto_ids: [],
  tarea_ids: index < 2 ? ['cccccccc-cccc-4ccc-cccc-ccccccccccc3'] : [],
  actualizado_en: new Date(Date.parse(now) - index * 3600_000).toISOString(),
}));
data = {
  ...data,
  tasks: [
    ...data.tasks,
    ...extraTasks.map((task) =>
      task.odoo_id === 'T512004'
        ? { ...task, odoo_url: 'https://odoo.example.com/odoo/tasks/512004' }
        : task,
    ),
  ],
  entries: [...data.entries, ...weekEntries()],
  notes: [...data.notes, ...extraNotes],
};
/** Simulates a profile change made in another session (bumps its version). */
export function bumpProfileElsewhere() {
  data = { ...data, profile: { ...data.profile, version: data.profile.version + 1 } };
  window.dispatchEvent(new Event('chambapp-smoke-workspace'));
}
export const operations: { action: string; payload: Record<string, Json | undefined> }[] = [];
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
      throw new Error('El perfil ha cambiado. Recarga los datos antes de guardar.');
    const profile = {
      ...data.profile,
      ...(payload.nombre !== undefined ? { nombre: String(payload.nombre) } : {}),
      ...(payload.zona_horaria !== undefined ? { zona_horaria: String(payload.zona_horaria) } : {}),
      ...(payload.intervalo_redondeo_minutos !== undefined
        ? { intervalo_redondeo_minutos: Number(payload.intervalo_redondeo_minutos) }
        : {}),
      ...(payload.preferencias !== undefined
        ? { preferencias: payload.preferencias as typeof data.profile.preferencias }
        : {}),
      version: data.profile.version + 1,
      actualizado_en: new Date().toISOString(),
    };
    data = { ...data, profile };
    window.dispatchEvent(new Event('chambapp-smoke-workspace'));
    return profile;
  }
  if (action === 'crear_configuracion_semanal') {
    const id = crypto.randomUUID();
    const reparto = (payload.reparto ?? {}) as Record<string, number>;
    data = {
      ...data,
      configurations: [
        ...data.configurations,
        {
          id,
          usuario_id: uid,
          minutos_semanales: Number(payload.minutos_semanales),
          vigente_desde: String(payload.vigente_desde),
          creado_en: new Date().toISOString(),
        },
      ],
      days: [
        ...data.days,
        ...Object.entries(reparto).map(([day, minutes]) => ({
          configuracion_id: id,
          dia_semana: Number(day),
          minutos_objetivo: Number(minutes),
        })),
      ],
    };
    window.dispatchEvent(new Event('chambapp-smoke-workspace'));
    return { id };
  }
  if (action !== 'editar_parte' && action !== 'crear_parte')
    throw new Error('Operación fuera de esta prueba.');
  const previous = data.entries.find((entry) => entry.id === payload.id);
  if (previous && previous.version !== payload.version)
    throw new Error('Conflicto de versión de prueba.');
  const base = previous ?? data.entries[0]!;
  const start = String(payload.inicio_en ?? base.inicio_en);
  const end = String(payload.fin_en ?? base.fin_en);
  const real = (Date.parse(end) - Date.parse(start)) / 1000;
  const intervalChanged =
    !previous || payload.inicio_en !== undefined || payload.fin_en !== undefined;
  const roundTo = (base.intervalo_redondeo_minutos || 60) * 60;
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
    // Status-only edits keep the stored durations, like the database view.
    duracion_real_segundos: intervalChanged ? real : base.duracion_real_segundos,
    duracion_imputada_segundos: intervalChanged
      ? Math.ceil(real / roundTo) * roundTo
      : base.duracion_imputada_segundos,
  } as typeof base;
  data = { ...data, entries: [...data.entries.filter((item) => item.id !== entry.id), entry] };
  window.dispatchEvent(new Event('chambapp-smoke-workspace'));
  return entry;
}
