import type { WorkspaceData, Json } from '../../src/domain/models';
export const uid = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
export const now = '2026-10-02T16:00:00Z';
const owned = { usuario_id: uid, creado_en: now, actualizado_en: now, version: 1 };
export let data: WorkspaceData = {
  profile: { id: uid, nombre: 'Prueba local', zona_horaria: 'Europe/Madrid', intervalo_redondeo_minutos: 60,
    modo_redondeo: 'superior', onboarding_completado: true, preferencias: {}, creado_en: now, actualizado_en: now, version: 1 },
  projects: [{ ...owned, id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', nombre: 'Proyecto de prueba', descripcion: null,
    cliente: 'Demo', presupuesto_minutos: null, archivado_en: null, eliminado_en: null }],
  tasks: [{ ...owned, id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc', proyecto_id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
    titulo: 'Tarea de prueba', descripcion: null, estado: 'pendiente', estimacion_minutos: null,
    odoo_id: 'T443212', odoo_url: 'https://example.com/odoo/tasks/443212', archivado_en: null, eliminado_en: null }],
  entries: [{ ...owned, id: 'dddddddd-dddd-4ddd-dddd-dddddddddddd', tarea_id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
    jornada_id: 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee', proyecto_id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
    inicio_en: '2026-10-02T07:07:12.125Z', fin_en: '2026-10-02T08:08:13.375Z',
    intervalo_redondeo_minutos: 60, modo_redondeo: 'superior', descripcion: 'Parte de prueba', eliminado_en: null,
    odoo_id: 'T443212', odoo_url: 'https://example.com/odoo/tasks/443212', fecha: '2026-10-02', zona_horaria: 'Europe/Madrid',
    inicio_imputado_en: '2026-10-02T07:07:12.125Z', fin_imputado_en: '2026-10-02T08:08:13.375Z',
    duracion_real_segundos: 3661.25, duracion_imputada_segundos: 7200, imputado_en_odoo: false }],
  configurations: [], days: [], jornadas: [{ ...owned, id: 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee', fecha: '2026-10-02',
    zona_horaria: 'Europe/Madrid', configuracion_id: null, minutos_objetivo: 480, notas: null }],
  fichajes: [
    { ...owned, id: 'ffffffff-ffff-4fff-ffff-fffffffffff1', jornada_id: 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee',
      inicio_en: '2026-10-02T07:00:00Z', fin_en: '2026-10-02T11:00:00Z', eliminado_en: null,
      fecha: '2026-10-02', zona_horaria: 'Europe/Madrid', duracion_segundos: 14400 },
    { ...owned, id: 'ffffffff-ffff-4fff-ffff-fffffffffff2', jornada_id: 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee',
      inicio_en: '2026-10-02T13:00:00Z', fin_en: null, eliminado_en: null,
      fecha: '2026-10-02', zona_horaria: 'Europe/Madrid', duracion_segundos: null },
  ], absences: [], serverTime: now, receivedAt: Date.now(),
};
export const operations: { action: string; payload: Record<string, Json | undefined> }[] = [];
export async function executeCommand(action: string, payload: Record<string, Json | undefined>) {
  operations.push({ action, payload });
  if (action !== 'editar_parte' && action !== 'crear_parte') throw new Error('Operación fuera de esta prueba.');
  const previous = data.entries.find(entry => entry.id === payload.id);
  if (previous && previous.version !== payload.version) throw new Error('Conflicto de versión de prueba.');
  const base = previous ?? data.entries[0]!;
  const start = String(payload.inicio_en ?? base.inicio_en);
  const end = String(payload.fin_en ?? base.fin_en);
  const real = (Date.parse(end) - Date.parse(start)) / 1000;
  const entry = { ...base, ...payload, id: previous?.id ?? crypto.randomUUID(), version: (previous?.version ?? 0) + 1,
    inicio_en: start, fin_en: end, inicio_imputado_en: start, fin_imputado_en: end,
    imputado_en_odoo: typeof payload.imputado_en_odoo === 'boolean' ? payload.imputado_en_odoo : base.imputado_en_odoo,
    duracion_real_segundos: real, duracion_imputada_segundos: Math.ceil(real / 3600) * 3600,
  } as typeof base;
  data = { ...data, entries: [...data.entries.filter(item => item.id !== entry.id), entry] };
  window.dispatchEvent(new Event('chambapp-smoke-workspace'));
  return entry;
}
