# Plan 7 — Partes agrupados por tarea y día con imputaciones a Odoo

Base: rama `feat/agrupar-partes-generar-imputaciones` en 348ab57 (árbol limpio). Petición directa del usuario.

## Objetivo

Una tarea puede tener varios partes (tramos) en el mismo día. Se quiere:

1. Ver en **Parte semanal** una tabla nueva, encima de la cuadrícula actual, que agrupe los partes **por tarea y día**.
2. Poder imputar **todos** los partes pendientes de una tarea/día juntos, o **solo los seleccionados** (juntos). Con eso se cubre cualquier combinación (3 juntos, 2 + 1, 1 + 1 + 1).
3. Al imputar varios partes juntos se **suma el tiempo real y se redondea el total una sola vez** (no la suma de redondeos).
4. Dejar el modelo listo para el envío automático a Odoo futuro: cada imputación = una línea de horas en Odoo.

## Decisiones confirmadas por el usuario

- **D1** Interfaz: casillas por parte + botones «Enviar todos» y «Enviar seleccionados». Los seleccionados se envían **juntos** en una sola imputación.
- **D2** Los botones de **enviar a Odoo no tienen funcionalidad todavía** (deshabilitados, «próximamente», igual que el `OdooSendButton` actual).
- **D3** Se quita el botón de enviar de cada parte individual. La cuadrícula actual se queda debajo como timeline.
- **D4** Modelo: los partes (`partes_horas`) siguen siendo la unidad atómica; el grupo tarea+día se calcula; se añade la tabla `imputaciones_odoo` (una fila = una futura línea de Odoo) y cada parte apunta como mucho a una.
- **D5** Seguir la línea visual de la app.

## Decisiones propias (a revisar)

- **P1 Marcado manual en la tabla nueva.** Como enviar aún no funciona, la tabla agrupada ofrece también «Marcar seleccionados como imputados» / «Marcar todos como imputados» (crean una imputación `manual`) y «Deshacer» por imputación. Sustituye a la casilla individual de la cuadrícula semanal, que desaparece (D3). Así no se pierde la funcionalidad manual actual y el estado queda agrupado desde ya.
- **P2 Intervalo de redondeo de un grupo** = el **máximo** `intervalo_redondeo_minutos` de sus partes (los partes conservan el intervalo copiado del perfil al crearse; normalmente todos coinciden). Determinista, sin depender del perfil actual, y la misma regla sirve para la previsualización de pendientes y para las imputaciones hechas. `0` solo si todos son `0`.
- **P3 Compatibilidad de `imputado_en_odoo`.** La columna física se mantiene, pero pasa a ser **derivada**: `check (imputado_en_odoo = (imputacion_odoo_id is not null))`. Un trigger traduce los cambios legacy (`crear_parte`/`editar_parte` con `imputado_en_odoo`, usados por Registro y el editor de partes) a imputaciones de un solo parte. `operar_legacy` no se toca.
- **P4 Totales.** En Parte semanal (cabecera, días y tabla nueva) los totales imputables pasan a ser por grupo: suma de imputaciones (redondeo sobre su suma) + pendientes de cada tarea/día (redondeo sobre su suma). Registro, Mi semana y las vistas `resumen_*` mantienen el redondeo por parte (fuera de alcance; documentado).
- **P5** Registro (`EntriesTable`) también pierde el botón de enviar individual; conserva la casilla manual (ahora vía trigger).

## Reconocimiento (fuentes)

- Tabla `public.partes_horas` (`20261001181821_initial_chambapp.sql` l.79-100): `jornada_id`, `tarea_id`, `inicio_en`, `fin_en`, `intervalo_redondeo_minutos`, `eliminado_en` (lápida), `version`. FKs compuestas `(jornada_id, usuario_id)` y `(tarea_id, usuario_id)`. Trigger `validar_fila` (incrementa versión, prohíbe actualizar lápidas con `REGISTRO_ELIMINADO`). Escritura directa revocada; todo vía RPC.
- `imputado_en_odoo` (`20261002201755_manual_odoo_time_entry_status.sql`), dispatcher vigente `chambapp_private.operar_legacy` en `20261005185736_selected_timer_start_and_odoo_credentials.sql` (valida booleano, `crear_parte` / `editar_parte` lo escriben). Tests BD: `tools/db-tests/odoo-status.mjs` (marcar parte en curso, lápida conserva la marca, carreras de versión, mover parte conserva la marca).
- Vista `partes_detalle` (columnas en orden fijo; solo se puede **añadir al final**). Redondeo SQL `chambapp_private.redondear_duracion_superior` = cliente `roundDuration` (`src/domain/time.ts`).
- Patrón RPC nuevo: `chambapp_private.<x>` SECURITY DEFINER `search_path=''` + envoltorio `public.chambapp_<x>` invoker, `execute` solo `authenticated`; `chambapp_private.bloquear_perfil(u)` para orden de bloqueo (`20261104120000_encrypted_notes_and_credentials.sql`).
- Cliente: `executeCommand` enruta acciones a RPCs (`src/lib/supabase/workspace.repository.ts` l.38-87), `isValidCommandResponse` (`commandValidation.ts`), `assertEntry` (`rowValidation.ts`), tipos `database.types.ts`, `TimeEntry` (`src/domain/models.ts`), `CommandAction`, mensajes en `errors.ts`.
- UI: `src/features/timesheet/TimesheetPage.tsx` (cuadrícula por día, casilla + `OdooSendButton` por parte, `setImputed`), `timesheet.model.ts` (`buildTimesheetWeek`), `timesheet.css` (altura fija al viewport, scroll interno por día), `OdooSendButton.tsx`, `EntriesTable.tsx`.
- Pruebas: `npm test`, `npm run db:test` (embedded-postgres), `typecheck`, `lint`, `build`, `format:check`. Arnés visual en `tools/ui-smoke`.

## Diseño

### A. Base de datos — migración `supabase/migrations/20261104150000_odoo_imputations.sql`

```sql
create table public.imputaciones_odoo (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles(id),
  tarea_id uuid not null,
  jornada_id uuid not null,
  estado text not null default 'manual' check (estado in ('manual')), -- futuro: enviando/enviado/error
  creado_en timestamptz not null default clock_timestamp(),
  unique(id, usuario_id, tarea_id, jornada_id),
  foreign key(tarea_id, usuario_id) references public.tareas(id, usuario_id),
  foreign key(jornada_id, usuario_id) references public.jornadas(id, usuario_id)
);
```
- RLS: `lectura_propia` select; `authenticated` solo `select`; sin DML directo. Índice por `(usuario_id, jornada_id)`.
- `partes_horas.imputacion_odoo_id uuid` + FK compuesta `(imputacion_odoo_id, usuario_id, tarea_id, jornada_id) references imputaciones_odoo(id, usuario_id, tarea_id, jornada_id)` (MATCH SIMPLE: sin imputación no se comprueba). **La BD garantiza que una imputación solo agrupa partes de la misma tarea y jornada.** Índice por `imputacion_odoo_id`.
- **Migración de datos**: cada parte con `imputado_en_odoo = true` (incluidas lápidas) recibe su propia imputación `manual` (una por parte: conserva exactamente los totales históricos). El relleno se hace antes de crear los triggers nuevos, con `validar_fila` **y** el constraint trigger diferido `validar_arbol` desactivados en `partes_horas` solo durante esa sentencia (`alter table … disable trigger validar_fila, validar_arbol` → update → `enable`), para no chocar con `REGISTRO_ELIMINADO`, no subir versiones y no dejar eventos diferidos pendientes que harían fallar el `enable`/`add constraint` (P7-001). Además `set constraints all immediate` antes del relleno como defensa. Después: `check (imputado_en_odoo = (imputacion_odoo_id is not null))`. La verificación de actualización (`verify.mjs`, ruta «upgrade») siembra partes marcados activos **y** lápidas marcadas antes de aplicar esta migración y comprueba el resultado. Su limpieza administrativa borra las `imputaciones_odoo` del usuario después de sus `partes_horas` y antes de `jornadas`/`tareas` (P7-006).
- **Trigger `sincronizar_imputacion_odoo`** BEFORE INSERT OR UPDATE en `partes_horas` (SECURITY DEFINER, `search_path=''`), en este orden:
  1. Si `imputacion_odoo_id` cambia explícitamente (lo hace la RPC nueva): `imputado_en_odoo := imputacion_odoo_id is not null`.
  2. Si no, si `imputado_en_odoo` cambia (ruta legacy): `true` → inserta imputación `manual` con la tarea/jornada de NEW y la asigna; `false` → `imputacion_odoo_id := null`.
  3. Si no, si la fila tiene imputación y cambia `tarea_id` o `jornada_id` (editar parte, cambio de zona): se mueve a una imputación nueva de un solo parte para la nueva tarea/jornada (se conserva la marca, como hoy).
  En INSERT con `imputado_en_odoo = true` aplica la regla 2.
- **Trigger AFTER UPDATE OR DELETE** (`limpiar_imputacion_odoo`): si `old.imputacion_odoo_id` deja de usarse (cambio de referencia o borrado físico administrativo), borra esa imputación cuando ya no la referencia ninguna fila.
- **RPC `public.chambapp_imputaciones(p_accion, p_datos)`** → `chambapp_private.imputaciones`:
  - `imputar_partes` `{ partes: [{ id, version }, …] }`: 1..1000 elementos (límite de tamaño de petición; la UI aplica el mismo límite, ver C — P7-004), ids uuid distintos, versiones enteras. Bloquea perfil y luego los partes (`for update`, orden por id). Cada parte: del usuario, no eliminado (`PARTE_NO_DISPONIBLE`), versión coincide (`CONFLICTO_VERSION`), terminado (`PARTE_EN_CURSO`), sin imputación (`PARTE_YA_IMPUTADO`); todos misma tarea y jornada (`PARTES_DE_DISTINTO_GRUPO`). Inserta la imputación y asigna `imputacion_odoo_id`. Devuelve `{ id, tarea_id, jornada_id, estado, partes: [{ id, version, imputacion_odoo_id, imputado_en_odoo }] }`.
  - `deshacer_imputacion` `{ id }`: imputación del usuario (`IMPUTACION_NO_DISPONIBLE`); desasigna sus partes activos (las lápidas conservan la referencia); la limpieza la hace el trigger AFTER. Devuelve `{ id, partes: [{ id, version, imputacion_odoo_id: null, imputado_en_odoo: false }] }`.
  - Acción desconocida → `ACCION_NO_SOPORTADA`; datos no objeto → `DATOS_INVALIDOS`; sin sesión → `SESION_REQUERIDA`.
- `partes_detalle`: `create or replace` **añadiendo al final** `h.imputacion_odoo_id`.
- La ruta legacy (`editar_parte` / `crear_parte` con `imputado_en_odoo`) sigue funcionando sin cambios en `operar_legacy`. Los tests existentes de `odoo-status.mjs` deben seguir pasando con un único ajuste (P7-003): `stripStatus` excluye también `imputacion_odoo_id` de la comparación «datos sin cambios», y se añaden aserciones de que marcar crea una imputación de un solo parte con la tarea/jornada correctas y desmarcar deja la referencia a `null`.
- `docs/base-de-datos.md`: sección nueva (tabla, invariantes, RPC, ruta legacy, totales).

### B. Dominio (cliente, puro y con tests) — `src/features/timesheet/timesheet.model.ts`

- `TimeEntry` gana `imputacion_odoo_id: string | null` (models, database.types, `assertEntry`: uuid o null y coherente con `imputado_en_odoo`).
- `groupRounding(entries)` → `{ realSeconds, intervalMinutes (máx), loggedSeconds = roundDuration(suma, máx) }`, solo partes terminados.
- `buildTimesheetGroups(entries, tasks, dates)` → por día, grupos por tarea (orden por el primer inicio):
  `{ key: fecha+tarea, taskId, title, odooId, odooUrl, entries (orden inicio), pending (terminados sin imputación), running (sin fin), imputations: [{ id, entries, realSeconds, loggedSeconds }], realSeconds, loggedSeconds (= Σ imputaciones + redondeo de pendientes), status: 'pending' | 'partial' | 'imputed' }`, más `running: boolean`.
- `buildTimesheetWeek` usa estos grupos para `day.loggedSeconds` y el total semanal (P4). Los items de la timeline exponen `imputed` y `group` en vez de recalcular.

### C. Interfaz — Parte semanal

**Tabla nueva `TimesheetGroups`** (`src/features/timesheet/components/TimesheetGroups.tsx`) encima de la cuadrícula, en un panel con el mismo borde/superficie que la cuadrícula:
- Cabecera de sección por día con partes (capitalizado como la cuadrícula; hoy en acento).
- Fila por tarea (botón con `aria-expanded`, chevron): título (enlace Odoo si hay URL segura) + chip `odoo_id`, «N partes», real (`formatDuration`, dim), imputable (mono, fuerte), chip de estado `○ Pendiente` / `◐ Parcial` / `✓ Imputado` con los colores existentes (`--warning`, `--success`), `● En curso` en acento si hay parte abierto.
- Desplegada: lista de partes con casilla (solo pendientes terminados), rango (`formatRange`), real, descripción truncada. Los imputados se muestran agrupados por imputación con ✓, su total redondeado y botón «Deshacer». El parte en curso se ve sin casilla.
- Pie: «Seleccionados: X real → Y» en vivo (`groupRounding`), botones `Enviar seleccionados` y `Enviar todos (Y)` **deshabilitados** con icono `send`, `aria-disabled` y título «próximamente» (D2), y botones ghost `Marcar seleccionados` / `Marcar todos como imputados` (P1). Al marcar, la selección se limpia. Mensajes con `notify`; errores en `form-error` como hoy.
- «Marcar todos» y «Marcar seleccionados» hacen **una sola** llamada atómica (nunca se trocea en lotes, porque cambiaría el redondeo). Si el conjunto supera 1000 partes, los botones se deshabilitan con el aviso «Demasiados partes para imputarlos juntos (máx. 1000)» (P7-004).
- Estado de selección local por grupo; se descarta si los partes cambian (los ids seleccionados que ya no son pendientes se ignoran).
- Accesible por teclado; casillas con `aria-label` con tarea y rango.

**Timeline (cuadrícula actual)**: se quitan la casilla y `OdooSendButton`; queda un indicador de estado (icono `check`/`clock`, `aria-label`). **Desviación de build:** cada parte de la timeline muestra su duración **real** (antes, la redondeada por parte), porque el redondeo por parte ya no es lo que se imputa; los totales de día/semana son los agrupados (P4). Se elimina `setImputed` de `TimesheetPage` (su actualización de caché se conserva para las acciones nuevas, ver Comandos).

**Layout**: `.timesheet` mantiene la altura al viewport; la tabla nueva ocupa `flex: 0 1 auto` con `max-height: 45%` y scroll interno; la cuadrícula `flex: 1` con `min-height: 240px`. En ≤ 900 px todo pasa a altura automática (como hoy).

**Comandos**: acciones `imputar_partes`, `deshacer_imputacion` en `CommandAction`, ruteadas a `chambapp_imputaciones` en `executeCommand`; validación de respuesta en `isValidCommandResponse` (id, lista de partes con id/version y estado coherente con la acción); mensajes en `errors.ts` para los códigos nuevos. Tras la respuesta, `useCommand` invalida el workspace; además (P7-002), igual que hacía `setImputed`, la página aplica a la caché `['workspace', user.id]` la `version`, `imputacion_odoo_id` e `imputado_en_odoo` devueltos para cada parte, solo si la versión en caché es menor (no pisa datos más nuevos). Así, si la recarga posterior falla, la tabla refleja la imputación y su «Deshacer», y no hay conflicto de versión al reintentar. Helper puro `applyImputationResult(entries, result)` con tests.

**Registro**: `EntriesTable` pierde `OdooSendButton` (P5). `OdooSendButton` se reutiliza en la tabla nueva con texto.

## Pruebas

- `tests/timesheet.test.ts`: agrupación por tarea/día, orden, pendientes/parciales/imputados/en curso, redondeo sobre la suma (25+20+10 min R15 → 60, no 75), intervalo máximo, totales de día/semana, lápidas excluidas.
- `tests/rowValidation.test.ts`, `tests/commandValidation.test.ts`: campo nuevo y respuestas de las acciones nuevas.
- `tools/db-tests/odoo-imputations.mjs` (registrado en `verify.mjs`): migración de datos (incl. lápidas), FK impide mezclar grupos, `imputar_partes` (feliz, versiones, en curso, ya imputado, otra tarea/día, otro usuario, duplicados, vacíos, >1000), `deshacer_imputacion`, ruta legacy (marcar/desmarcar/mover tarea), limpieza de imputaciones vacías, check de coherencia, sin DML directo, carrera concurrente de `imputar_partes` sobre el mismo parte (una gana).
- `odoo-status.mjs` existente sin cambios debe pasar.
- `tests/timesheet.test.ts` también cubre `applyImputationResult` (aplica versiones mayores, ignora menores, imputar y deshacer).
- typecheck, lint, test, db:test, build, format:check.
- Verificación visual con el arnés `tools/ui-smoke` (P7-005): antes se amplía `tools/ui-smoke/repository.ts` para que los fixtures tengan `imputacion_odoo_id` coherente con `imputado_en_odoo` (una imputación por parte marcado), al menos una tarea con 3 partes el mismo día, y `executeCommand` simule `imputar_partes` / `deshacer_imputacion` (versiones, validación de grupo y errores) y que `editar_parte` mantenga la coherencia. Se comprueba en navegador: desplegar, seleccionar 2 de 3 → previsualización redondeada sobre la suma, marcar, estado parcial, marcar el resto, deshacer, botones de envío deshabilitados, timeline sin casilla ni botón, 1280×720 y ≤ 900 px.

## Riesgos

- Registro y otros resúmenes siguen redondeando por parte (P4): pueden diferir de Parte semanal. Documentado; se unificará cuando se haga el envío real.
- Los tramos ya imputados se pueden seguir editando (como hoy); el total de su imputación cambia en vivo. Cuando haya envío real habrá que bloquearlos o marcarlos desincronizados.
- Sin commit ni push (no autorizado).
