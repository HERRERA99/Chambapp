import type { CommandAction, Json } from '../../domain/models';

const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const identifier = (value: unknown) => typeof value === 'string' && uuid.test(value);
const timestamp = (value: unknown) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

export const isRetryableStatus = (status: number) =>
  status === 0 ||
  status === 401 ||
  status === 403 ||
  status === 408 ||
  status === 429 ||
  status >= 500;

/** RPC that runs each command action. */
export function rpcForAction(action: CommandAction) {
  if (['guardar_nota', 'eliminar_nota'].includes(action)) return 'chambapp_notas';
  if (['crear_boveda', 'cambiar_clave', 'restablecer_boveda'].includes(action))
    return 'chambapp_boveda';
  if (['guardar_credencial', 'eliminar_credencial'].includes(action))
    return 'chambapp_credenciales';
  if (['guardar_ausencia', 'eliminar_ausencia', 'sincronizar_festivos'].includes(action))
    return 'chambapp_calendario';
  if (['imputar_partes', 'deshacer_imputacion'].includes(action)) return 'chambapp_imputaciones';
  return 'chambapp_operar';
}

/** An incomplete 2xx reply must not clear a durable intent or be shown as saved. */
export function isValidCommandResponse(
  action: CommandAction,
  payload: Record<string, Json | undefined>,
  data: unknown,
): boolean {
  if (!record(data)) return false;
  if (action === 'guardar_nota' || action === 'eliminar_nota') {
    if (
      !identifier(data.id) ||
      data.id !== payload.id ||
      !identifier(data.usuario_id) ||
      !timestamp(data.creado_en) ||
      !timestamp(data.actualizado_en) ||
      typeof data.version !== 'number' ||
      !Number.isSafeInteger(data.version) ||
      data.version < 1 ||
      typeof data.titulo !== 'string' ||
      typeof data.contenido_md !== 'string' ||
      (data.cifrado == null
        ? !data.titulo.trim() || [...data.titulo].length > 200
        : typeof data.cifrado !== 'string' ||
          !identifier(data.boveda_generacion) ||
          data.titulo !== '' ||
          data.contenido_md !== '') ||
      [data.proyecto_ids, data.tarea_ids].some(
        (ids) =>
          !Array.isArray(ids) ||
          ids.length > 100 ||
          !ids.every(identifier) ||
          new Set(ids).size !== ids.length,
      )
    )
      return false;
    if (action === 'eliminar_nota') return data.version === payload.version;
    const sameIds = (actual: unknown, expected: unknown) =>
      Array.isArray(actual) &&
      Array.isArray(expected) &&
      actual.length === new Set(expected).size &&
      expected.every((id) => actual.includes(id));
    return (
      (typeof payload.cifrado === 'string'
        ? data.cifrado === payload.cifrado && data.boveda_generacion === payload.boveda_generacion
        : typeof payload.titulo === 'string' &&
          data.cifrado == null &&
          data.titulo === payload.titulo.trim() &&
          data.contenido_md === payload.contenido_md) &&
      sameIds(data.proyecto_ids, payload.proyecto_ids) &&
      sameIds(data.tarea_ids, payload.tarea_ids) &&
      (payload.version === undefined || data.version === Number(payload.version) + 1)
    );
  }
  if (action === 'crear_boveda' || action === 'cambiar_clave')
    return (
      identifier(data.usuario_id) &&
      data.generacion === payload.generacion &&
      data.sal === payload.sal &&
      data.iteraciones === payload.iteraciones &&
      data.clave_envuelta === payload.clave_envuelta &&
      typeof data.version === 'number' &&
      (action === 'crear_boveda' || data.version === Number(payload.version) + 1)
    );
  if (action === 'restablecer_boveda')
    return data.restablecida === true && data.generacion === payload.generacion;
  if (action === 'guardar_credencial' || action === 'eliminar_credencial')
    return (
      identifier(data.id) &&
      data.id === payload.id &&
      typeof data.version === 'number' &&
      Number.isSafeInteger(data.version) &&
      (action === 'eliminar_credencial'
        ? data.version === payload.version
        : data.cifrado === payload.cifrado &&
          data.proyecto_id === payload.proyecto_id &&
          data.boveda_generacion === payload.boveda_generacion &&
          (payload.version === undefined || data.version === Number(payload.version) + 1))
    );
  if (action === 'sincronizar_festivos')
    return (
      typeof data.sincronizados === 'number' &&
      Number.isSafeInteger(data.sincronizados) &&
      data.sincronizados >= 0
    );
  if (action === 'imputar_partes' || action === 'deshacer_imputacion') {
    const imputing = action === 'imputar_partes';
    if (!identifier(data.id) || !Array.isArray(data.partes)) return false;
    if (!imputing && data.id !== payload.id) return false;
    if (
      imputing &&
      (!identifier(data.tarea_id) || !identifier(data.jornada_id) || data.estado !== 'manual')
    )
      return false;
    // Every returned entry must carry the state the action promises, with a bumped version.
    const parts = data.partes as unknown[];
    if (
      !parts.every(
        (part) =>
          record(part) &&
          identifier(part.id) &&
          typeof part.version === 'number' &&
          Number.isSafeInteger(part.version) &&
          part.version > 1 &&
          (imputing
            ? part.imputacion_odoo_id === data.id && part.imputado_en_odoo === true
            : part.imputacion_odoo_id === null && part.imputado_en_odoo === false),
      )
    )
      return false;
    if (!imputing) return true;
    const requested = Array.isArray(payload.partes)
      ? payload.partes.map((part) => (record(part) ? part.id : undefined))
      : [];
    const returned = new Set(parts.map((part) => (part as Record<string, unknown>).id));
    return (
      requested.length > 0 &&
      returned.size === parts.length &&
      returned.size === requested.length &&
      requested.every((id) => returned.has(id))
    );
  }
  if (
    (action === 'crear_parte' || action === 'editar_parte') &&
    (typeof data.imputado_en_odoo !== 'boolean' ||
      (action === 'editar_parte' && data.id !== payload.id) ||
      (payload.imputado_en_odoo !== undefined &&
        data.imputado_en_odoo !== payload.imputado_en_odoo))
  )
    return false;
  if (
    [
      'fichar_entrada',
      'fichar_salida',
      'crear_fichaje',
      'editar_fichaje',
      'eliminar_fichaje',
    ].includes(action)
  ) {
    if (
      !identifier(data.id) ||
      data.id !== payload.id ||
      !identifier(data.usuario_id) ||
      !identifier(data.jornada_id) ||
      !timestamp(data.inicio_en) ||
      (data.fin_en !== null && !timestamp(data.fin_en)) ||
      typeof data.version !== 'number' ||
      !Number.isSafeInteger(data.version) ||
      data.version < 1
    )
      return false;
    if (action === 'fichar_salida') return timestamp(data.fin_en);
    if (action === 'eliminar_fichaje') return timestamp(data.eliminado_en);
    return data.eliminado_en === null;
  }
  if (action === 'iniciar' || action === 'detener') {
    if (data.ok === false) return typeof data.codigo === 'string' && data.codigo.length > 0;
    if (data.ok !== true || !record(data.parte) || !timestamp(data.hora_servidor)) return false;
    const part = data.parte;
    if (
      !identifier(part.id) ||
      !identifier(part.tarea_id) ||
      !identifier(part.usuario_id) ||
      !timestamp(part.inicio_en)
    )
      return false;
    return action === 'iniciar'
      ? part.tarea_id === payload.tarea_id &&
          (payload.inicio_en === undefined ||
            (typeof payload.inicio_en === 'string' &&
              typeof part.inicio_en === 'string' &&
              timestamp(payload.inicio_en) &&
              Date.parse(part.inicio_en) === Date.parse(payload.inicio_en)))
      : part.id === payload.parte_id && timestamp(part.fin_en);
  }
  if (action === 'consultar_cronometro')
    return (
      timestamp(data.hora_servidor) &&
      (data.parte === null ||
        (record(data.parte) && identifier(data.parte.id) && timestamp(data.parte.inicio_en)))
    );
  if (action === 'consultar_operacion')
    return (
      typeof data.encontrada === 'boolean' &&
      timestamp(data.hora_servidor) &&
      (!data.encontrada || record(data.resultado))
    );
  if (action === 'generar_semana') return Array.isArray(data.jornadas);
  if (!identifier(data.id)) return false;
  return (
    action === 'crear_configuracion_semanal' ||
    (typeof data.version === 'number' && Number.isSafeInteger(data.version) && data.version > 0)
  );
}
