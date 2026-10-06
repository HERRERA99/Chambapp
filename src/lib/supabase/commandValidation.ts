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

/** An incomplete 2xx reply must not clear a durable intent or be shown as saved. */
export function isValidCommandResponse(
  action: CommandAction,
  payload: Record<string, Json | undefined>,
  data: unknown,
): boolean {
  if (!record(data)) return false;
  if (action === 'sincronizar_festivos')
    return (
      typeof data.sincronizados === 'number' &&
      Number.isSafeInteger(data.sincronizados) &&
      data.sincronizados >= 0
    );
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
