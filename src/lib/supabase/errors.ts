const messages: Record<string, string> = {
  NOTA_DATOS_INVALIDOS: 'Revisa el título, el contenido y los vínculos de la nota.',
  NOTA_DEBE_CIFRARSE:
    'Tus notas están cifradas: desbloquea la bóveda con tu clave maestra para guardar.',
  BOVEDA_CAMBIADA:
    'La clave maestra se ha restablecido o cambiado en otra sesión. Vuelve a desbloquear para continuar.',
  BOVEDA_EXISTENTE: 'Ya tienes una clave maestra. Desbloquea la bóveda con ella.',
  BOVEDA_DATOS_INVALIDOS: 'No se ha podido preparar la clave maestra. Vuelve a intentarlo.',
  CONFIRMACION_REQUERIDA: 'Escribe BORRAR para confirmar el restablecimiento.',
  CREDENCIAL_DATOS_INVALIDOS: 'Revisa los datos de la entrada.',
  CREDENCIAL_NO_DISPONIBLE: 'La entrada ya no está disponible. Actualiza los datos.',
  CREDENCIAL_ID_REUTILIZADO:
    'Esta entrada ya se ha guardado con otros datos. Actualiza la página para revisarla.',
  CREDENCIAL_DEMASIADO_GRANDE: 'La entrada es demasiado grande. Reduce el texto de sus campos.',
  NOTA_NO_DISPONIBLE: 'La nota ya no está disponible. Actualiza los datos.',
  NOTA_ID_REUTILIZADO:
    'Esta nota ya se ha guardado con otros datos. Actualiza la página para revisarla.',
  NOTA_DEMASIADO_GRANDE: 'La nota supera el límite de 1 MB de texto Markdown.',
  NOTA_DEMASIADOS_VINCULOS: 'Puedes asociar hasta 100 proyectos y 100 tareas a cada nota.',
  IMPUTACION_ODOO_INVALIDA: 'Indica si este parte está imputado en Odoo con una marca válida.',
  IMPUTACION_DATOS_INVALIDOS: 'Selecciona entre 1 y 1000 partes distintos para imputarlos juntos.',
  IMPUTACION_NO_DISPONIBLE: 'Esta imputación ya no existe. Actualiza los datos.',
  PARTE_YA_IMPUTADO:
    'Alguno de los partes ya está imputado. Actualiza los datos y vuelve a seleccionar.',
  PARTE_EN_CURSO: 'Detén el parte en curso antes de imputarlo.',
  PARTES_DE_DISTINTO_GRUPO:
    'Solo se pueden imputar juntos partes de la misma tarea y el mismo día.',
  PARTE_NO_DISPONIBLE: 'El parte ya no está disponible. Actualiza los datos.',
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
  FICHAJE_ID_REQUERIDO: 'No se ha podido identificar el fichaje. Actualiza la página.',
  FICHAJE_ID_REUTILIZADO:
    'Este fichaje ya se ha guardado con otros datos. Actualiza la página para revisarlo.',
  FICHAJE_NO_DISPONIBLE: 'El fichaje ya no está disponible. Actualiza los datos.',
  ENTRADA_REQUERIDA: 'Indica la fecha y hora de entrada.',
  INTERVALO_REAL_FUTURO: 'La entrada y la salida no pueden estar en el futuro.',
  ZONA_HORARIA_REQUERIDA: 'La fecha y hora deben incluir una zona horaria válida.',
  fichajes_intervalo_valido: 'La salida debe ser posterior a la entrada.',
  un_fichaje_abierto_por_usuario:
    'Ya tienes una entrada sin salida. Registra su salida antes de volver a entrar.',
  tareas_odoo_id_formato: 'El ID de Odoo debe ser T seguido de números, por ejemplo T443212.',
  tareas_odoo_url_formato:
    'El enlace de Odoo debe ser una dirección válida con http:// o https://.',
  CONFIRMAR_CAMBIO_ZONA:
    'El registro cambia a una jornada con otra zona horaria. Revisa la zona antes de guardarlo.',
};

export class DataError extends Error {
  readonly retryable: boolean;
  readonly code?: string;
  readonly rawMessage?: string;
  constructor(message: string, retryable = false, code?: string, rawMessage?: string) {
    super(message);
    this.name = 'DataError';
    this.retryable = retryable;
    this.code = code;
    this.rawMessage = rawMessage;
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
  if (/fichajes.*excl|excl.*fichajes/.test(message))
    return 'Este fichaje se solapa con otro. Revisa la fecha y hora de entrada y salida.';
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
