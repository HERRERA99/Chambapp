# Plan 11 — Almacenamiento local de proyectos, tareas y partes (coexistiendo con la nube)

## Objetivo

Que proyectos, tareas y partes de horas (con sus imputaciones de Odoo) se puedan guardar **en el navegador** en lugar de en Supabase, sin perder nada de lo que hay ahora. El resto (perfil, configuración semanal, jornadas, fichajes, ausencias, notas, bóveda y credenciales) sigue en la nube. Los dos almacenes **coexisten siempre**: el usuario elige un modo en la configuración inicial y en Configuración, y puede cambiarlo cuando quiera.

## Decisiones del usuario (2026-11-06)

| Tema               | Decisión                                                                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coexistencia       | Se ven siempre los datos locales y los de la nube juntos, con etiqueta Local/Nube. El modo solo decide **dónde se crean los proyectos nuevos**. Las tareas y partes van donde está su proyecto.          |
| Almacén            | IndexedDB del navegador, con `navigator.storage.persist()`.                                                                                                                                              |
| Enlaces            | Notas y credenciales (nube) pueden enlazar proyectos y tareas locales guardando solo su UUID. Migración de Supabase.                                                                                     |
| Extensión          | Para datos locales habla con una pestaña abierta de Chambapp. Sin pestaña, avisa.                                                                                                                        |
| Copia              | JSON; al descargar, opción «Cifrar con contraseña» (PBKDF2 + AES-GCM).                                                                                                                                   |
| Importar           | Vista previa con conteos y choques; «Combinar» (gana la versión más reciente) o «Reemplazar todo» (descarga antes una copia automática).                                                                 |
| Extras             | Mover proyecto Local↔Nube; aviso de copia pendiente (7 días, configurable); borrar datos locales; cifrado en reposo con la clave de la bóveda.                                                           |
| Sesión             | Los datos locales se conservan por cuenta; otra cuenta en el mismo navegador no los ve.                                                                                                                  |
| Bloqueo            | Basta desbloquear la bóveda una vez por pestaña: los datos locales siguen abiertos aunque la bóveda se bloquee por inactividad. Se cierran al cerrar la pestaña, cerrar sesión o pulsar «Bloquear todo». |
| Restablecer bóveda | Aviso claro de que se pierden los datos locales de este navegador. Después se pueden recuperar importando una copia (las copias no dependen de la bóveda).                                               |
| Sin bóveda         | Elegir «Local» pide crear la clave maestra en ese mismo paso. Sin bóveda no se activa el modo local.                                                                                                     |

## Supuestos y decisiones técnicas (con fuente)

- Toda la lógica de proyectos, tareas, partes, cronómetro e imputaciones vive en SQL: `chambapp_private.operar_legacy` (`supabase/migrations/20261005185736_…sql`), `chambapp_private.operar` (crear/editar tarea con Odoo y fichajes, `20261002190139_…sql`), los triggers `validar_fila` y `validar_arbol` (`20261001181821_…sql`), las restricciones de tabla (`20261001181821`, `20261001213125`, `20261002190139`) y `chambapp_private.imputaciones` más sus triggers (`20261104150000_…sql`). El motor local replica estas reglas y **los mismos códigos de error**, para que `readableError` y las pantallas no cambien.
- El front pasa todas las escrituras por `executeCommand` (`src/lib/supabase/workspace.repository.ts`), usado por `useCommand`, `TrackerProvider`/`pendingOperation`, `AttendanceProvider`, onboarding, ajustes, contraseñas y vault. La lectura pasa por `loadWorkspace`. Este es el punto de corte: un **enrutador de comandos** y una **carga combinada**.
- `resumen_*` (vistas SQL) no se usan en el front (solo en `database.types.ts`).
- Los partes de la nube apuntan a `jornadas` (nube). Una jornada es fecha + zona + minutos objetivo, que no son datos sensibles del trabajo, y ya está en la nube por los fichajes. **Los partes locales no crean jornadas en la nube** (no revelan qué días se trabajó en tareas). Cada parte local guarda `fecha` y `zona_horaria`. Su `jornada_id` es el de la jornada de la nube de esa fecha si ya existe en el workspace cargado, o si no un UUID local estable por fecha (`jornadas_locales[fecha]`). Las pantallas usan `fecha`, no `jornada_id` (verificado con grep).
- Las imputaciones locales agrupan por (`tarea_id`, `fecha`), equivalente al (`tarea_id`, `jornada_id`) de la nube.
- Clave de cifrado en reposo: la clave de datos de la bóveda (`VaultState.key`, no exportable). Cambiar la clave maestra (`rewrapVault`) conserva la misma clave de datos; restablecer la bóveda crea otra (generación nueva) y deja ilegibles los datos locales.
- Una copia de otra cuenta (`usuario_id` distinto) **se rechaza** al importar (privacidad y enlaces rotos).
- `src/lib/export.ts` (CSV) y las pantallas reciben el workspace combinado, así que exportan también los datos locales sin cambios.

## Diseño

### 1. Modelo y preferencia

- `Project`, `Task` y `TimeEntry` ganan `origen: 'nube' | 'local'`. Se añade en el cliente al cargar (las filas de Supabase no cambian). `assertProject/Task/Entry` siguen validando las filas de la nube; las locales se validan con los validadores del motor local.
- Preferencia en `perfiles.preferencias.almacenamiento`: `'nube' | 'local'` (por defecto `'nube'`), más `preferencias.aviso_copia_dias` (por defecto 7; 0 lo desactiva). Se guardan con `editar_perfil`, ya existente. Es por cuenta, no por navegador.
- `WorkspaceData` gana `local: { estado: 'sin-datos' | 'bloqueado' | 'abierto' | 'error' | 'no-disponible'; resumen?: { proyectos; tareas; partes; actualizadoEn; ultimaCopiaEn | null; cambiosDesdeCopia: boolean; persistente: boolean | null } }`.

### 2. Motor local (puro, sin navegador) — `src/lib/local/engine.ts`

- `LocalSnapshot` versión 1: `{ esquema: 1, usuario_id, proyectos[], tareas[], partes[], imputaciones[], jornadas_locales: Record<fecha, { id, zona_horaria }>, operaciones: Record<operacion_id, { tipo, parametros, parte_id, resultado, creado_en }>, traspasos: Traspaso[], meta: { revision, actualizado_en, ultima_copia_en, cambios_desde_copia } }`. Las filas siguen exactamente las columnas de `proyectos`, `tareas` y `partes_horas`/`partes_detalle` e `imputaciones_odoo`.
- `runLocalCommand(snapshot, action, payload, context) → { snapshot, result }`. Es una función pura: no modifica la entrada y devuelve una copia nueva. `context = { userId, now: Date, profile, cloudJornadas, cloudEntries, cloudActiveTimer }`.
- Acciones: `crear_proyecto`, `editar_proyecto`, `eliminar_proyecto`, `crear_tarea`, `editar_tarea`, `eliminar_tarea`, `crear_parte`, `editar_parte`, `eliminar_parte`, `iniciar`, `detener`, `consultar_operacion`, `consultar_cronometro`, `imputar_partes`, `deshacer_imputacion`. Respuestas con la **misma forma** que las de la nube; un test pasa cada respuesta por `isValidCommandResponse` (`src/lib/supabase/commandValidation.ts`).
- Reglas portadas una a una (cada una con test):
  - Longitudes y valores: nombre 1–200, título 1–300, estado ∈ {pendiente, en_curso, completada}, minutos ≥ 0, cliente 1–200, `odoo_id` `^T[0-9]+$` ≤ 64 (reusar `isOdooId`), `odoo_url` válida (reusar `isOdooUrl`), intervalo ∈ {0,5,10,15,30,60}, `fin_en > inicio_en`, instantes finitos.
  - `version`: `CONFLICTO_VERSION` si no coincide; cada actualización sube la versión y `actualizado_en`; no se edita un registro eliminado (`REGISTRO_ELIMINADO` / `*_NO_DISPONIBLE`).
  - Padres: tarea en un proyecto vivo, y no archivado al crear o mover (`PROYECTO_NO_DISPONIBLE`); parte en una tarea y proyecto vivos, y no archivados al crear o cambiar de tarea (`TAREA_NO_DISPONIBLE`); un cronómetro abierto no puede quedar bajo un padre archivado o eliminado (`HIJOS_ACTIVOS_EN_PADRE_ELIMINADO_O_ARCHIVADO`).
  - `INTERVALO_REAL_FUTURO` (con el reloj del dispositivo), `NO_REABRIR_PARTE`, `INTERVALO_COMPLETO_REQUERIDO`, `ENTRADA_REQUERIDA`.
  - Cambio de fecha al editar un parte, con `CONFIRMAR_CAMBIO_ZONA:<zona>` si la zona de la fecha destino difiere.
  - Borrado en cascada lógico (tombstones `eliminado_en`), `CONFIRMACION_CASCADA_REQUERIDA` y `DETENER_O_DESCARTAR_ACTIVO` (con `descartar_activo`). Un borrado repetido devuelve el registro ya eliminado.
  - `editar_tarea` con `proyecto_id` de otro almacén → `MOVER_ENTRE_ALMACENES` (se usa «Mover proyecto»).
  - **Sin solapes**: dos partes vivos del usuario no pueden solaparse (`exclude using gist … tstzrange(inicio_en, fin_en, '[)')`; un parte abierto se extiende hasta el infinito). El motor lo comprueba contra los partes locales **y** los de la nube (`context.cloudEntries`) y lanza `PARTES_SOLAPADOS`, que `readableError` traduce al mismo texto que el error 23P01. Antes de `crear_parte`/`editar_parte`/`iniciar` en la nube, el enrutador hace la comprobación inversa contra los partes locales.
  - **Un solo cronómetro en total**: `iniciar` local devuelve `{ ok: false, codigo: 'CRONOMETRO_ACTIVO', parte }` si hay un parte abierto local **o** en la nube (`context.cloudActiveTimer`). El enrutador hace la comprobación inversa antes de un `iniciar` en la nube (ver §4).
  - Idempotencia de `iniciar`/`detener` por `operacion_id` (`OPERACION_ID_REUTILIZADO` si cambian los parámetros), como `operaciones_cronometro`; se podan las operaciones de más de 30 días.
  - Imputaciones: hasta 1000 partes, sin repetidos, todos vivos, misma versión, terminados, sin imputar y del mismo grupo (`IMPUTACION_DATOS_INVALIDOS`, `PARTE_NO_DISPONIBLE`, `CONFLICTO_VERSION`, `PARTE_EN_CURSO`, `PARTE_YA_IMPUTADO`, `PARTES_DE_DISTINTO_GRUPO`). `deshacer_imputacion` libera solo los partes vivos. Se mantiene `imputado_en_odoo` coherente con `imputacion_odoo_id`, incluido el marcado heredado de `crear_parte`/`editar_parte` con `imputado_en_odoo`, que crea una imputación de un solo parte. Al mover un parte marcado a otra tarea o fecha, recibe una imputación propia nueva (como el trigger `sincronizar_imputacion_odoo`).
  - Derivados de `partes_detalle`: `proyecto_id`, `fecha`, `zona_horaria`, `inicio_imputado_en = inicio_en`, `fin_imputado_en = fin_en`, `duracion_real_segundos` y `duracion_imputada_segundos` (redondeo superior del total, con la misma función que usa el cliente para la nube). Se filtran los partes con tarea eliminada, como la vista.
- Fecha de un parte local: zona = la de la jornada de la nube de esa fecha si existe, o si no la del perfil; fecha = día de `inicio_en` en esa zona.

### 3. Persistencia cifrada — `src/lib/local/store.ts`

- IndexedDB `chambapp-local` v1, almacén `instantaneas` con clave `usuario_id`: `{ usuario_id, generacion_boveda, revision, sobre, actualizado_en }`. `sobre = encryptJson(dataKey, localAad(userId), snapshot)`, con `localAad = chambapp:local:v1:<userId>` (añadido en `src/lib/crypto/vault.ts`).
- Escritura atómica por compare-and-swap: en una sola transacción `readwrite` se comprueba que `revision` sigue igual y se escribe `revision + 1`. Si otra pestaña escribió antes, se relee, se **vuelve a ejecutar el comando** sobre la instantánea nueva y se reintenta (hasta 3 veces); si no, error `DATOS_LOCALES_OCUPADOS`. Los comandos locales se serializan en la pestaña con una cola.
- `BroadcastChannel('chambapp-local')` avisa a las demás pestañas para invalidar `['workspace', userId]`.
- Si la generación de la bóveda no coincide al leer → estado `error` con «Los datos locales se cifraron con una bóveda anterior. Importa una copia.»
- Al activar el modo local se llama a `navigator.storage.persist()` y se muestra si se concedió.
- Sin IndexedDB (navegación privada de algunos navegadores) → estado `no-disponible`, y el modo local queda deshabilitado con explicación.

### 4. Proveedor y enrutado — `src/features/local/LocalDataProvider.tsx`, `src/lib/local/router.ts`

- `LocalDataProvider` (entre `VaultProvider` y `WorkspaceProvider`) guarda en memoria la clave de datos en cuanto la bóveda se desbloquea en esa pestaña. **No** la borra con el bloqueo por inactividad de la bóveda. La borra al cerrar sesión, al cambiar de cuenta, con un cambio de generación de la bóveda y con «Bloquear todo» (nuevo botón junto al bloqueo de la bóveda, que bloquea ambas). `VaultProvider` expone un aviso `onUnlock(key, generation)` para que el proveedor capture la clave.
- `loadWorkspace` (combinado): carga la nube como hoy y, si hay clave, la instantánea local. Junta proyectos, tareas y partes marcando `origen`. Si un mismo id está en los dos almacenes (traspaso a medias), se muestra el del lado indicado por `traspasos` (ver §7). Calcula `local.estado` y `local.resumen`.
- `executeCommand(action, payload)` se envuelve en `routeCommand`:
  - Acciones que no son de proyectos, tareas ni partes → nube (sin cambios).
  - `crear_proyecto` → según `preferencias.almacenamiento`, o `payload.destino` si viene (lo quita antes de enviar).
  - Acciones con `id` de proyecto, tarea o parte → el almacén que tiene ese id. `crear_tarea` → el del proyecto; `crear_parte`/`iniciar` → el de la tarea; `detener` → el del parte; `imputar_partes` → el de los partes (mezclar almacenes → `PARTES_DE_DISTINTO_GRUPO`); `deshacer_imputacion` → el de la imputación. Si el id no aparece en ninguno → nube (la nube decide el error, como hoy).
  - `consultar_cronometro` → consulta los dos y devuelve el que tenga parte abierto, con `hora_servidor` de la nube. `consultar_operacion` → el almacén donde exista la operación (`operacion_id`); si no está en ninguno, la respuesta de la nube.
  - Antes de `crear_parte`/`editar_parte`/`iniciar` en la nube, si el intervalo se solapa con un parte local vivo → `PARTES_SOLAPADOS` sin llamar a Supabase.
  - Antes de `iniciar` en la nube, si hay un parte local abierto, se devuelve `{ ok: false, codigo: 'CRONOMETRO_ACTIVO', parte }` sin llamar a Supabase.
  - Escritura local con datos bloqueados → `DATOS_LOCALES_BLOQUEADOS` («Desbloquea la bóveda para usar tus datos locales»).
  - Mensajes nuevos en `readableError`: `DATOS_LOCALES_BLOQUEADOS`, `DATOS_LOCALES_OCUPADOS`, `MOVER_ENTRE_ALMACENES`, `PARTES_SOLAPADOS`, `COPIA_INVALIDA`, `COPIA_OTRA_CUENTA`, `COPIA_CONTRASENA`.
- `TrackerProvider`/`pendingOperation` ya usan `operacion_id`, así que sus reintentos funcionan igual en local, porque la idempotencia existe en los dos lados.
- Los selectores de proyecto y tarea (tareas, notas, credenciales, parte nuevo, cronómetro) muestran una etiqueta «Local». En Proyectos y Tareas se añaden la etiqueta y un filtro Todos/Nube/Local.

### 5. Supabase (migración nueva `supabase/migrations/20261107000000_local_storage_links.sql`)

- **Notas**: hoy los enlaces viven en `nota_proyectos` y `nota_tareas`, con claves foráneas `(proyecto_id|tarea_id, usuario_id) → proyectos|tareas` y `on delete cascade` (`20261027144005_markdown_notes.sql`). La vista `notas_detalle` los lee (`20261104120000_…sql`), y `chambapp_private.notas` comprueba al final que la instantánea coincide (`PROYECTO_NO_DISPONIBLE`/`TAREA_NO_DISPONIBLE`). La migración:
  - elimina esas dos claves foráneas (se mantienen la de `nota_id` y la clave primaria);
  - redefine `notas_detalle` para que un enlace aparezca si apunta a un proyecto o tarea **vivo del usuario en la nube** o a un id **que no existe en la nube** (local); un enlace a un proyecto o tarea de la nube eliminado sigue sin aparecer, como hoy;
  - en `chambapp_private.notas`, valida que los ids que existen en la nube sean del usuario y estén vivos, y acepta como locales los que no existen; la comprobación final de la instantánea sigue igual. La validación de forma (array, ≤ 100, UUID) no cambia;
  - sustituye el `on delete cascade` perdido por la limpieza que ya implica el borrado lógico (la vista los oculta). `purgar_proyecto` **conserva** los enlaces (el proyecto pasa a local con el mismo id).
- **Credenciales**: se elimina la clave foránea `credenciales(proyecto_id, usuario_id) → proyectos`. `chambapp_private.credenciales` exige que, si el proyecto existe en la nube, sea del usuario y esté vivo; si no existe, se acepta como local. El trigger `proyectos_borrar_credenciales` sigue para la nube. Al eliminar un proyecto local, el cliente borra sus credenciales en la nube (`eliminar_credencial`), después del borrado local.
- **Traspasos** (nueva RPC `public.chambapp_traspasos(p_accion, p_datos)`, `security invoker`, con la lógica en `chambapp_private.traspasos`, mismo orden de bloqueo: primero el perfil):
  - `importar_proyecto` (local→nube): recibe `{ proyecto, tareas[], partes[], imputaciones[] }` con sus ids. Exige que ninguno exista ya en la nube (`TRASPASO_ID_EXISTENTE`), que sean del usuario y que no haya parte abierto. Inserta conservando ids, `inicio_en`/`fin_en`, descripciones, intervalos y odoo_id/url. Crea jornadas con `obtener_jornada` (fecha y zona de cada parte). Crea las imputaciones agrupadas por (tarea, jornada) y asigna `imputacion_odoo_id`. Si el proyecto o alguna tarea estaba archivada, los inserta sin archivar y los archiva al final. Las tombstones locales no se suben. Las versiones y `creado_en` se reinician (los triggers lo imponen). Devuelve los ids creados. Es idempotente por `traspaso_id`: repetir el mismo `traspaso_id` con los mismos datos devuelve el resultado guardado.
  - `purgar_proyecto` (nube→local, tras guardar la copia local): **borra físicamente** el proyecto, sus tareas, partes, imputaciones y las operaciones de cronómetro de esos partes. Exige `confirmar: true` y que no haya parte abierto. Las credenciales y las notas conservan el id y siguen enlazadas.
- Pruebas SQL en `tools/db-tests` para notas (id local, id de otro usuario, proyecto de la nube eliminado, enlace que sobrevive a `purgar_proyecto`), credenciales e ids ajenos, `importar_proyecto` (ids repetidos, archivados, imputaciones, idempotencia) y `purgar_proyecto`.
- `database.types.ts` actualizado.

### 6. Configuración y configuración inicial

- Nueva sección **Datos** en Configuración (`src/features/settings/components/StorageSettings.tsx`):
  - Selector Nube/Local con explicación. Elegir Local sin bóveda muestra `VaultUnlockCard` en modo crear; con bóveda bloqueada, en modo desbloquear. Se guarda con `editar_perfil`.
  - Estado local: número de proyectos, tareas y partes; última modificación; última copia; si el almacenamiento es persistente.
  - **Descargar copia**: casilla «Cifrar con contraseña» (dos campos, mínimo `MIN_MASTER_PASSWORD_LENGTH`). Se descarga `chambapp-local-AAAA-MM-DD.json`. Actualiza `meta.ultima_copia_en` y pone `cambios_desde_copia = false`.
  - **Importar copia**: elegir archivo → si está cifrado, pedir contraseña → validar → vista previa (conteos, nuevos, más recientes en el archivo, más recientes aquí, tombstones) → «Combinar» o «Reemplazar todo» (descarga antes una copia automática de lo actual). Requiere datos locales abiertos (o crea un almacén vacío).
  - **Aviso de copia**: número de días (0 = desactivado).
  - **Borrar datos locales**: confirmación escribiendo «BORRAR». Antes descarga una copia automática (cancelable solo si el usuario marca «no quiero copia»). Borra el registro de IndexedDB y las credenciales de la nube de proyectos locales.
- **Configuración inicial** (`OnboardingPage`): nuevo paso «¿Dónde guardar proyectos, tareas y partes?» con las mismas dos opciones, y la creación de la bóveda en línea si elige Local.
- **Restablecer bóveda** (`SecuritySettings`/`VaultSettings`): si hay datos locales en este navegador, aviso de que dejarán de poder leerse. Si la bóveda está desbloqueada, ofrece descargar una copia antes.
- **Avisos globales** en `WorkspaceLayout`: (a) datos locales bloqueados («Desbloquea para ver tus proyectos locales»); (b) copia pendiente (hay `cambios_desde_copia` y la última copia tiene más de N días, o nunca se hizo), con botón «Descargar copia»; (c) modo Local sin datos en este navegador («Importa una copia si vienes de otro dispositivo»); (d) error de generación de la bóveda. Se pueden cerrar durante la sesión.

### 7. Mover proyecto Local↔Nube (en el detalle del proyecto)

- Bloqueado si el proyecto tiene un parte abierto, o si los datos locales están bloqueados.
- **Nube → Local**: se leen de la nube el proyecto, sus tareas y partes vivos (sin tombstones) y las imputaciones de esos partes. Se escribe en local con el mismo id y `traspasos.push({ proyecto_id, direccion: 'a-local', estado: 'copiado' })`. Luego `purgar_proyecto` y se marca el traspaso como `hecho`. Mientras está `copiado` (fallo de red), el proyecto se ve desde local, se oculta la copia de la nube y hay un aviso con «Reintentar borrado en la nube».
- **Local → Nube**: `importar_proyecto` con `traspaso_id`. Luego se borran físicamente esos registros locales y se marca `hecho`. Mientras la nube tiene la copia y el local aún no se ha borrado, se muestra la de la nube y se reintenta el borrado local.
- El diálogo explica que la nube puede conservar copias de seguridad propias de Supabase durante su periodo de retención.

### 8. Copia de seguridad — `src/lib/local/backup.ts`

- Formato plano: `{ formato: 'chambapp-local', version: 1, exportado_en, usuario_id, datos: { proyectos, tareas, partes, imputaciones, jornadas_locales } }`. No incluye operaciones ni traspasos.
- Formato cifrado: `{ formato: 'chambapp-local-cifrado', version: 1, kdf: { nombre: 'PBKDF2-SHA256', sal, iteraciones: VAULT_ITERATIONS }, sobre }`, con la clave derivada de la contraseña y AAD `chambapp:copia-local:v1:<usuario_id>`. Reutiliza las primitivas de `vault.ts`.
- Validación al importar: formato y versión conocidos, `usuario_id` igual al de la sesión (si no, `COPIA_OTRA_CUENTA`), cada fila con los validadores del motor, integridad referencial (tareas → proyectos, partes → tareas, imputaciones → partes del mismo grupo), ids UUID y tamaño máximo de 50 MB.
- Combinar: por id, gana la versión mayor; con la misma versión, el `actualizado_en` más reciente; las tombstones cuentan como registros. Después se revalida la integridad y la regla de un único cronómetro abierto (si el resultado tendría dos, se rechaza la importación con explicación). Reemplazar: sustituye `datos`, conserva `meta` y pone `cambios_desde_copia = true`.
- Un id que ya existe en la nube → se omite y se avisa en la vista previa (no se permite que un registro esté en los dos lados).

### 9. Extensión (protocolo app↔extensión)

- `OdooRequest` gana `origen: 'nube' | 'local'` (opcional en la validación, `'nube'` por defecto, para no romper versiones anteriores).
- Nuevos mensajes worker→página y página→worker, validados en `src/features/extension/protocol.ts`:
  - worker → página: `local-request` `{ requestId, userId, op }`, con `op` ∈ `listar` (proyectos y tareas locales vivos), `crear-tarea` (importar), `cargar-partes` (`{ partIds, taskId }`, para revalidar) e `imputar` (`{ partes }`).
  - página → worker: `local-reply` `{ requestId, ok, data | error }`.
  - Solo responde una pestaña de Chambapp de la misma cuenta con datos locales abiertos. El worker busca las pestañas de la app (`tabs.query` sobre los orígenes de la app), envía por el canal `to-app` existente y espera la respuesta hasta 10 s.
- `odooQueue.runAttempt`/`markEntries`: si `origen === 'local'`, revalidan y marcan pidiendo los datos a la página. Si no hay pestaña antes de escribir → error «Abre Chambapp y desbloquea tus datos locales para enviar» (no se toca Odoo). Si no hay pestaña después de que Odoo guardó → `sent-unmarked`, con el «Marcar» manual ya existente.
- Popup → Odoo (importar tarea): la lista de proyectos incluye los locales (pedidos a la página) con la etiqueta «Local». La detección de duplicados también mira las tareas locales. Sin pestaña, solo nube y el aviso.
- Versión de la extensión 0.3.0. Al final se pregunta al usuario si firmar y publicar Firefox 0.3.0.

## No objetivos

- Sincronizar automáticamente los datos locales entre dispositivos (se hace con la copia).
- Llevar a local la bóveda, notas, credenciales, jornadas, fichajes o ausencias.
- Funcionar sin conexión a Supabase (la sesión, el perfil y las jornadas siguen en la nube).
- Garantizar la eliminación de las copias internas de Supabase al mover un proyecto a local (se avisa).

## Riesgos

- La regla de un solo cronómetro entre almacenes es «comprobar y luego escribir» desde el cliente: dos pestañas pueden ganar la carrera a la vez. Se mitiga con la cola local, el aviso entre pestañas y la comprobación al cargar, que muestra un aviso si hay dos abiertos y deja detener cualquiera.
- El reloj del dispositivo manda en local (`INTERVALO_REAL_FUTURO`, `detener`).
- Re-cifrar toda la instantánea en cada escritura: aceptable hasta unas decenas de miles de partes. Se mide con 20 000 partes (objetivo < 300 ms por escritura en un portátil normal).
- Perder la bóveda o el navegador sin copia → datos perdidos; los avisos lo explican.

## Verificación

1. `npm run typecheck`, `npm run lint`, `npx prettier --check` sobre los ficheros tocados.
2. `npm test` con tests nuevos:
   - `tests/localEngine.test.ts`: cada acción y cada código de error de §2; respuestas validadas con `isValidCommandResponse`; **comparación con la nube**: un conjunto de escenarios (crear, editar, cambiar de fecha, borrar en cascada, iniciar/detener idempotente, imputar/deshacer, redondeos 0/5/15/60) cuyo resultado se compara con el de las mismas acciones contra Supabase local en `tools/db-tests` (mismos campos de salida, ignorando ids, marcas de tiempo y versión cuando corresponda).
   - `tests/localRouter.test.ts`: enrutado de cada acción, un único cronómetro entre almacenes, `DATOS_LOCALES_BLOQUEADOS`, `MOVER_ENTRE_ALMACENES`, `consultar_cronometro` combinado.
   - `tests/localBackup.test.ts`: ida y vuelta plana y cifrada (contraseña incorrecta → `COPIA_CONTRASENA`), otra cuenta, integridad rota, combinar (versión, empate, tombstones, choque con la nube, dos cronómetros) y reemplazar.
   - `tests/localStore.test.ts`: compare-and-swap y reintento con un adaptador de almacén en memoria con la misma interfaz que IndexedDB.
   - Protocolo de la extensión (`tests/extensionMessages.test.ts`): `local-request`/`local-reply` y `origen`.
3. `npm run db:test` (Supabase local): migración, notas y credenciales con ids locales y ajenos, `importar_proyecto`, `purgar_proyecto`, y los escenarios de comparación del punto 2.
4. Navegador real (Edge, Playwright con `tools/ui-smoke` ampliado con un IndexedDB real):
   - elegir modo Local en la configuración inicial creando la bóveda;
   - crear un proyecto local, una tarea y un parte con el cronómetro; ver las etiquetas;
   - recargar, bloquear la bóveda por inactividad (tiempo simulado) y comprobar que los datos siguen; «Bloquear todo» los oculta;
   - dos pestañas: la escritura de una aparece en la otra;
   - descargar una copia (plana y cifrada), borrar los datos locales, importar (vista previa, combinar, reemplazar);
   - mover un proyecto a la nube y de vuelta a local;
   - aviso de copia pendiente.
5. Extensión: `tools/ext-smoke` ampliado con un envío de un parte local (pestaña de la app simulada que responde `local-reply`) y el caso sin pestaña.
6. Rendimiento: script de 20 000 partes con tiempo de escritura medido.
7. Manual (usuario): flujo completo con su cuenta y Odoo real.

## Desviaciones durante la construcción (Claude, sin revisión de Codex)

- En lugar de un `LocalDataProvider` de React, un módulo `src/lib/local/runtime.ts` guarda la clave y el estado: la bóveda vive dentro del layout, por debajo del proveedor que carga los datos, y así no hace falta reordenar los proveedores. `VaultProvider` le entrega la clave al desbloquear.
- Recargar la pestaña pide desbloquear de nuevo: la clave no se guarda fuera de memoria (guardarla en `sessionStorage` la expondría a cualquier script de la página).
- Migración: además de lo previsto, el trigger `enlace_propio` sustituye la defensa en profundidad que daban las claves foráneas eliminadas (ningún enlace a registros de otra cuenta, por ninguna vía de escritura). Nueva tabla privada `chambapp_private.traspasos` (idempotencia), con RLS.
- Traspaso local→nube con estado intermedio `pendiente` (la nube puede no tener aún la copia; reintentar con el mismo `traspaso_id` es seguro).
- Rendimiento: el objetivo de 300 ms con 20 000 partes no se alcanza; se mide ~0,5 s por escritura (16 MB cifrados) tras usar base64 nativo y una caché por revisión. Se acepta y se documenta.
- Error encontrado en la prueba en navegador y corregido: la expresión regular que validaba los sobres cifrados desbordaba la pila con más de ~20 MB, y el dato quedaba guardado pero ilegible. Ahora se valida sin expresión regular, y el almacén comprueba que puede descifrar lo que va a guardar antes de escribirlo. Test de regresión en `tests/vault.test.ts`.
- `jornada_id` de un parte local: la jornada de la nube de ese día si está cargada; si no, un UUID local estable por fecha (`jornadas_locales`).
