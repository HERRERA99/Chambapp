# Plan 9 — Extensión de navegador de Chambapp (Odoo + gestor de contraseñas)

Base: `main` en 9fd1999 (árbol limpio). Petición directa del usuario. Implementación autorizada («quiero generar una extensión»). Sin commit ni push salvo que el usuario lo pida.

## Objetivo

Extensión Chromium (Chrome/Edge, Manifest V3) integrada con Chambapp:

1. **Partes de horas — importar tarea:** en la ficha de una tarea de Odoo, la extensión lo detecta y permite añadirla a Chambapp (crea la tarea con título, ID Odoo, URL y proyecto).
2. **Partes de horas — imputar en Odoo:** los botones «Enviar seleccionados» / «Enviar todos» de **Parte semanal** (grupo tarea+día con URL de Odoo) pasan a funcionar: la extensión abre la tarea en Odoo, crea la línea en la pestaña «Partes de horas» automatizando el DOM (**sin API de Odoo**) y, solo si comprueba que la línea quedó guardada (recargando Odoo), marca esos partes como imputados en Chambapp.
3. **Gestor de contraseñas estilo Bitwarden** conectado a la sección Contraseñas de la app (misma bóveda cifrada de extremo a extremo).

La estética de la extensión es la de la app (tokens y componentes de `src/styles`).

## Decisiones confirmadas por el usuario

- **U1** Botones de envío = los de Parte semanal (`TimesheetGroups`), solo si el grupo tiene URL de Odoo segura. Tras éxito en Odoo se marcan como imputados.
- **U2** Login en la extensión con email/contraseña **y** los proveedores OAuth de la app (exige registrar la URL de redirección de la extensión en Supabase; se documenta).
- **U3** Contraseñas v1: desbloquear con clave maestra, autobloqueo, buscar, sugerencias para la web actual, autocompletar usuario/contraseña, copiar, generar, crear y editar. **Sin** captura automática al iniciar sesión en webs.
- **U4** Dominio de Odoo configurable en los ajustes de la extensión; el permiso de host se pide en tiempo de ejecución solo para ese origen.

## Reconocimiento (fuentes)

- `Extension_App/` (ejemplo que funciona): **los nombres de archivo están desplazados** respecto a su contenido: `popup.css` = manifest real (pide `background.js`, `content.js`, `popup.html`); `content.js` = service worker (cola); `manifest.json` = content script (puente `postMessage` + automatización Odoo); `index.html` = `popup.js`; `popup.js` = `popup.html`; `popup.html` = `popup.css`; `script.js` = `index.html` de la app antigua; `styles.css` = `script.js` de la app antigua. Tal cual no carga.
  - **Se reutiliza (reescrito en TS):** la secuencia de automatización de Odoo (pestaña «Partes de horas» del formulario, «Añadir una línea», rellenar `#date` dd/mm/aaaa, `#name`, `#unit_amount` HH:MM con el setter nativo + eventos `input`/`change`, «Guardar y cerrar», después «Guardar manualmente»), `esperarElemento` con sondeo y timeout, la validación del parte (fecha, descripción, URL, tiempo > 0, confirmación > 5 h), la cola persistente en `chrome.storage.local`, deduplicación por clave, recuperación al cerrar la pestaña y alarma de reanudación, los selectores de extracción de tarea (`project_id`, `code`, `name`) y el aviso de «Extension context invalidated».
  - **Se descarta:** la detección de fin de guardado por «firma visual estable 700 ms» o por palabras («guardado», «success») en notificaciones (P9-002: puede dar éxito con un guardado lento o fallido; se sustituye por la verificación de C), el timeout solo del lado del SW sin cancelar el script inyectado (P9-004), content script en `<all_urls>` en `document_start` (exceso de permisos), `postMessage(..., '*')` sin comprobar origen, mensajes sin validar del popup/página, concurrencia de hasta 5 ventanas, «último parte»/«copiar JSON»/«pegar», importar tarea difundiendo a todas las pestañas, `exportar-datos-json`, estilos del popup.
- App: Supabase con `flowType: 'pkce'` (`src/lib/supabase/client.ts`), RPC `chambapp_operar` (`crear_tarea`, `crear_proyecto` aceptan `odoo_id`/`odoo_url` — `20261002190139_odoo_and_attendance.sql` l.225), `chambapp_imputaciones` (`imputar_partes` `{partes:[{id,version}]}` de un mismo grupo, 1..1000), `chambapp_credenciales` (`guardar_credencial` `{id, version?, proyecto_id, boveda_generacion, cifrado}`), tabla `bovedas` (`sal`, `iteraciones`, `clave_envuelta`, `generacion`), vista `credenciales_detalle`.
- Cifrado: `src/lib/crypto/vault.ts` (PBKDF2-SHA-256 600k → KEK AES-GCM; DEK envuelta; AAD `chambapp:credencial:v1:<user>:<id>`), modelo `src/features/passwords/credentials.model.ts` (`CredentialSecret {nombre,url,campos[]}`, `parseCredential`, `credentialProblem`, `generatePassword`, `safeUrl`, `credentialMatches`), `useCredentials.ts` (`openCredential`, `encryptCredential`), `vault.repository.ts`.
- Odoo en la app: `src/domain/odoo.ts` (`isOdooId` = `T` + dígitos, `normalizeOdooUrl`), `OdooSendButton` placeholder deshabilitado, `TimesheetGroups.tsx` (botones `OdooSendButton` «Enviar seleccionados»/«Enviar todos»), `timesheet.model.ts` (`groupRounding`, `buildTimesheetGroups`, `maxImputationEntries`), `src/domain/time.ts` (`roundDuration`).
- Auth de la app: email/contraseña + OAuth (`src/features/auth/oauth.ts`: google, apple, azure, github, …). Producción `https://chambapp-tracker.vercel.app`, desarrollo `http://127.0.0.1:5173` (`docs/oauth.md`, `vite.config.ts`).
- Estética: `src/styles/tokens.css` (oscuro, acento `#ff2e56`, Space Grotesk / Geist / JetBrains Mono), `components.css`, `public/brand/chambapp.svg`.
- Herramientas: Vite 8 (rolldown), TS 6, `npm test` = `node --experimental-strip-types --test tests/*.test.ts`, eslint sobre `src`, prettier.

## Arquitectura

### Por qué la extensión tiene su propia sesión

Supabase rota el refresh token: copiar la sesión de la pestaña de la app y refrescarla desde dos clientes revoca la familia de tokens y cierra la sesión en ambos. La extensión inicia sesión por su cuenta (U2). Para evitar la misma carrera **dentro** de la extensión, **solo el service worker** crea el cliente Supabase (almacenamiento propio sobre `chrome.storage.local`, `flowType: 'pkce'`, `autoRefreshToken: false`, `persistSession: true`; antes de cada operación `auth.getSession()` refresca si hace falta). Popup y página de opciones nunca hablan con Supabase: piden todo al service worker por mensajes.

### Estructura

```
extension/
  manifest.json            (plantilla; el build escribe dist/manifest.json)
  build.mjs                (vite.build() programático: páginas + SW módulo + content scripts IIFE)
  public/icons/*.png       (16/32/48/128, generados una vez desde la marca; sin dependencias nuevas)
  src/
    background/            index.ts (router de mensajes), supabase.ts, auth.ts, vault.ts, odooQueue.ts,
                           odooTasks.ts, credentials.ts, autofill.ts
    content/
      app-bridge.ts        (solo en orígenes de Chambapp)
      odoo-detect.ts       (registrado dinámicamente en el origen de Odoo)
      odoo-timesheet.ts    (inyectado con scripting.executeScript para crear la línea)
      autofill-page.ts     (función inyectada en la pestaña activa)
    popup/                 index.html, main.tsx, App.tsx, vistas: Login, Odoo, Contraseñas (lista, detalle, editor, generador)
    options/               index.html, main.tsx (dominio de Odoo, autobloqueo, cuenta)
    shared/                messages.ts (tipos + validadores), odooTask.ts, odooEntry.ts, matching.ts,
                           fields.ts, queue.ts, styles.css
```

Código de la app reutilizado por import directo (sin copiar): `src/lib/crypto/vault.ts`, `src/features/passwords/credentials.model.ts`, `src/domain/odoo.ts`, `src/domain/time.ts`, `src/lib/supabase/clientConfig.ts`, `src/lib/supabase/commandValidation.ts` (`isValidCommandResponse`), `src/lib/supabase/rowValidation.ts` (`assertCredential`, `assertVault`, `assertTask`), `src/styles/tokens.css`. Lo que hoy vive en un archivo React (`openCredential`, `encryptCredential` en `useCredentials.ts`) se mueve a `credentials.model.ts` (puro) y `useCredentials.ts` lo reexporta/importa; sin cambio de comportamiento.

Popup y opciones en **React** (como la app) con CSS propio en `extension/src/shared/styles.css` que importa `src/styles/tokens.css` y replica las clases de botón/campo/panel de `components.css` necesarias (sin importar el CSS global de la app, que asume layout de página). Fuentes vía `@fontsource` (ya dependencias). Popup 380×560 px.

### Manifest (MV3)

- `permissions`: `storage`, `alarms`, `scripting`, `activeTab`, `identity`, `tabs`, `clipboardWrite`.
- `host_permissions`: `https://chambapp-tracker.vercel.app/*`, `http://127.0.0.1:5173/*`, `https://*.supabase.co/*` (el origen exacto de `VITE_SUPABASE_URL` se escribe en el build).
- `optional_host_permissions`: `https://*/*`, `http://*/*` — solo para pedir **el origen de Odoo** configurado (U4).
- `content_scripts` estático: `app-bridge.js` en los dos orígenes de Chambapp, `run_at: document_idle`, `all_frames: false`.
- `background.service_worker` módulo; `action.default_popup`; `options_ui`; `key` fijo (clave pública generada una vez) para que el ID de la extensión sin empaquetar sea estable y la URL `https://<id>.chromiumapp.org/` pueda registrarse en Supabase.
- `content_security_policy.extension_pages`: `script-src 'self'; object-src 'self'` (por defecto MV3).
- Build: `npm run ext:build` → `extension/dist` (ignorado por git vía `dist/`). Variables `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` leídas del `.env.local` raíz; el build falla si no son válidas (`isSupabaseUrl`/`isPublicApiKey`). `npm run ext:watch` para desarrollo. Devdependency nueva: `@types/chrome`. `tsconfig.extension.json` (incluye `extension/src` + archivos de `src` importados, `types: ["chrome", "vite/client"]`); `npm run typecheck` y `lint` cubren también `extension/src`.

### Mensajería y seguridad

- Todos los mensajes llevan `type` y se validan con validadores de `shared/messages.ts`; el SW ignora/rechaza lo desconocido. El SW solo acepta mensajes de páginas propias (`sender.id === chrome.runtime.id` y `sender.url` de la extensión) salvo los tipos del puente, que solo acepta desde `app-bridge` en un origen de Chambapp (`sender.origin`), y los de detección, solo desde `odoo-detect` en el origen de Odoo configurado.
- Puente app↔extensión: la página hace `window.postMessage({source:'chambapp-app', ...}, location.origin)`; `app-bridge` exige `event.source === window` y `event.origin === location.origin`, valida y reenvía; respuestas con `source:'chambapp-extension'` y `targetOrigin = location.origin`. Nunca `'*'`.
- Secretos (contraseñas descifradas, DEK) nunca pasan por el puente ni se guardan en `chrome.storage.local`.

## A. Autenticación (SW)

- **Email/contraseña:** `signInWithPassword` en el SW.
- **OAuth:** el SW llama `signInWithOAuth({ provider, options: { redirectTo: chrome.identity.getRedirectURL('auth'), skipBrowserRedirect: true, scopes } })`, abre `chrome.identity.launchWebAuthFlow({ url, interactive: true })`, extrae `code` de la URL devuelta y llama `exchangeCodeForSession(code)` (el `code_verifier` PKCE está en el almacenamiento del SW). Se ejecuta en el SW porque el popup se cierra al abrir la ventana de login; el popup muestra «Continúa en la ventana de acceso» y al reabrirse lee el estado. Lista de proveedores = la de `src/features/auth/oauth.ts` (import directo). Errores legibles (incluido «URL de redirección no permitida: añade `https://<id>.chromiumapp.org/**` en Supabase»).
- Cerrar sesión: `signOut({ scope: 'local' })`, bloquea la bóveda y vacía caches/cola de sesión. Si el SW detecta otro `user.id` distinto del anterior, borra la cola de Odoo pendiente de ese usuario (no se procesan partes de otra cuenta).

## B. Importar tarea de Odoo

- Ajustes: el usuario escribe la URL base de Odoo (y elige el formato de fecha, ver C) (p. ej. `https://empresa.odoo.com`); se normaliza a `origin` (solo http/https, sin credenciales), se pide `chrome.permissions.request({ origins: [origin + '/*'] })` y se registra `odoo-detect.js` con `chrome.scripting.registerContentScripts` (id fijo, `matches` = ese origen, `run_at: document_idle`). Al cambiar el dominio se elimina el registro y el permiso anterior. Al arrancar el SW se comprueba que registro y permiso siguen coherentes.
- `odoo-detect` (SPA): reevalúa al cambiar la URL (`popstate`, `hashchange`, sondeo de `location.href` cada 1 s) y con `MutationObserver` limitado (debounce 300 ms). Una página es «ficha de tarea» si existe un `.o_form_view` con los campos `name` y `project_id` y la URL corresponde a `project.task` (`/odoo/.../tasks/<id>`, `/odoo/project.task/<id>`, `/odoo/action-…/<id>` con formulario de tarea, o `/web#…model=project.task…id=<id>`). Extrae con los selectores del ejemplo (título `name`, proyecto `project_id` sin prefijo `[...]`, `code` si cumple `^T\d+$` en mayúsculas) y el id de registro de Odoo. Envía `odoo-task-detected` / `odoo-task-cleared` al SW, que guarda el estado por `tabId` en `chrome.storage.session` y pone la insignia `+` (o la limpia) en esa pestaña.
- Funciones puras en `shared/odooTask.ts`: `parseOdooTaskUrl(url)` → `{ origin, recordId } | null`, `cleanProjectName`, `normalizeOdooCode`, `canonicalTaskUrl` (se guarda `normalizeOdooUrl(location.href)`), `findExistingTask(tasks, detected)` → `{ kind: 'same', task } | { kind: 'possible', task } | null` (P9-006): **`same`** solo si el `odoo_url` de la tarea tiene el mismo `origin` y el mismo `recordId`; **`possible`** si solo coincide el `odoo_id` (sin URL, o URL de otro origen/registro); `suggestProject(projects, odooProjectName)` (coincidencia exacta normalizada sin acentos/mayúsculas, si no `null`).
- Popup, sección «Tarea de Odoo» (solo si la pestaña activa tiene detección): muestra título, ID y proyecto de Odoo. `same` → «Ya está en Chambapp» con el proyecto, sin botón de añadir. `possible` → aviso «Ya hay una tarea con el ID T… en «proyecto»; puede ser de otra instancia de Odoo» y el formulario exige marcar «Crear de todos modos». Si no → formulario prellenado: título (editable, máx. 300), selector de proyecto (preseleccionado el sugerido; opción «Crear proyecto «X»» cuando no hay coincidencia; proyectos archivados/eliminados excluidos), estado `pendiente`. «Añadir a Chambapp» → SW: (opcional) `crear_proyecto {nombre}` y después `crear_tarea { proyecto_id, titulo, descripcion: null, odoo_id, odoo_url, estado: 'pendiente', estimacion_minutos: null }`, respuestas validadas con `isValidCommandResponse`/`assertTask`. Tras éxito, notifica a las pestañas de Chambapp (`workspace-changed`) para que invaliden su caché.
- **Importación serializada (P9-007):** el SW procesa las importaciones con un cerrojo único por usuario (promesa encadenada) y un mapa de importaciones en curso por `origin + recordId`: una segunda petición con la misma identidad (popup reabierto, doble clic) recibe la misma promesa. Dentro del cerrojo, primero se vuelven a cargar tareas y proyectos (`same` → no crea y devuelve la existente; proyecto homónimo creado entretanto → se reutiliza) y después se crean proyecto y tarea. Límite conocido: no hay unicidad en la BD, así que dos navegadores/dispositivos distintos importando a la vez aún podrían duplicar (documentado).
- La app escucha `workspace-changed` en `extensionBridge` e invalida `['workspace', user.id]`.

## C. Imputar en Odoo desde Parte semanal

### App (web)

- `src/features/extension/extensionBridge.ts` + `useExtension()` (contexto ligero montado en `WorkspaceLayout`): al montar envía `ping` y espera `hello` `{ version, userId | null, odooConfigured }` (reintenta 3 veces cada 500 ms; repite al recuperar el foco). Expone `available`, `connectedUserId`, `odooOrigin`, `queue` (estado reducido sin datos sensibles) y `sendToOdoo(request)`.
- `OdooSendButton` deja de ser placeholder. Estados (con `title` y `aria-label` explicativos): sin extensión → deshabilitado «Instala la extensión de Chambapp para enviar a Odoo»; extensión sin sesión o con otra cuenta → deshabilitado «Conecta la extensión con esta cuenta»; Odoo no configurado o la URL del grupo no es del origen configurado → deshabilitado con el motivo; grupo sin URL → no se muestran (como hoy el enlace). Activo → envía.
- `TimesheetGroups`: «Enviar seleccionados» (selección actual) y «Enviar todos» (todos los pendientes terminados). Construye la solicitud con una función pura nueva `buildOdooRequest(group, entries, userId)` en `timesheet.model.ts`:
  `{ requestId: uuid, userId, taskId, taskVersion, fecha (YYYY-MM-DD del grupo), odooUrl, descripcion, minutos, horasFormato 'HH:MM', partes: [{id, version}] }` con **`minutos = ceil(groupRounding(entries).loggedSeconds / 60)`** (P9-005: el redondeo sobre la suma, como «Marcar»; Odoo solo admite minutos en HH:MM, así que una duración exacta con segundos —intervalo 0— se redondea **hacia arriba** al minuto, coherente con el redondeo «superior» de la app; `loggedSeconds = 0` → no se puede enviar), `descripcion` = descripciones no vacías de los partes, sin duplicados, en orden de inicio, unidas con `" · "` y recortadas a 1000 caracteres; si no hay ninguna, el título de la tarea. Límite 1000 partes (`maxImputationEntries`). El tiempo que se enviará (`HH:MM`) se muestra en el `title` del botón y en la confirmación.
  Si `minutos > 300` se pide confirmación con `ConfirmDialog` («Vas a imputar HH:MM en Odoo»), y la solicitud lleva `confirmLong: true`.
- Mientras un grupo tenga una solicitud activa en la cola de la extensión (`pending`/`processing`/`uncertain`/`sent-unmarked`), sus botones de enviar y marcar se deshabilitan y se muestra un chip con el estado («Enviando a Odoo…», «Revisa Odoo», …); además (P9-003) esos partes quedan **bloqueados en esta pestaña**: en Parte semanal y en Registro (`EntriesTable`, `EntryModal`/`useEntryEditor`) se deshabilitan editar, eliminar y la casilla de imputado, con el motivo «Se está enviando a Odoo». El bloqueo (P9-011) cubre también a los padres: editar la tarea (`TaskForm`, incluido un formulario ya abierto: se comprueba en el `submit`), eliminar la tarea (`TaskDetail`) y eliminar el proyecto (`ProjectsPage`) con partes en cola se impiden con el mismo motivo. La comprobación se hace en el manejador (no solo deshabilitando el botón) con `useExtension().isLocked({ entryIds | taskId | projectId })`. En `error` se muestra el mensaje y «Reintentar» (reenvía el mismo `requestId`) y «Descartar». En `uncertain` (ver abajo) se muestran «No se creó en Odoo: reintentar» y «Sí se creó: marcar como imputado». En `sent-unmarked` («Se envió a Odoo pero no se pudo marcar en Chambapp») se mantiene «Marcar» habilitado para marcarlo a mano y «Descartar aviso». Al completar (`success`) el puente emite `workspace-changed` y se invalida la caché. Los estados se identifican por el conjunto de ids de parte.

### Extensión (SW `odooQueue.ts`)

- `enqueue(request)` valida: forma y tipos, `userId === sesión actual` (si no, rechaza sin encolar), `odooUrl` válida y **del origen de Odoo configurado con permiso concedido** (impide automatizar cualquier otra web), fecha ISO válida, `minutos` entero 1..1440, `horasFormato` coherente con `minutos`, descripción no vacía ≤ 1000, partes 1..1000 con uuid únicos y versiones enteras, `minutos > 300 ⇒ confirmLong`. Clave de deduplicación = ids de parte ordenados: si ya hay un elemento `pending`/`processing`/`uncertain`/`success`/`sent-unmarked` con algún parte en común, devuelve el existente y no encola (no se envía dos veces el mismo parte).
- Cola en `chrome.storage.local` (`chambapp_odoo_queue_v1`), operaciones serializadas con una promesa-cerrojo (como el ejemplo), procesamiento **secuencial** (1 a la vez). Estados: `pending → processing → success | error | uncertain | sent-unmarked`. Elementos `success` se purgan a los 7 días; `error`, `uncertain` y `sent-unmarked` quedan hasta que el usuario actúa. **`uncertain` bloquea el reenvío** de esos partes hasta que el usuario elige «No se creó: reintentar» (→ `pending`) o «Sí se creó: marcar» (→ `imputar_partes` → `success` / `sent-unmarked`).
- **Revalidación antes de escribir en Odoo (P9-003):** justo antes de abrir Odoo, el SW vuelve a leer de `partes_detalle` los partes de la solicitud y exige: todos existen, son del usuario, no eliminados, `version` igual a la solicitada, terminados, `imputacion_odoo_id` nulo, misma `tarea_id` y `fecha` que la solicitud, y la tarea (`tareas`) viva, con `version === taskVersion`, `odoo_url` igual a `odooUrl` y su proyecto vivo; recalcula `ceil(groupRounding(...)/60)` y debe coincidir con `minutos`. Si algo falla → `error` «Los partes han cambiado desde que pulsaste Enviar; vuelve a enviarlos» **sin tocar Odoo**. Durante la automatización (≈ 10–60 s) los partes están bloqueados en las pestañas de Chambapp de este navegador (ver App); una edición desde otro dispositivo en esa ventana hace fallar `imputar_partes` por versión → `sent-unmarked` visible, nunca un silencio.
- `processItem`: abre `chrome.windows.create({ url: odooUrl, focused: false, type: 'normal' })`, espera `status === 'complete'` e inyecta `odoo-timesheet.js` con `chrome.scripting.executeScript({ target: { tabId }, files })`. Comunicación por `chrome.runtime.connect` (puerto) con un **intento identificado (P9-004)**: el SW envía `{ attemptId (uuid), deadline (ahora + 90 s), fecha, descripcion, horasFormato }`; el script guarda `window.__chambappAttempt` y rechaza un segundo intento en la misma pestaña; antes de **cada** paso comprueba que no ha pasado el `deadline`, que no ha recibido `cancel` y que la URL sigue en el origen configurado, y si no, se detiene sin hacer más clics. El script informa fases informativas (`line-dialog`, `filled`, …) por el puerto.
- **Frontera de escritura con confirmación (P9-008):** antes del **primer clic que pueda guardar algo en el servidor** («Guardar y cerrar» de la línea; se trata así aunque en algunas versiones solo guarde en local), el script envía `about-to-write { attemptId }` y **se detiene hasta recibir `write-ack { attemptId }`**. El SW solo responde `write-ack` **después** de haber persistido `phase: 'may-have-written'` en `chrome.storage.local`. Sin `write-ack` en 5 s, o con `cancel`, el script aborta sin hacer clic. Así, una interrupción con la fase persistida anterior a `may-have-written` garantiza que no se pulsó nada que guarde; con `may-have-written` o posterior, el resultado es dudoso.
- **Verificación del guardado (P9-002, P9-010)** (sustituye a la firma visual/palabras del ejemplo): 0. **Formato de fecha (P9-IR-004):** en Ajustes se elige el formato de fecha del Odoo (`dd/mm/aaaa` por defecto, `mm/dd/aaaa`, `aaaa-mm-dd`); se usa para escribir la fecha y para comparar, sin adivinar por el idioma ni aceptar día/mes intercambiados. Las filas sin celdas `date`/`name`/`unit_amount` hacen el recuento no verificable (→ `uncertain` tras la frontera).
  1. Antes de la frontera, el script cuenta las líneas que coinciden exactamente con (fecha en el formato configurado, descripción, tiempo) **en todas las páginas** de la lista «Partes de horas» del formulario: lee el paginador del x2many (`.o_pager_value` / `.o_pager_limit`, p. ej. «1-40 / 85») y recorre las páginas con «Siguiente» hasta cubrir el total (el paginador de Odoo da la vuelta, por eso se usa el total y no el botón deshabilitado); después vuelve a la primera → `n0`. Si no puede leer todas las páginas → `error` sin escribir.
  2. Tras «Guardar y cerrar» de la línea: el diálogo debe cerrarse y no puede haber campos inválidos (`.o_field_invalid`, `.o_invalid`), diálogos de error (`.o_error_dialog`, `.modal .o_dialog_warning`) ni notificaciones de peligro (`.o_notification.border-danger`, `.text-bg-danger`, `.o_notification_manager .bg-danger`). Si aparece cualquiera → el script informa `failed` con su texto.
  3. Tras «Guardar manualmente»: se espera a que el formulario deje de estar sucio (el botón de guardado manual desaparece o queda deshabilitado **y** el indicador `.o_form_status_indicator` no marca cambios) sin errores como en 2; el script informa `form-saved` o `failed`.
  4. **Recarga esperada (P9-009):** antes de recargar, el SW persiste `phase: 'reloading'` y marca la desconexión del puerto actual como esperada; después `chrome.tabs.reload`, espera `complete` y ejecuta el verificador de solo lectura con `chrome.scripting.executeScript({ func: countMatchingLines, args: [attemptId, fecha, descripcion, horasFormato] })`, que **devuelve** el resultado (sin puerto). El verificador cuenta igual que en 1, recorriendo todas las páginas → `n1`. La desconexión del puerto solo se trata como interrupción si la fase persistida no es `reloading`/`verifying`/`done`; cerrar la ventana tras `done` tampoco es interrupción.
  5. Resultado: **solo `n1 === n0 + 1` es éxito**. Tras `may-have-written`, cualquier otro resultado (igual, distinto, paginación incompleta, error al leer, `failed` informado después de la frontera) → **`uncertain`**, nunca `error`. `error` (reintento seguro) solo existe antes de la frontera.
- Timeout, cierre de la pestaña, SW suspendido (al arrancar, cualquier `processing` huérfano) o pérdida inesperada del puerto: si la fase **persistida** es anterior a `may-have-written` → se envía `cancel`, **se cierra la pestaña** y queda `error` (seguro reintentar). Si es `may-have-written` o posterior → se envía `cancel`, la pestaña se deja abierta y queda **`uncertain`** («Revisa en Odoo si la línea se creó»). Nunca se reintenta solo. Un `chrome.alarms` cada minuto mantiene la cola avanzando y resuelve huérfanos.
- Tras éxito verificado: se cierra la ventana; **antes de marcar (P9-011)** el SW vuelve a leer la tarea y exige la misma `version` capturada al encolar (`taskVersion`), el mismo `odoo_url` y que tarea y proyecto sigan vivos; si cambió → `sent-unmarked` «La tarea cambió durante el envío: revisa a qué tarea de Odoo se imputó antes de marcar». Si no, llama `imputar_partes { partes }` con la sesión del SW, validado con `isValidCommandResponse`. Éxito → `success`; fallo (versión, red, sesión) → `sent-unmarked` con el motivo. En ambos casos se emite `queue-updated` y `workspace-changed` a las pestañas de Chambapp. Error de Odoo → la ventana se deja abierta para revisión.
- `queue-updated` hacia la app solo incluye `{ requestId, entryIds, status, error }` (sin descripción ni URL de otras cuentas; solo los del usuario actual).
- El popup muestra un resumen de la cola (en curso / errores / a revisar / enviados sin marcar) con las mismas acciones que la app («Reintentar», «Descartar», y en `uncertain` «No se creó: reintentar» / «Sí se creó: marcar»).

## D. Gestor de contraseñas

### Bóveda (SW `vault.ts`)

- `unlock(password)`: lee `bovedas` del usuario (`assertVault`), deriva y desenvuelve la DEK. Se añade a `src/lib/crypto/vault.ts` una función exportada `unlockVaultExtractable` (mismo `unwrap` con `extractable: true`) y `exportRawKey`/`importRawKey` mínimas; la app no cambia su comportamiento (sigue usando `unlockVault` no extraíble).
- La DEK bruta (base64url) se guarda **solo** en `chrome.storage.session` junto con `generacion`, `userId` y `expiresAt`; `chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` (los content scripts no pueden leerla). Se borra al bloquear, cerrar sesión, cambiar de usuario, caducar o cerrar el navegador. El SW reimporta la clave como no extraíble en cada arranque.
- Autobloqueo configurable (5, 15 —por defecto—, 30, 60 min de inactividad o «al cerrar el navegador»); cada uso renueva `expiresAt`; `chrome.alarms` comprueba la caducidad cada minuto. Botón «Bloquear» en el popup.
- Si la generación de la bóveda en servidor cambia (clave restablecida en la app), se bloquea y se pide la clave de nuevo. Sin bóveda creada → mensaje «Crea tu clave maestra en Chambapp» con enlace a Ajustes.
- 5 intentos fallidos seguidos → espera de 30 s antes del siguiente (solo UX; la seguridad real es PBKDF2).

### Credenciales (SW `credentials.ts`)

- `list()`: `credenciales_detalle` del usuario (paginado como `loadCredentials`, `assertCredential`), descifra con `openCredential` (filas de otra generación o ilegibles → «No se puede leer», como la app). Caché en memoria del SW mientras está desbloqueada; se vuelve a pedir al abrir el popup.
- El popup recibe la lista **sin valores secretos** (`{id, proyecto, nombre, url, campos:[{id, etiqueta, secreto, valor si no es secreto}]}`); los secretos se piden uno a uno (`reveal`/`copy`/`autofill`) y nunca se cachean en el popup más allá de la vista abierta.
- `save(input)`: crea o edita con `credentialProblem`/`normalizeCredential`, cifra con `encryptCredential`, `guardar_credencial` (validado; `MAX_CREDENTIAL_ENVELOPE`), proyecto obligatorio (selector de proyectos vivos). Conflicto de versión → mensaje y recarga. Eliminar queda en la app (fuera de alcance).
- `generatePassword` reutilizado; el generador del popup permite longitud 12–64 y copiar/usar en el campo.

### Coincidencia con la web actual (`shared/matching.ts`, puro)

- `matchCredentials(items, tabUrl)` (P9-001: sin heurística de «dominio base», que uniría inquilinos de un mismo hosting como `chambapp-tracker.vercel.app` y `otro.vercel.app`): solo http/https; se compara el host en minúsculas quitando un único `www.` inicial.
  - **`exact`** («Esta web»): mismo host (y mismo puerto si la entrada lo indica). Único caso en que «Rellenar» actúa sin confirmación.
  - **`subdomain`** («Relacionada»): el host de la pestaña termina en `.` + host de la entrada (p. ej. entrada `empresa.com`, pestaña `login.empresa.com`). Se sugiere, pero rellenar exige confirmación mostrando ambos hosts.
  - Cualquier otro caso → no se sugiere; si el usuario busca y elige «Rellenar», confirmación explícita con ambos hosts.
  - IPs y `localhost`: solo `exact` con host+puerto.

### Autocompletar (`autofill.ts` + `autofill-page.ts`)

- Campos a usar (`shared/fields.ts`, puro): usuario = primer campo no secreto cuya etiqueta coincide con `/usuario|user|email|correo|login|nombre de usuario/i`, si no el primer campo no secreto; contraseña = primer campo secreto cuya etiqueta coincide con `/contraseña|password|clave|pass/i`, si no el primer secreto.
- Solo con acción del usuario (botón «Rellenar» en el popup → `activeTab`). El SW vuelve a leer la URL actual de la pestaña justo antes de inyectar (puede haber navegado), exige http(s) y aplica `matchCredentials`: solo `exact` **sobre HTTPS** rellena sin preguntar; `subdomain`, otro host o cualquier página `http:` (incluida la bajada de HTTPS a HTTP) exigen la confirmación explícita del popup, ligada al origen completo (`confirmedOrigin` = esquema+host+puerto actual, si no se rechaza), y la función inyectada vuelve a comprobar `location.origin` (P9-IR-003).
- `scripting.executeScript({ target: { tabId, frameIds: [0] }, func: fillLogin, args: [username, password] })` (solo marco principal: los iframes de terceros no reciben secretos). `fillLogin` busca el `input[type=password]` visible y habilitado (o el primer visible), el campo de usuario anterior en el mismo `form` (`email`/`text`/`autocomplete=username`), y rellena con el setter nativo + `input`/`change`. Si no hay campo de contraseña (login en dos pasos), rellena solo el usuario. Devuelve qué rellenó; no envía el formulario.
- Copiar: `navigator.clipboard.writeText` desde el popup; se limpia el portapapeles a los 30 s si sigue conteniendo ese valor (mejor esfuerzo, desde el popup si sigue abierto).

## E. Interfaz del popup

- Cabecera con marca Chambapp, cuenta y menú (Ajustes, Bloquear, Cerrar sesión). Pestañas «Odoo» y «Contraseñas» (`SegmentedControl` visual de la app); si la pestaña activa es una tarea de Odoo detectada, abre en «Odoo».
- Sin sesión: pantalla de acceso (email/contraseña + botones de proveedores como en `AuthPage`).
- Contraseñas bloqueadas: campo clave maestra + «Desbloquear». Desbloqueadas: buscador (`credentialMatches`), bloque «Esta web» arriba, lista agrupada por proyecto, detalle con campos (mostrar/ocultar, copiar), «Rellenar», «Abrir web» (`safeUrl`), «Editar»; «Nueva entrada» (prellenada con la URL de la pestaña actual y su host como nombre).
- Estados vacíos/carga/error con los estilos de la app; todo accesible por teclado, foco visible, textos en español.
- Página de opciones: dominio Odoo (+ estado del permiso), autobloqueo, cuenta conectada, versión.

## F. Cambios en la app

- `OdooSendButton.tsx`, `TimesheetGroups.tsx`, `timesheet.model.ts` (`buildOdooRequest`), `EntriesTable.tsx`/`EntryModal.tsx`/`useEntryEditor.ts`/`TaskForm.tsx`/`TaskDetail.tsx`/`ProjectsPage.tsx` (bloqueo de partes, tareas y proyectos en envío), `WorkspaceLayout.tsx` (proveedor del puente), nuevo `src/features/extension/*`, `credentials.model.ts`/`useCredentials.ts` (mover funciones puras), `src/lib/crypto/vault.ts` (export extraíble). Sin migraciones de BD.
- `docs/extension.md`: instalación, configuración de Supabase (Redirect URL OAuth), prueba manual, permisos y modelo de seguridad.
- `README.md`: enlace a `docs/extension.md`.
- `Extension_App/` se deja intacta (referencia del usuario).

## Criterios de aceptación

1. `npm run ext:build` genera `extension/dist` cargable en Chrome/Edge («Cargar descomprimida») sin errores en `chrome://extensions`.
2. Login por email y por OAuth (con la Redirect URL registrada) en la extensión; la sesión de la app en la web no se cierra.
3. Con el dominio de Odoo configurado, abrir una tarea de Odoo pone la insignia; el popup ofrece añadirla con proyecto sugerido; tras «Añadir», la tarea aparece en Chambapp con título, ID T…, URL; repetir muestra «Ya está en Chambapp».
4. En Parte semanal, con la extensión conectada a la misma cuenta, «Enviar seleccionados» crea **una** línea en Odoo con fecha, descripción y tiempo redondeado sobre la suma (al minuto superior), y los partes quedan imputados en Chambapp solo tras comprobar la línea guardada al recargar Odoo; un segundo clic no duplica; si los partes cambiaron antes del envío, no se toca Odoo; un guardado fallido o lento no marca nada; un proceso interrumpido o no verificable después del primer clic de guardado queda «a revisar» y no se reenvía solo; editar o borrar la tarea/proyecto de partes en envío está bloqueado. Sin extensión, botones deshabilitados con el motivo.
5. Contraseñas: desbloquear con la clave maestra de la app; ver, buscar, copiar, generar, crear y editar entradas que luego se ven en la app; «Rellenar» completa usuario y contraseña en un login real; autobloqueo funciona; tras cerrar el navegador pide la clave.
6. La extensión no pide permisos de host salvo Chambapp, Supabase y el Odoo configurado.
7. Typecheck, lint, tests, build de la app, build de la extensión y prettier en verde.

## Verificación

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run ext:build`, `npm run format:check`.
- Tests nuevos (`node --test`, puros): `tests/extensionOdooTask.test.ts` (`parseOdooTaskUrl` con URLs reales de Odoo 16/17/18, `cleanProjectName`, `normalizeOdooCode`, `findExistingTask` `same`/`possible`/null incluido mismo `T…` en otro origen, `suggestProject`), `tests/extensionMessages.test.ts` (validadores de mensajes y de la solicitud de Odoo: origen, usuario, minutos/HH:MM, >5 h, límites), `tests/extensionQueue.test.ts` (dedupe por solape de partes incluidos `uncertain`/`sent-unmarked`, transiciones, huérfano `processing` antes de `may-have-written` → `error` y desde ahí → `uncertain`, desconexión esperada en `reloading` no es interrupción, `failed` tras la frontera → `uncertain`, `write-ack` solo tras persistir, `uncertain` bloquea reenvío, revalidación `revalidateEntries` contra filas cambiadas: versión, imputado, otra tarea/fecha, eliminado, URL distinta, duración distinta; resultado de verificación `n0/n1` → solo `n0+1` es success y el resto uncertain; tarea con otra versión/URL antes de marcar → `sent-unmarked`; purga), `tests/extensionImport.test.ts` (cerrojo de importación: dos importaciones simultáneas de la misma identidad crean una sola tarea con un repositorio falso), `tests/extensionMatching.test.ts` (host exacto, `www`, subdominio → `subdomain`, inquilinos distintos de `vercel.app`/`github.io`/`odoo.com` → sin coincidencia, `co.uk`, IP/puerto, no http), `tests/extensionFields.test.ts` (elección de campos usuario/contraseña), `tests/timesheet.test.ts` (`buildOdooRequest`: redondeo sobre la suma, intervalo 0 con 61 s → 2 min `00:02`, 0 s → no enviable, descripciones, fallback al título, HH:MM), `tests/vault.test.ts` (clave extraíble importada/exportada descifra lo cifrado por la clave no extraíble de la app).
- Arnés Odoo falso `tools/ext-smoke/odoo-task.html` (réplica mínima con los ids/clases que usa el ejemplo, guardado simulado con persistencia en `localStorage` para que la recarga muestre las líneas) con modos por query: normal, guardado lento (3 s con aspecto de carga estable), guardado rechazado (notificación de error con la palabra «guardado»), campo inválido, y cierre a mitad. En Playwright con la extensión cargada: normal → `success` y 1 línea; lento → `success` sin falso positivo previo; rechazado/inválido tras la frontera → `uncertain` sin marcar; **paginado** (45 líneas antiguas, la nueva cae en la página 2) → `success`; cerrar la pestaña antes de la frontera → `error` y sin línea; después → `uncertain`. Se compara además con `procesarParteOdoo` del ejemplo en modo normal: mismos valores en los campos y misma secuencia de clics.
- Prueba en navegador real con Playwright (Chromium con `--load-extension`): carga sin errores, popup renderiza (captura), detección en `tools/ext-smoke/odoo-task.html` servido en un origen configurado, autocompletar en una página de login de prueba, y en la app de desarrollo (`npm run dev` + ui-smoke si hace falta) los botones de Parte semanal cambian de estado al detectar la extensión.
- Manual con cuentas reales (lo hace el usuario; se documenta en `docs/extension.md`): Odoo real, OAuth real, bóveda real.

## Riesgos y límites

- La automatización depende del DOM y de los textos de Odoo (es/en): versiones distintas de Odoo pueden requerir ajustar selectores; se centralizan en `odoo-timesheet.ts`.
- Un SW suspendido o una caída a mitad del guardado puede dejar dudas sobre si Odoo creó la línea; queda `uncertain`, bloquea el reenvío y el usuario decide (nunca se reintenta solo).
- El bloqueo de edición durante el envío solo cubre las pestañas de Chambapp de este navegador; una edición desde otro dispositivo en esos segundos acaba en `sent-unmarked` (visible). Las importaciones simultáneas desde dos navegadores pueden duplicar la tarea (sin unicidad en BD).
- Las duraciones con segundos (intervalo 0) se envían a Odoo redondeadas al minuto superior.
- La DEK vive en `chrome.storage.session` (memoria del navegador) mientras está desbloqueada, como hacen otros gestores MV3; malware local con acceso al proceso del navegador podría leerla.
- No hay captura automática de contraseñas ni menú en línea en los campos (U3); requeriría permisos en todos los sitios.
- El ID estable depende de la `key` del manifest; si se publica en la Chrome Web Store, el ID será el de la tienda y habrá que registrar también esa Redirect URL.
- Sin commit ni push.
