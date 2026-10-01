export function authErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'No se pudo completar la operación. Inténtalo de nuevo.';
  if (/invalid login credentials/i.test(error.message))
    return 'El correo o la contraseña no son correctos.';
  if (/email not confirmed/i.test(error.message))
    return 'Confirma tu correo antes de iniciar sesión.';
  if (/rate limit|too many requests|security purposes/i.test(error.message))
    return 'Se han realizado demasiados intentos. Espera un momento antes de volver a probar.';
  if (/provider.*not enabled|unsupported provider/i.test(error.message))
    return 'Este proveedor de acceso todavía no está habilitado. Usa tu correo y contraseña.';
  if (/failed to fetch|network/i.test(error.message))
    return 'No se pudo conectar. Revisa tu conexión y vuelve a intentarlo.';
  if (/password.*same|same.*password/i.test(error.message))
    return 'Elige una contraseña distinta de la actual.';
  return error.message;
}
