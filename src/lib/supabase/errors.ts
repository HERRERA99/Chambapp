const messages: Record<string, string> = {
  SESION_REQUERIDA: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
  CONFLICTO_VERSION:
    'Los datos han cambiado en otra sesión. Cierra el formulario y vuelve a abrirlo para revisar los valores actualizados.',
  CRONOMETRO_ACTIVO:
    'Ya hay un cronómetro en curso. Detén o pausa esa sesión antes de iniciar otra.',
  DETENER_O_DESCARTAR_ACTIVO: 'Detén el cronómetro activo antes de eliminar este registro.',
  TAREA_NO_DISPONIBLE: 'La tarea no está disponible o está archivada.',
  PROYECTO_NO_DISPONIBLE: 'El proyecto no está disponible o está archivado.',
  CONFIGURACION_SEMANAL_REQUERIDA: 'Completa tu configuración de jornada para crear esta semana.',
  REPARTO_SEMANAL_INVALIDO: 'La suma de los días debe coincidir con el objetivo semanal.',
  FECHA_INICIO_INVALIDA: 'Revisa las fechas del registro.',
  CONFIRMAR_CAMBIO_ZONA:
    'El registro cambia a una jornada con otra zona horaria. Revisa la zona antes de guardarlo.',
};

export class DataError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
    readonly code?: string,
    readonly rawMessage?: string,
  ) {
    super(message);
    this.name = 'DataError';
  }
}

export function readableError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String(error.message)
        : String(error);
  for (const [code, text] of Object.entries(messages)) if (message.includes(code)) return text;
  if (/exclusion constraint|23P01/.test(message))
    return 'Este intervalo se solapa con otro parte. Revisa la hora exacta de inicio y fin.';
  if (/duplicate key|23505/.test(message)) return 'Ya existe una configuración para esa semana.';
  if (/Invalid login credentials/.test(message))
    return 'El correo o la contraseña no son correctos.';
  if (/Email not confirmed/.test(message)) return 'Confirma tu correo antes de iniciar sesión.';
  if (/Failed to fetch|NetworkError|network|fetch failed/i.test(message))
    return 'No se puede conectar con Supabase. Revisa tu conexión y vuelve a intentarlo.';
  if (/AbortError|TimeoutError|timed out|aborted/i.test(message))
    return 'La solicitud no se ha podido confirmar a tiempo. Reintenta para comprobar el resultado.';
  if (/JWT.*expired|Invalid.*JWT|session.*expired/i.test(message))
    return 'Tu sesión ha caducado. Vuelve a iniciar sesión; las operaciones pendientes se conservan para confirmar su resultado.';
  if (/rate limit|too many requests/i.test(message))
    return 'Hay demasiadas solicitudes. Espera un momento antes de repetir la acción.';
  return message || 'No se ha podido completar la operación.';
}
