# Plan 6 — Cifrado de notas, gestor de contraseñas, búsqueda en notas y limpieza de Mi semana

Base: rama `feat/refactor-final-front` en a78b84d (árbol limpio). Petición directa del usuario.

## Objetivo

1. **Notas cifradas** de extremo a extremo: el servidor (Supabase, backups, quien tenga la service key) no puede leer título ni contenido.
2. **Mi semana**: se elimina el panel de tarjetas por día (DayCard) con sus tareas.
3. **Notas · búsqueda por texto**: la búsqueda encuentra notas por su contenido y lo hace visible.
4. **Gestor de contraseñas** nuevo en la sección «Trabajo» del menú: entradas por proyecto, cada una con usuario y contraseña por defecto y campos personalizados añadibles. Todo cifrado. Mismo estilo visual que el resto.

## Decisiones confirmadas por el usuario

- **D1 Cifrado con clave maestra en el navegador** (no cifrado en servidor). Si se olvida la clave maestra, los datos cifrados son irrecuperables.
- **D2 Mi semana**: la navegación de semana (anterior / Hoy / siguiente + insignia) pasa a la cabecera de la página; se elimina la edición del objetivo por día (DayGoalModal). El reparto semanal sigue configurándose en Ajustes.

## Reconocimiento (fuentes)

- Notas: tabla `public.notas` + vista `notas_detalle` + RPC `chambapp_notas` (`supabase/migrations/20261027144005_markdown_notes.sql`, ajustes en `20261027144408_notes_link_consistency.sql`). Cliente: `src/features/notes/*`, carga en `loadWorkspace` (`src/lib/supabase/workspace.repository.ts`), validación en `rowValidation.assertNote` y `commandValidation.isValidCommandResponse`. Borradores en `sessionStorage` (`NoteEditor.tsx` l.92-98, `notesDraft.ts`) — hoy en texto plano.
- Las notas se muestran también en `src/features/tasks/components/TaskNotes.tsx` (detalle de tarea) y `ProjectsPage.tsx` importa `normalizeNoteSearch`.
- Búsqueda: `noteMatchesSearch` (`notes.model.ts`) **ya** compara título + contenido; pero sugerencias y extractos muestran siempre los primeros 90-100 caracteres, así que una coincidencia en el cuerpo no se ve y parece que solo busca por título. Tras cifrar, la búsqueda sigue siendo local sobre texto descifrado.
- Mi semana: `src/features/week/WeekPage.tsx` l.213-253 (Panel con `DayCard`, navegación en `action`), `DayCard.tsx`, `DayGoalModal.tsx`; `EntryModal` solo se abre desde `DayCard`.
- Menú: `src/app/layouts/WorkspaceLayout.tsx` (sección `trabajo`), rutas `src/app/paths.ts` + `src/app/App.tsx`.
- Login puede ser OAuth (`docs/oauth.md`), así que no hay contraseña de cuenta utilizable para derivar claves → clave maestra propia.
- Pruebas: `npm test` (node --test con strip-types; Node 24 tiene WebCrypto global), `npm run db:test` (embedded-postgres, `tools/db-tests/*.mjs`), typecheck, lint, build, format:check. No hay Docker.

## Diseño

### A. Bóveda (clave maestra) — compartida por notas y contraseñas

**Criptografía (WebCrypto, sin dependencias nuevas)** — módulo puro `src/lib/crypto/vault.ts`:
- KEK = PBKDF2-SHA-256(clave maestra normalizada NFC, sal aleatoria 16 B, **600 000** iteraciones) → AES-GCM-256, no extraíble, uso `wrapKey/unwrapKey`.
- DEK = AES-GCM-256 aleatoria. Se guarda envuelta con la KEK (AES-GCM, IV 12 B, AAD `chambapp:boveda:v1:<usuario_id>`). Desenvolver falla (OperationError) con clave incorrecta → «Clave maestra incorrecta». La DEK desenvuelta para uso normal es **no extraíble** (`encrypt/decrypt`). Solo el flujo «cambiar clave maestra» la desenvuelve extraíble un instante para reenvolverla (no se re-cifran los datos).
- Sobre cifrado (texto): `v1.<base64url(iv)>.<base64url(ciphertext+tag)>`; IV aleatorio de 12 B por cifrado. Plaintext: **notas** en formato binario `[u32 BE longitud título][título UTF-8][contenido UTF-8]` (sin escapes JSON: tamaño máximo predecible y contenido conservado byte a byte, BOM/CRLF incluidos); **credenciales** en JSON UTF-8 (caracteres de control prohibidos, ver E). **AAD** obligatoria que ata el sobre a su fila: `chambapp:nota:v1:<usuario_id>:<nota_id>` y `chambapp:credencial:v1:<usuario_id>:<credencial_id>`. Mover un sobre a otra fila/usuario hace fallar el descifrado.
- Requisitos de clave maestra: mínimo 12 caracteres, confirmación al crearla; aviso explícito de que no es recuperable.
- Funciones exportadas y testeables en Node: `createVault`, `unlockVault`, `rewrapVault`, `encryptJson`, `decryptJson`, `parseEnvelope`.

**Persistencia** — nueva migración `supabase/migrations/20261104120000_encrypted_notes_and_credentials.sql`:
- `public.bovedas` (1 fila por usuario): `usuario_id` pk → perfiles on delete cascade, `generacion uuid not null` (nueva en cada creación de bóveda; no cambia al cambiar la clave maestra porque la DEK es la misma), `sal text`, `iteraciones int check (>= 100000)`, `clave_envuelta text`, `creado_en`, `actualizado_en`, `version`. RLS propietario; `authenticated` solo tiene `select`; **sin DML directo**.
- **Modelo de permisos** (R01, patrón `chambapp_configurar_odoo`): implementaciones `chambapp_private.*` SECURITY DEFINER con `search_path=''` que comprueban `auth.uid()` y la propiedad de cada fila, + envoltorios `public.*` SECURITY INVOKER (`language sql`) con `execute` solo para `authenticated`. Igual para credenciales y restablecimiento.
- **Orden único de bloqueos** (R12): toda escritura de bóveda, notas y credenciales empieza con `select … from public.perfiles where id = u for update` — el mismo primer bloqueo que ya usa `operar_legacy` (y por tanto `eliminar_proyecto`) — y solo después bloquea filas propias (`for update`/`for share`). Se elimina el `pg_advisory_xact_lock` de `chambapp_notas` (el bloqueo de perfil ya serializa por usuario). El trigger de credenciales sobre `proyectos` no toma bloqueos extra (se ejecuta dentro de `eliminar_proyecto`, que ya tiene el perfil). Así no hay órdenes cruzados perfil↔advisory. Test db: creación de nota y `eliminar_proyecto` concurrentes en dos conexiones terminan sin deadlock.
- RPC `public.chambapp_boveda(p_accion, p_datos)` (validación de forma, `CONFLICTO_VERSION`):
  - `crear_boveda` (falla `BOVEDA_EXISTENTE` si ya hay una; reintento idéntico es idempotente),
  - `cambiar_clave` (nueva sal/iteraciones/clave_envuelta); exige **`generacion` y `version`** esperadas y las compara bajo el bloqueo de perfil; generación distinta o sin bóveda → `BOVEDA_CAMBIADA`, versión distinta → `CONFLICTO_VERSION` (R10),
  - `restablecer_boveda` (requiere `confirmacion = 'BORRAR'` y la `generacion` vigente): borra la bóveda, **todas las notas cifradas** y **todas las credenciales** del usuario en una transacción; las notas aún en claro se conservan. Es la salida si se olvida la clave.
- **Generación en escrituras cifradas** (R02): `guardar_nota` (con `cifrado`) y `guardar_credencial` exigen `boveda_generacion` igual a la vigente; si no hay bóveda o no coincide → `BOVEDA_CAMBIADA`. Las filas guardan su `boveda_generacion`. En cliente, `BOVEDA_CAMBIADA` bloquea la bóveda, vacía cachés descifradas y recarga datos; filas de otra generación se tratan como no legibles. Así una pestaña con la DEK antigua no puede escribir datos irrecuperables tras un reset en otra pestaña.

**Estado en cliente** — `src/features/vault/VaultProvider.tsx` + `useVault()`:
- Estados: `loading | missing | locked | unlocked`. La DEK vive solo en memoria (nunca en storage); recargar la página vuelve a `locked`.
- Bloqueo automático tras **15 min sin actividad** (pointer/teclado), botón «Bloquear» visible en Notas y Contraseñas, y bloqueo al cerrar sesión o cambiar de usuario (el provider se monta con `key={user.id}` dentro de `WorkspaceLayout`).
- Componente `VaultGate` (estilo `Panel`/`Notice` existentes, icono candado): pantalla «Crear clave maestra» (2 campos + aviso) o «Desbloquear» (1 campo) y enlace a Ajustes para restablecer.
- Ajustes: nueva tarjeta «Seguridad · Clave maestra» en `SettingsPage` con «Cambiar clave maestra» (actual + nueva + confirmación) y «Restablecer cifrado» (ConfirmDialog con texto «BORRAR», explica qué se pierde).

### B. Notas cifradas

**Servidor** (misma migración):
- `public.notas`: nuevas columnas `cifrado text null check (cifrado is null or (cifrado like 'v1.%' and octet_length(cifrado) <= 1400000))` y `boveda_generacion uuid null` (ambas nulas o ambas no nulas). Tamaño máximo (R04): título 200 caracteres × 4 B + 1 000 000 B + 4 B de prefijo + 16 B de tag ≈ 1 000 820 B → base64url ≈ 1 334 427 + IV y prefijo < 1 400 000. Se sustituye el check de `titulo` por: `(cifrado is null and length(btrim(titulo)) between 1 and 200) or (cifrado is not null and titulo = '' and contenido_md = '')`.
- **Invariante en tabla** (R03): `chambapp_notas` pasa a ser envoltorio invoker sobre una implementación `chambapp_private` SECURITY DEFINER (con las mismas comprobaciones de propiedad), y se **revoca INSERT/UPDATE/DELETE** de `authenticated` sobre `notas`, `nota_proyectos` y `nota_tareas` (el cliente solo usa la RPC; `select` se mantiene). Además, como defensa en profundidad, un trigger `before insert or update` en `notas` (definer, `search_path=''`) bloquea primero el perfil (`for key share`) y luego la fila de `bovedas` (`for share`); si existe bóveda rechaza `cifrado is null` con `NOTA_DEBE_CIFRARSE` y exige `new.boveda_generacion` = generación vigente (`BOVEDA_CAMBIADA`).
- `notas_detalle` se recrea incluyendo `cifrado` y `boveda_generacion` (mismas uniones y grants).
- `chambapp_notas.guardar_nota` acepta **o** `cifrado` (string) **o** `titulo`+`contenido_md` (legado):
  - Si el usuario tiene fila en `bovedas`, el texto en claro se rechaza con `NOTA_DEBE_CIFRARSE`.
  - Con `cifrado` (+ `boveda_generacion`): guarda `titulo=''`, `contenido_md=''`, `cifrado`, `boveda_generacion`. Idempotencia de creación: el reintento con el mismo id compara `cifrado` y vínculos (si difiere → `NOTA_ID_REUTILIZADO`).
  - Validaciones existentes de vínculos, versión y tamaños se mantienen.
- La migración de notas antiguas la hace el cliente (el servidor no tiene la clave).

**Cliente**:
- `Note` (dominio) sigue siendo la nota en claro que usa la UI; se añade `NoteRow` = fila del servidor (`titulo`, `contenido_md`, `cifrado: string | null`, `boveda_generacion: string | null`, …). `assertNote` valida solo propiedad y metadatos (ids, fechas, versión, vínculos) y que `cifrado` sea string o null coherente con título/contenido; **no** parsea el sobre. Formato y descifrado se validan por nota en `useNotes`, de modo que un sobre malformado solo marca esa nota como no legible y nunca rompe `loadWorkspace` (R05). `WorkspaceData.notes` pasa a ser `NoteRow[]`.
- `src/features/notes/useNotes.ts`: si la bóveda está desbloqueada, descifra `data.notes` (caché por `id:version`, en memoria) y devuelve `{ status, notes: Note[], failed: string[] }`. Una nota que no descifra (sobre corrupto o de otra clave) aparece en la biblioteca como «Nota no legible» deshabilitada, sin romper el resto.
- Guardado (`NoteEditor.save`): cifra `{titulo, contenido_md}` con AAD de la nota y envía `cifrado` + `boveda_generacion` + vínculos + versión. **Peticiones pendientes** (R07, R11): antes de enviar, la petición exacta (`cifrado`, generación, vínculos, versión base) se guarda como `pendiente` dentro de la sesión de borrador cifrada (y en memoria), **separada del borrador**: editar el borrador no la borra. Solo se elimina cuando su resultado queda resuelto. Antes de cualquier nuevo envío para esa nota (y al restaurar una sesión), si hay `pendiente` se **reconcilia** leyendo la fila de `notas_detalle` por id:
  - la fila tiene exactamente ese `cifrado` → la petición se confirmó: la línea base pasa a esa fila descifrada (versión del servidor) y, si el borrador difiere, el siguiente guardado es una **actualización** con esa versión;
  - no hay fila (creación) o la versión sigue siendo la base (edición) → se reenvían los mismos bytes de `pendiente`;
  - la fila existe con otro contenido/versión → conflicto mostrado como el actual (`conflict`), sin sobrescribir.
  Credenciales: mismo esquema en memoria dentro del modal (la petición pendiente se reconcilia con la fila por id antes de reenviar o de enviar una versión editada). La respuesta se valida (`isValidCommandResponse` comprueba `cifrado` igual al enviado, `titulo`/`contenido_md` vacíos) y se descifra para `setBaseline`.
- Validación de título (1-200, no vacío) y tamaño (≤ 1 MB de Markdown) se aplica en cliente antes de cifrar, ya que el servidor no ve el texto.
- **Migración de notas en claro**: al desbloquear (o crear la bóveda), si hay filas con `cifrado null`, se cifran una a una con `guardar_nota` + `version` (actualización normal). Aviso en Notas «Cifrando N notas…» y resultado; un fallo deja esa nota en claro y se reintenta en el siguiente desbloqueo. Mientras exista bóveda el servidor ya no acepta texto en claro. Limitación documentada: copias antiguas en backups/WAL de Supabase pueden conservar el texto previo.
- `NotesPage`: envuelta en `VaultGate`. Los borradores en `sessionStorage` se guardan **cifrados** (sobre con AAD `chambapp:borrador-nota:v1:<usuario_id>`); al desbloquear se descifra antes de montar el espacio de notas (prop `initialSession`). `notesDraft.ts` mantiene la validación de forma de la sesión descifrada.
- **Borradores antiguos en claro** (R08): si `sessionStorage` contiene una `NoteSession` en claro válida del usuario actual (formato actual), tras crear/desbloquear la bóveda se restaura, se cifra y se sustituye la copia en claro. Si el valor no es ni sesión en claro válida ni sobre descifrable, no se borra en silencio: aviso «No se pudo recuperar un borrador anterior» con «Descartar» explícito.
- Importar `.md` y descargar `.md` siguen funcionando con el texto en claro local.
- `TaskNotes` (detalle de tarea): con bóveda bloqueada muestra «N notas cifradas» + botón «Desbloquear» (abre el diálogo de desbloqueo inline); desbloqueada, títulos y primera línea como ahora.
- Cualquier otro consumidor de `data.notes` (grep durante la implementación: `TasksPage`, `ProjectsPage`, dashboard…) usa `useNotes` o solo metadatos (ids/vínculos), nunca `titulo`/`contenido_md` de la fila.

### C. Búsqueda por texto en Notas

- `noteMatchesSearch` sigue comparando título + contenido (sin acentos/mayúsculas). Se añade `noteSearchExcerpt(note, query)` en `notes.model.ts`: si la coincidencia está en el contenido, devuelve un fragmento de ~90 caracteres alrededor de la primera coincidencia con «…» en los cortes; si no, el inicio del contenido.
- Sugerencias del buscador y extractos de la biblioteca usan ese fragmento y resaltan el término (`<mark>` con estilo de tokens existentes) cuando hay búsqueda.
- La búsqueda incluye los valores descifrados (funciona igual con notas cifradas).

### D. Mi semana

- `WeekPage`: se elimina el `Panel` de la semana con `DayCard`. El título «Semana N · dd LLL — dd LLL yyyy» y la navegación (anterior / Hoy / insignia / siguiente) pasan a `PageHeader` (`description`/`actions`).
- Se eliminan `DayCard.tsx`, `DayGoalModal.tsx`, el estado `entryForm`/`goal`, el uso de `EntryModal` en esta página y el CSS que quede sin uso (`calendar-grid--full-week`, estilos de day-card si no se usan en otra parte; comprobar con grep incluida la landing).
- El principio «Objetivos por día / Edita una jornada…» se reescribe para remitir a Ajustes (reparto semanal), ya que la edición diaria desaparece.
- `tools/week-tests.mjs` y `week.model.ts` no cambian salvo lo necesario para compilar.

### E. Gestor de contraseñas

**Ruta y menú**: `paths.passwords = '/contrasenas'` (añadida también a `protectedPaths` de `src/features/auth/returnTo.ts`, R09), entrada «Contraseñas» (icono candado/llave existente en `Icon.tsx` o añadido con lucide-react) en la sección **Trabajo** tras «Notas»; página lazy `src/features/passwords/PasswordsPage.tsx`, envuelta en `VaultGate`.

**Servidor** (misma migración):
- `public.credenciales`: `id uuid pk`, `usuario_id` (FK perfiles cascade), `proyecto_id uuid not null`, FK `(proyecto_id, usuario_id)` → `proyectos(id, usuario_id)` on delete cascade, `boveda_generacion uuid not null`, `cifrado text not null check (cifrado like 'v1.%' and octet_length(cifrado) <= 262144)`, `creado_en`, `actualizado_en`, `version` (trigger de versión), `unique(id, usuario_id)`. RLS propietario, solo `select` para `authenticated`; **sin DML directo**.
- Tamaño máximo (R04): con los límites de abajo y caracteres de control prohibidos, el peor caso JSON es ≤ 4 B por punto de código (UTF-8; comillas/barras escapadas ocupan 2 B): 30 × (60 + 1000) × 4 + 120 × 4 + 2000 × 4 + estructura (30 × 80 + 100) ≈ 138 kB → base64url ≈ 184 k < 262 144. Un test serializa el peor caso real y comprueba que cabe.
- **Borrado lógico de proyectos** (R06): `eliminar_proyecto` solo marca `eliminado_en`. Un trigger `after update of eliminado_en on proyectos` (SECURITY DEFINER) borra las credenciales del proyecto cuando pasa de null a no null. Además la página consulta la vista `credenciales_detalle` (security_invoker) que solo devuelve credenciales de proyectos no eliminados, y la query de credenciales se invalida tras eliminar un proyecto y al montar la página.
- RPC `public.chambapp_credenciales(p_accion, p_datos)` (envoltorio invoker + implementación privada definer): `guardar_credencial` (crear con id cliente, idempotente comparando `cifrado`+`proyecto_id`; editar con `version`, `CONFLICTO_VERSION`; proyecto debe existir, ser del usuario y no estar eliminado → `PROYECTO_NO_DISPONIBLE`; `boveda_generacion` vigente, si no `BOVEDA_CAMBIADA`) y `eliminar_credencial` (con `version`). La petición de guardado se memoiza en el estado del modal para que los reintentos reenvíen los mismos bytes; si se cierra el modal tras un resultado desconocido, la recarga de la query muestra la fila si llegó a guardarse. Solo `proyecto_id`, generación y fechas son metadatos visibles.

**Contenido cifrado** (JSON dentro del sobre, AAD por credencial):
```ts
type CredentialSecret = {
  nombre: string;            // obligatorio, 1-120
  url: string;               // opcional, ≤ 2000
  campos: CredentialField[]; // 1-30 campos
};
type CredentialField = {
  id: string;                // uuid
  etiqueta: string;          // 1-60, sin caracteres de control
  valor: string;             // ≤ 1000, sin caracteres de control
  secreto: boolean;          // se oculta y se enmascara
};
```
Nueva entrada por defecto: `[{etiqueta:'Usuario', secreto:false}, {etiqueta:'Contraseña', secreto:true}]`. Los dos campos por defecto son campos normales (se pueden renombrar o borrar), y «Añadir campo» agrega otros (p. ej. «Dominio», «PIN») con interruptor «Oculto». Validación de forma en `src/features/passwords/credentials.model.ts` (pura, testeada) al cifrar y al descifrar.

**UI** (componentes existentes: `PageHeader`, `Panel`, `Button`/`IconButton`, `FormField`, `SelectField`, `SearchSuggest` o input de búsqueda, `Modal`, `ConfirmDialog`, `Badge`, tokens CSS; CSS propio en `passwords.css` con variables de `tokens.css`):
- Cabecera «Trabajo / Seguridad · Contraseñas», descripción, acciones «Bloquear» y «Nueva entrada».
- Filtro por proyecto (todos / uno; proyectos archivados marcados) + búsqueda local por nombre, URL y valores no secretos.
- Lista agrupada por proyecto: tarjeta por entrada con nombre, URL (enlace `rel="noopener noreferrer"`, solo http/https), y cada campo con valor visible o `••••••••`, botón mostrar/ocultar y copiar (feedback «Copiado» con `useFeedback`; el portapapeles se intenta vaciar a los 30 s si aún contiene ese valor).
- Modal de edición: Proyecto (obligatorio), Nombre, URL, lista de campos (etiqueta, valor, conmutador Oculto, eliminar, reordenar no incluido), «Añadir campo», generador de contraseña en campos ocultos (20 caracteres, `crypto.getRandomValues`, sin sesgo de módulo). Guardar / Cancelar con confirmación si hay cambios; Eliminar con `ConfirmDialog`.
- Estado vacío y sin proyectos: Notice con enlace a Proyectos, como otras páginas.
- Carga: query React Query separada `['credenciales', userId]` (paginación `readAll` como el resto), invalidada tras guardar/eliminar; no se añade a `loadWorkspace`.
- Los valores descifrados solo viven en estado React; nada se escribe en storage.

### F. Documentación

- `docs/base-de-datos.md`: tablas `bovedas`, `credenciales`, columna `notas.cifrado`, RPCs nuevas y modelo de amenazas breve (qué protege y qué no: metadatos de vínculos/fechas visibles; un atacante con control del frontend desplegado podría capturar la clave; no hay recuperación).
- `docs/ejecutar-migraciones.md`: nueva migración pendiente.
- `database.types.ts` actualizado a mano para las nuevas tablas/vista/columnas/RPCs.

## No objetivos

- No se cifran proyectos, tareas, partes, ni los vínculos nota↔proyecto/tarea (metadatos).
- Sin recuperación de clave maestra, sin compartir credenciales, sin autocompletado de navegador, sin importación desde otros gestores, sin historial de contraseñas, sin reordenar campos.
- No se aplica la migración al Supabase remoto sin autorización explícita del usuario (lo hará con `npm run db:migrate` o lo pedirá).

## Riesgos

- Olvido de la clave → pérdida de datos (mitigado con aviso y restablecimiento).
- PBKDF2 600k en equipos lentos: ~0.5-1 s al desbloquear (aceptable; se muestra «Desbloqueando…»).
- Cliente desplegado sin migración remota: Notas y Contraseñas fallarían → se documenta que la migración debe aplicarse antes del despliegue.

## Verificación

Comandos (todos deben terminar en 0):
```
npm run typecheck
npm run lint
npm test
npm run build
npm run format:check
npm run db:test
```
Pruebas nuevas:
- `tests/vault.test.ts`: codificación binaria de notas byte a byte (BOM, CRLF, emojis); sobre de nota de tamaño máximo (1 000 000 B de comillas o no-ASCII + título de 200 emojis) < 1 400 000; crear/desbloquear con clave correcta, rechazo con incorrecta, reenvolver (clave antigua deja de servir, nueva sí, los sobres previos siguen descifrando), sobre con AAD de otra fila no descifra, sobre manipulado (1 bit) no descifra, IV distinto por cifrado, formato `v1.` estricto.
- `tests/credentials.test.ts`: entrada por defecto (Usuario + Contraseña oculta), validación de límites (incluido rechazo de caracteres de control), sobre del peor caso de credencial < 262 144, generador (longitud, alfabeto, sin sesgo comprobado sobre conjunto), extractos de búsqueda de notas (`noteSearchExcerpt`: coincidencia en cuerpo, sin acentos, cortes con «…»).
- `tests/notesPersistence.test.ts` actualizado: `assertNote` acepta fila cifrada y legado y no rechaza un sobre malformado (se aísla después); rechaza fila con `cifrado` y título no vacío; el descifrado por nota marca solo esa nota como no legible; borrador antiguo en claro se migra; sesión con `pendiente` reenvía los mismos bytes y, tras confirmarse por reconciliación, una edición posterior se envía como actualización con la versión del servidor (lógica de reconciliación en módulo puro testeado); `/contrasenas` se conserva como destino en `safeReturnTo`; `isValidCommandResponse` exige eco de `cifrado`.
- `tools/db-tests/vault.mjs` (registrado en `verify.mjs`): RLS de `bovedas`/`credenciales` entre dos usuarios; `authenticated` no puede hacer INSERT/UPDATE/DELETE directos en `bovedas`/`credenciales`; tras crear bóveda, INSERT/UPDATE directo de una nota en claro en `notas` falla con `NOTA_DEBE_CIFRARSE`; escritura con generación antigua tras reset + recreación falla con `BOVEDA_CAMBIADA` (incluido `cambiar_clave` preparado antes del reset); creación de nota y `eliminar_proyecto` concurrentes sin deadlock; DML directo de `authenticated` sobre `notas`/`nota_proyectos`/`nota_tareas` denegado; `eliminar_proyecto` (RPC normal) elimina sus credenciales; `crear_boveda` idempotente y `BOVEDA_EXISTENTE`; `NOTA_DEBE_CIFRARSE` tras crear bóveda; guardar nota cifrada (titulo/contenido vacíos) y reintento idéntico idempotente / distinto `NOTA_ID_REUTILIZADO`; migración legado → cifrado con versión; credencial con proyecto ajeno o eliminado rechazada; `BOVEDA_CAMBIADA` sin bóveda; conflicto de versión; `restablecer_boveda` borra cifrados y conserva notas en claro y no toca a otro usuario. Adaptaciones obligatorias de la verificación existente (R13, R14):
  - `tools/db-tests/notes.mjs`: los INSERT/UPDATE directos de `authenticated` sobre `notas`/`nota_proyectos`/`nota_tareas` pasan a esperar `permission denied`; las comprobaciones de claves foráneas/consistencia de vínculos se conservan ejecutándolas con una conexión privilegiada (`admin`) que simula el rol propietario; el texto en claro tras crear bóveda se comprueba por la RPC (`NOTA_DEBE_CIFRARSE`) y el trigger defensivo con DML de `admin` sobre la tabla.
  - Fixture de concurrencia (`notes.mjs` ~l.269-299): con el bloqueo de perfil, la eliminación se lanza **sin esperar** mientras la compuerta está tomada, se libera la compuerta y se esperan ambas operaciones con timeouts acotados (`Promise.race` + `statement_timeout`/`lock_timeout` en esas conexiones); se aceptan los resultados serializados válidos (guardado antes de la eliminación → vínculo filtrado de la vista; o guardado después → `PROYECTO_NO_DISPONIBLE`/`TAREA_NO_DISPONIBLE`) en lugar de exigir rollback.
  - `tools/db-tests/verify.mjs` (~l.654, 665): recuento de catálogo actualizado a 17 tablas y 8 vistas (`bovedas`, `credenciales`, `credenciales_detalle`) y listas de grants/políticas esperadas ampliadas.
  - El resto de `notes.mjs` (usuario sin bóveda = flujo legado por RPC) sigue pasando.

Verificación manual en navegador (Playwright, `npm run dev`), en la medida en que el backend lo permita (la migración no estará en el remoto salvo autorización):
- Mi semana: no hay tarjetas de días; navegación en la cabecera cambia de semana y «Hoy» vuelve; gráfico, comparación, balance e informe siguen; sin errores de consola.
- Notas: buscar una palabra que solo está en el cuerpo muestra la nota y el fragmento resaltado en sugerencias y biblioteca.
- Si el backend tiene la migración: crear clave maestra, notas existentes se cifran (comprobar en la respuesta de red que `titulo`/`contenido_md` van vacíos y `cifrado` empieza por `v1.`), bloquear/desbloquear, clave errónea rechazada, crear credencial con 2 campos por defecto + 2 personalizados, mostrar/copiar, editar, eliminar; estilo coherente en tema claro y oscuro.
