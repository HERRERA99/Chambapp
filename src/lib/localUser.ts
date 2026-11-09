// The single user of the local (Docker) edition. Shared by the app and the extension.
// Keep LOCAL_USER_ID in sync with auth.uid() in docker/db/shim.
export const LOCAL_USER_ID = '00000000-0000-4000-8000-000000000001';
export const LOCAL_USER_EMAIL = 'local@chambapp.local';
/** Default address of a local installation (docker/.env CHAMBAPP_PORT). */
export const DEFAULT_LOCAL_ORIGIN = 'http://127.0.0.1:47800';
/** Request header that carries the data generation (see chambapp_local.antes_peticion). */
export const GENERATION_HEADER = 'X-Chambapp-Generacion';
export const GENERATION_CHANGED = 'GENERACION_CAMBIADA';
