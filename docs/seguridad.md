# Seguridad

Resumen del modelo de seguridad y de la auditoría del 11/11/2026 (rama
`claude/browser-extensions-local-security-886p0w`).

## Modelo

- **Nube (Vercel + Supabase)**: todas las tablas tienen RLS; las escrituras pasan por RPC
  `SECURITY INVOKER` que delegan en funciones privadas `SECURITY DEFINER` con
  `search_path = ''` (comprobado por `supabase/verify.sql` y `tools/db-tests`).
- **Bóveda**: notas y contraseñas cifradas en el cliente (AES-GCM; clave de datos envuelta con
  PBKDF2-SHA-256, 600 000 iteraciones). El servidor nunca ve la clave maestra.
- **Datos en este navegador**: IndexedDB cifrado con la clave de datos de la bóveda.
- **Chambapp local (Docker)**: sin cuentas; un único puerto en `127.0.0.1`. nginx exige
  `Host` local (DNS rebinding) y, en `/rest/`, `Origin` vacío, la propia app o la extensión de
  Chambapp (CSRF).
- **Extensión**: el worker solo acepta mensajes de sus propias páginas, del puente en las
  pestañas de Chambapp (marco principal, origen exacto) y del detector de Odoo; permisos de
  host solo para Chambapp, Supabase, Hera y el Odoo que el usuario configure.

## Auditoría (11/11/2026): hallazgos y correcciones

| #   | Hallazgo                                                                                            | Riesgo                                                                                  | Corrección                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | La web en Vercel no enviaba cabeceras de seguridad (sin CSP, sin `X-Frame-Options`, sin HSTS).      | Medio: clickjacking y sin defensa en profundidad ante XSS.                              | `vercel.json`: CSP estricta (`script-src 'self'`, `frame-ancestors 'none'`, `connect-src` solo Supabase y festivos), HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy` y COOP. Probada contra el build sin violaciones.            |
| 2   | La API local aceptaba cualquier `chrome-extension://…`.                                             | Medio: cualquier extensión instalada podía leer y escribir los datos de Chambapp local. | nginx solo acepta el id fijo de la extensión de Chambapp (derivado de `key`; `tests/extensionId.test.ts` lo mantiene sincronizado). Firefox asigna ids aleatorios por instalación: ahí no se puede fijar (riesgo aceptado y documentado). |
| 3   | La API key de Odoo seguía guardándose en `chambapp_private.odoo_credenciales` aunque nada la usaba. | Bajo: secreto almacenado sin necesidad.                                                 | Migración `20261111000000_remove_odoo_api_key.sql` (nube y local) borra tabla, RPC y claves guardadas.                                                                                                                                    |
| 4   | Un archivo de copia manipulado podía pedir miles de millones de iteraciones PBKDF2.                 | Bajo: congela la pestaña al importar.                                                   | `src/lib/crypto/vault.ts` acepta solo 100 000–10 000 000 (el mismo rango que la base de datos).                                                                                                                                           |
| 5   | Vite 8.3.1 con avisos de seguridad del servidor de desarrollo; zod (dev) con DoS.                   | Bajo (solo desarrollo).                                                                 | Vite 8.3.7 y zod 4.6.7.                                                                                                                                                                                                                   |
| 6   | `video/`: `adm-zip` y `sharp` vulnerables (dependencias de Remotion/transformers).                  | Bajo (herramienta local, no se publica).                                                | `overrides` a versiones corregidas.                                                                                                                                                                                                       |
| 7   | Contenedores locales con privilegios por defecto.                                                   | Bajo.                                                                                   | `no-new-privileges` en todos; `cap_drop: [ALL]` en `api` y `web`; `api` con sistema de archivos de solo lectura.                                                                                                                          |

Revisado sin hallazgos: RLS y permisos de RPC, funciones `SECURITY DEFINER`, redirecciones
tras el login (`safeReturnTo`), Markdown (sin HTML, enlaces externos con `noopener`),
`postMessage` app↔extensión (origen y ventana comprobados), validación de mensajes del worker,
secretos en el repositorio (ninguno), `npm audit --omit=dev` (0 vulnerabilidades).

Pendiente / aceptado:

- `minimatch` (dependencia de ESLint) tiene un aviso moderado de DoS; la corrección exige
  bajar de versión ESLint. Solo afecta a desarrollo.
- En Chambapp local, cualquier programa del propio PC puede llamar a la API (equipo de un solo
  usuario; notas y contraseñas siguen cifradas con la clave maestra).
- La clave de datos se comparte entre pestañas abiertas del mismo origen (`BroadcastChannel`).
  Un XSS en la app ya tendría acceso a ella; la CSP nueva reduce ese riesgo.
