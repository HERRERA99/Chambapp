# Datos locales (proyectos, tareas y partes en el navegador)

Algunas empresas no quieren que sus proyectos y partes de horas estén en un servidor externo. Chambapp puede guardar **proyectos, tareas, partes de horas y sus imputaciones de Odoo** en el navegador del usuario, en lugar de en Supabase. El resto sigue en la nube: perfil, jornada semanal, jornadas, fichajes, festivos y vacaciones, notas, bóveda y contraseñas.

## Cómo funciona para el usuario

Se activa con **Ajustes → Datos → En este navegador** (o en la configuración inicial). Un solo diálogo explica qué se guarda dónde, pide crear o desbloquear la clave maestra solo si hace falta, guarda la preferencia (sin pulsar «Guardar» después) y pide al navegador almacenamiento persistente. Para no guardar **nada** en la nube está [Chambapp local con Docker](../docker/README.md).

- **Ajustes → Datos** (y un paso de la configuración inicial): «En la nube» o «En este navegador». La opción decide **dónde se crean los proyectos nuevos**. Las tareas y partes van siempre donde está su proyecto.
- Los dos almacenes **coexisten**: la app muestra siempre los datos locales y los de la nube juntos, con la etiqueta _Local_ / _Nube_ y un filtro en Proyectos. Cambiar de opción nunca oculta ni pierde nada.
- **Mover proyecto** (detalle del proyecto): lo pasa, con sus tareas y partes, de la nube a este navegador o al revés, conservando los mismos ids. Al moverlo a local se **borra físicamente** de Supabase; Supabase puede conservar sus copias internas durante su periodo de retención.
- **Copia de seguridad** (Ajustes → Datos): descarga un JSON, opcionalmente cifrado con una contraseña elegida en ese momento (PBKDF2-SHA-256, 600 000 iteraciones, AES-GCM). **Importar** muestra una vista previa y deja elegir entre _Combinar_ (gana la versión más reciente de cada registro; los borrados cuentan) o _Reemplazar todo_ (antes descarga una copia automática). Solo se importan copias de la misma cuenta.
- **Aviso de copia pendiente**: si hay cambios sin copia desde hace más de N días (7 por defecto, 0 lo desactiva).
- **Borrar datos locales**: con confirmación y copia previa opcional; también borra las contraseñas guardadas para esos proyectos.

## Cifrado y bloqueo

- Los datos locales se guardan en IndexedDB (`chambapp-local`, un registro por cuenta) **cifrados con la clave de datos de la bóveda** (AES-GCM, AAD `chambapp:local:v1:<usuario>`). Hace falta tener clave maestra para usar el modo local.
- Basta desbloquear la bóveda **una vez mientras haya una pestaña abierta**: las pestañas nuevas de la misma cuenta piden la clave de datos a las abiertas por `BroadcastChannel('chambapp-local-clave')` (mismo origen; no se guarda en ningún sitio). La clave queda en memoria y los datos locales siguen abiertos aunque la bóveda se bloquee por inactividad. Se cierran al cerrar o recargar la pestaña, al cerrar sesión, al cambiar de cuenta y con **Bloquear todo** (que cierra todas las pestañas).
- Cambiar la clave maestra no afecta (la clave de datos es la misma). **Restablecer la bóveda** deja ilegibles los datos locales de ese navegador: la app avisa antes y ofrece descargar una copia, que no depende de la bóveda.
- Se pide al navegador almacenamiento persistente (`navigator.storage.persist()`), y en Ajustes → Datos se muestra si lo concedió.

## Arquitectura

| Pieza                                                                                                                                | Fichero                           |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| Motor local: los mismos comandos y códigos de error que las funciones SQL (`operar_legacy`, `operar`, `imputaciones` y sus triggers) | `src/lib/local/engine.ts`         |
| Persistencia cifrada con compare-and-swap entre pestañas                                                                             | `src/lib/local/store.ts`          |
| Enrutado de cada comando al almacén que tiene sus datos; una sola línea de tiempo (un cronómetro, sin solapes) entre los dos         | `src/lib/local/router.ts`         |
| Estado en la pestaña, clave en memoria, aviso entre pestañas (`BroadcastChannel`) y vista combinada                                  | `src/lib/local/runtime.ts`        |
| Copias de seguridad, importación y combinación                                                                                       | `src/lib/local/backup.ts`         |
| Operaciones de la interfaz (copias, borrar, mover proyecto)                                                                          | `src/features/local/localData.ts` |

`executeCommand` (en `workspace.repository.ts`) envía los comandos de proyectos, tareas y partes al enrutador; el resto va a Supabase como siempre. `loadWorkspace` combina los datos de la nube con los locales y marca cada registro con `origen`.

Los partes locales no crean jornadas en la nube: guardan su `fecha` y zona, y usan el id de la jornada de la nube de ese día si ya existe, o un id local estable.

## Supabase (migración `20261107000000_local_storage_links.sql`)

- Notas y credenciales pueden enlazar proyectos y tareas locales **solo por su UUID**: se quitan las claves foráneas de `nota_proyectos`, `nota_tareas` y `credenciales` hacia `proyectos`/`tareas`. Un id que existe en la nube debe ser del usuario y estar vivo; uno que no existe se trata como local. El trigger `enlace_propio` impide, por cualquier vía de escritura, enlazar un registro de otra cuenta.
- `chambapp_traspasos`: `importar_proyecto` (local → nube, mismos ids, idempotente por `traspaso_id`) y `purgar_proyecto` (borrado físico al pasar a local).

## Extensión

La extensión no puede leer el IndexedDB de la app: para importar una tarea de Odoo a un proyecto local, o enviar y marcar partes locales, pregunta a una pestaña abierta de Chambapp de la misma cuenta con los datos desbloqueados (`local-request` / `local-reply`). Sin esa pestaña avisa y no toca Odoo; si Odoo ya guardó la línea, el envío queda «enviado sin marcar» con el botón «Marcar» de siempre.

## Límites

- Los datos locales solo existen en ese navegador: no se sincronizan entre dispositivos (se llevan con la copia).
- La regla de un único cronómetro y sin solapes entre la nube y el navegador se comprueba en el cliente: dos dispositivos podrían saltársela a la vez.
- Recargar la única pestaña abierta pide desbloquear de nuevo (la clave no se guarda fuera de memoria).
- Rendimiento medido en Edge: con 20 000 partes (16 MB cifrados), unos 0,5 s por escritura.
