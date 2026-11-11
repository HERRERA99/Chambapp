# Plan 10 — Robustez del envío a Odoo, descripción elegible y Firefox 0.2.0

## Objetivo

Aplicar en el **código fuente** (no en `dist/`) las correcciones que el usuario probó a mano sobre el bundle minificado, añadir un diálogo para elegir/editar la descripción de la línea de Odoo, mantener la ventana de Odoo en primer plano mientras renderiza y publicar una nueva build firmada de Firefox.

Correspondencia de nombres minificados → fuente:
`c()` = `detect()` (`extension/src/content/odoo-detect.ts`); `f()` = `onRecord()`, `u()` = `check()`, `M()` = `run()`, `a` = `active` (`extension/src/content/odoo-timesheet.ts`).

## Cambios

### 1. Detección de tarea (`odoo-detect.ts`, `shared/odooTask.ts`)
- `detect()` acepta `[name="project_id"]` **o** `[name="display_project_id"]` como campo de proyecto (junto con `[name="name"]`).
- Selectores de proyecto añaden `[name="display_project_id"] input`, `[name="display_project_id"] a`, `[name="display_project_id"]` (además de los actuales).
- Nuevo helper puro `splitTaskTitle(title): { code: string | null; title: string }` en `shared/odooTask.ts`: si el título empieza por `[T<dígitos>]` (regex `^\s*\[(T\d+)\]\s*`, sin distinguir mayúsculas), devuelve el código normalizado con `normalizeOdooCode` y el título sin ese prefijo; si no, `{ code: null, title }`. Si al quitar el prefijo el título quedara vacío, se conserva el título original.
- `detect()` usa el campo `code` si existe; si no, el código del título. El título importado queda sin el prefijo `[T…]` (coherente con `cleanProjectName`, que ya quita `[P…]`).

### 2. `onRecord()` / comprobación de tarea abierta (`odoo-timesheet.ts`)
- Separar en dos funciones:
  - `onTaskUrl(recordId)`: solo la URL (`parseOdooTaskUrl(..., { assumeTask: true })?.recordId === recordId`).
  - `taskFormReady()`: existe `.o_form_view [name="project_id"]` o `.o_form_view [name="display_project_id"]` o `.o_form_view #display_project_id` fuera de `.modal`.
  - `onRecord(recordId) = onTaskUrl(recordId) && taskFormReady()` (se mantiene para `count()`).
- Todas son funciones de nivel superior del módulo, así que el problema de TDZ (punto 5 del usuario: `Cannot access 'f' before initialization`) no existe en el fuente; no se crea un helper `F` adicional. Se verifica con el bundle compilado (ver Verificación).

### 3. Limpiar el intento activo
- `run()` tiene un `finally` que, además de `clearInterval(heartbeat)`, hace `active = null` **solo si** `active === session` (el objeto de ese intento). El script **no** desconecta el puerto: lo hace el worker tras liquidar (ver abajo), para evitar la carrera entre el mensaje final y la desconexión (hallazgo P10-01).
- Los listeners del puerto en `start()` se atan al objeto del intento (`session`), no a la variable global: `cancel` y `onDisconnect` solo marcan `session.cancelled`, de modo que el puerto de un intento anterior nunca cancela el intento nuevo. `write-ack` solo resuelve si `active === session`.
- Worker (`odooQueue.ts`): al recibir `form-saved` o `failed`, `onScriptMessage` marca **de forma síncrona** `attempt.expectDisconnect = true` y `attempt.terminal = true` antes de cualquier `await`; así una desconexión durante la escritura en `chrome.storage` no liquida el intento como "interrupted". `settle()` desconecta el puerto (`port.disconnect()` en try/catch) después de liquidar.
- Así un segundo `start()` en la misma página (reintento o dos partes seguidos en la misma tarea) no devuelve `false`.
- Test de regresión (`tests/extensionAttemptPort.test.ts`): se extrae la lógica de mensajes terminales a una función pura/testeable o se prueba con un puerto falso: se retrasa la escritura de `form-saved` y se entrega `onDisconnect` durante ese retraso → el resultado es `form-saved`, no `interrupted`.

### 4. Arranque tolerante a la carga de Odoo
- `start()` solo comprueba `!active`, `location.origin === config.origin` y `onTaskUrl(config.recordId)`.
- `check()` comprueba URL siempre; la presencia del formulario solo una vez visto (`active.formSeen = true`).
- Al inicio de `run()`: `await waitFor('el formulario de la tarea', taskFormReady, 60_000)`; tras aparecer, `active.formSeen = true` y entonces `post(phase: 'counting')` (antes se enviaba al principio). Mensaje de error si no aparece: «Odoo no mostró la tarea en 60 s. Comprueba que has iniciado sesión y vuelve a intentarlo.» (lo lanza `waitFor` vía etiqueta; se ajusta el texto con un `try/catch` que relanza ese mensaje).
- Nueva API del script `ready(recordId, timeoutMs)`: espera hasta `timeoutMs` (máx. 60 s) a `onRecord(recordId)` y devuelve `true/false`. La usa la verificación para saber cuándo ha renderizado la tarea tras la recarga.
- `count(recordId, fecha, format, descripcion, horas, deadline)` recibe un **deadline absoluto**: `waitFor` y cada paso de `countAll` (incluida la paginación) lanzan si `Date.now() > deadline`, y `count` devuelve `null`. Así la verificación entera queda acotada (hallazgo P10-02).
- Presupuestos de tiempo en el worker (`odooQueue.ts`): `ATTEMPT_MS` sube de 90 s a 150 s (deadline del script y temporizador del worker), para que quepan 60 s de espera + el resto. `VERIFY_MS` sube de 60 s a 120 s y pasa a ser el **límite total** de la verificación (recarga + `ready` + `count`): se calcula `verifyDeadline = Date.now() + VERIFY_MS` antes de recargar, se pasa a `count`, y además la verificación se envuelve en un `Promise.race` con un temporizador hasta `verifyDeadline + 5 s`; si vence, `after = null` → estado `uncertain`, se libera la cola. `resolveOrphans` usa `ATTEMPT_MS + VERIFY_MS`.

### 5. Ventana de Odoo en primer plano hasta que renderiza (`odooQueue.ts`)
- Se abre siempre con `focused: true` (`chrome.windows.create({ url, type: 'normal', focused: true })`); se elimina el intento con `focused: false` y su fallback.
- Nuevo helper `holdFocus(windowId): () => void`: cada 500 ms comprueba `chrome.windows.get(windowId)`; si `focused === false` llama `chrome.windows.update(windowId, { focused: true })` (errores ignorados; si la ventana ya no existe, se detiene). Devuelve la función que lo para. Si el estado de la ventana es `minimized`, `update` con `focused: true` la restaura (comportamiento de Chrome y Firefox); además se pasa `state: 'normal'` cuando `state === 'minimized'`.
- `holdFocus` tiene además un **tope independiente** de 75 s: pasado ese tiempo deja de reclamar el foco aunque nadie lo pare. La función de parada es idempotente y se llama siempre en `finally`.
- Durante el intento: se activa justo después de crear la ventana y se para al llegar `phase: 'counting'` (formulario renderizado), al liquidarse el intento o al tope (lo que ocurra antes).
- Durante la verificación: se activa antes de `chrome.tabs.reload` y se para en cuanto `ready()` devuelve (la tarea ha renderizado), antes de contar; nunca durante la paginación del recuento. Siempre se para en el `finally` de la verificación.
- No se devuelve el foco a la ventana anterior: en éxito la ventana se cierra sola; en error queda abierta para que el usuario vea Odoo.

### 6. Diálogo de descripción al enviar (app: `src/features/timesheet/`)
- Helper puro `odooDescriptionChoices(entries)` en `timesheet.model.ts`: descripciones recortadas, no vacías y únicas de los partes terminados y pendientes que se enviarían, en el mismo orden que hoy (por `inicio_en`, luego `id`).
- `buildOdooRequest` acepta `descripcion?: string` opcional. Si viene, se usa (recortada y limitada a `MAX_ODOO_DESCRIPTION`); si queda vacía, devuelve `{ problem: 'Escribe una descripción para el parte.' }`. Sin ella, el comportamiento actual no cambia (unión con « · » o título).
- `TimesheetPage.send()`: si `choices.length === 1` envía como ahora (con esa descripción). Si `choices.length !== 1` (ninguna o varias, sea uno o varios partes), abre `OdooDescriptionDialog` en lugar de enviar.
- Nuevo componente `components/OdooDescriptionDialog.tsx` (usa `Modal`, `Button`, estilo existente):
  - Título «Descripción del parte en Odoo»; texto con tarea, fecha y horas.
  - Si hay varias descripciones: lista de radio con cada una + opción «Escribir otra».
  - Siempre un `textarea` editable (máx. `MAX_ODOO_DESCRIPTION`, contador). Al elegir una opción, el textarea se rellena con ella y el usuario puede modificarla. Valor inicial: la primera descripción; si no hay ninguna, el título de la tarea.
  - Botones «Cancelar» y «Enviar a Odoo» (deshabilitado si el texto está vacío). Al confirmar, se reconstruye la petición con `buildOdooRequest({ ..., descripcion })` y continúa el flujo normal: si supera 5 h, se abre la confirmación de horas largas ya existente; si no, `dispatch`.
- La extensión no necesita cambios para esto: `revalidationProblem` no compara la descripción, y `odooRequestProblem` ya valida no vacía y ≤ 1000.

### 7. Versión y firma de Firefox
- `extension/manifest.json` `version` 0.1.0 → 0.2.0.
- `npm run ext:sign:firefox` (credenciales AMO ya en `.env.local`) → `extension/signed/chambapp-firefox-0.2.0.xpi`. Se conserva el 0.1.0.
- `npm run ext:pack` para regenerar las descargas de la app con el xpi firmado.
- `docs/extension.md`: breve nota de los cambios (versión, diálogo de descripción, foco de la ventana).

## No objetivos
- No se cambia el protocolo app↔extensión ni el esquema de la base de datos.
- No se automatiza la selección de idioma/versión de Odoo más allá de los selectores añadidos.
- No se publica en AMO como listado (sigue el canal `unlisted`).

## Supuestos (con fuente)
- Odoo del usuario usa `name="display_project_id"` y títulos `[T457973] …` — pegado por el usuario, confirmado en su consola.
- `revalidationProblem` no comprueba la descripción — `extension/src/shared/queue.ts:149-200`.
- Firefox acepta `focused: true` en `windows.create` y `windows.update`; rechazaba `focused: false` — comentario existente en `odooQueue.ts`.
- Credenciales AMO presentes en `.env.local` (2 líneas `AMO_API_*`).

## Riesgos
- Robar el foco repetidamente puede molestar si Odoo tarda; se limita a la fase de renderizado, con tope de 75 s por fase.
- La firma en AMO depende de la red y de la revisión automática de Mozilla; una versión solo se puede firmar una vez.

## Verificación
1. `npm run typecheck` — sin errores.
2. `npm run lint` — sin errores.
3. `npm run format:check` — sin errores (o `npm run format` sobre los ficheros tocados).
4. `npm test` — todo verde, con tests nuevos:
   - `tests/extensionOdooTask.test.ts`: `splitTaskTitle('[T457973] Revisar')` → `{ code: 'T457973', title: 'Revisar' }`; sin prefijo → `code: null`; `[P0431] X` → `code: null`; título solo `[T1]` → conserva el original.
   - `tests/extensionAttemptPort.test.ts`: carrera `form-saved` + desconexión (ver §3).
   - `tests/timesheet.test.ts`: `odooDescriptionChoices` (vacías, duplicadas, orden); `buildOdooRequest` con `descripcion` (se usa, se recorta, vacía → problema) y sin ella igual que antes.
5. `node extension/build.mjs` — compila; en `extension/dist/content/odoo-timesheet.js` y `odoo-detect.js` aparecen `display_project_id`; se carga el bundle `odoo-timesheet.js` en Node con un `globalThis` falso mínimo (`chrome`, `document`, `location`) para comprobar que evaluar el IIFE y llamar a `start()` no lanza `ReferenceError` (TDZ).
6. Comprobación DOM con Playwright sobre un HTML fijo que imita el formulario del usuario (`name="display_project_id"`, título `[T457973] …`): inyectar `odoo-detect.js` con un `chrome.runtime.sendMessage` falso y comprobar la tarea detectada (código `T457973`, proyecto `Kialens`); inyectar `odoo-timesheet.js`, llamar `start()` antes de que exista el formulario → devuelve `true`; añadir el formulario más tarde → avanza a `counting`; tras liquidar, un segundo `start()` devuelve `true`; un `cancel` o desconexión del puerto antiguo no cancela el intento nuevo; `count()` con un deadline ya vencido devuelve `null` sin esperar.
7. Manual (usuario, en su Odoo real): enviar dos partes seguidos de la misma tarea; enviar un grupo con descripciones distintas y uno sin descripción (aparece el diálogo); la ventana de Odoo aparece al frente y recupera el foco si se cambia de ventana durante la carga.
8. `npm run ext:sign:firefox` termina con «Firmada: …chambapp-firefox-0.2.0.xpi»; `npm run ext:pack` informa «xpi firmado».
