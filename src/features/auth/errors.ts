export function authErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'No se pudo completar la operación. Inténtalo de nuevo.';
  if (/invalid login credentials/i.test(error.message))
    return 'El correo o la contraseña no son correctos.';
  if (/email not confirmed/i.test(error.message))
    return 'Confirma tu correo antes de iniciar sesión.';
  if (/rate limit|too many requests|security purposes/i.test(error.message))
    return 'Se han realizado demasiados intentos. Espera un momento antes de volver a probar.';
  if (/provider.*not enabled|unsupported provider/i.test(error.message))
    return 'Este proveedor de acceso todavía no está habilitado. Elige otro método disponible.';
  if (/access_denied|user.*cancel|cancelled|canceled|denied.*access/i.test(error.message))
    return 'El acceso con la plataforma se ha cancelado o no se ha autorizado. Puedes volver a intentarlo.';
  if (/signup.*disabled|signups.*not allowed/i.test(error.message))
    return 'La creación de cuentas está deshabilitada. Accede con una cuenta existente.';
  if (
    /code verifier|code_verifier|flow_state|pkce|authorization code|auth code/i.test(error.message)
  )
    return 'El enlace de acceso ha caducado o se abrió en otro navegador. Vuelve a iniciar sesión desde este navegador.';
  if (/redirect_uri_mismatch|redirect.*not allowed/i.test(error.message))
    return 'La dirección de retorno del acceso no está configurada. Contacta con quien administra Chambapp.';
  if (/failed to fetch|network/i.test(error.message))
    return 'No se pudo conectar. Revisa tu conexión y vuelve a intentarlo.';
  if (/password.*same|same.*password/i.test(error.message))
    return 'Elige una contraseña distinta de la actual.';
  return error.message;
}

export function oauthCallbackError(search: string, hash: string) {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ''));
  const message =
    query.get('error_description') ??
    fragment.get('error_description') ??
    query.get('error') ??
    fragment.get('error') ??
    query.get('error_code') ??
    fragment.get('error_code');
  return message ? authErrorMessage(new Error(message)) : null;
}
