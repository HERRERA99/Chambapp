# Plan — Rediseño de Tareas y nueva vista «Parte semanal»

## Objetivo

1. Simplificar `/tareas`: la tarea en foco se ve como ahora (`TaskDetail` + `TaskEntries` sin cambios funcionales) y, a su lado, una cola compacta con las demás tareas **en curso** y las **pendientes**. Las tareas finalizadas (y archivadas) solo aparecen cuando el usuario las busca expresamente.
2. Sustituir la sección «Tablero de tareas» (`/tablero`, kanban) por **«Parte semanal»** (`/parte-semanal`): una tabla de la semana, minimalista y sin scroll de página, con los partes de horas de cada día.

## Criterios de aceptación (observables)

### A. Tareas (`/tareas`)

- A1. Desaparecen: selector Lista/Tablero, control segmentado de estado, checkbox «Incluir archivadas», paginación, aviso fijo «Inicio y fin exactos». Se mantienen en la cabecera «Nueva tarea» (primario) y «Exportar CSV».
- A2. Tarea en foco = la elegida por el usuario si sigue visible en la cola o en los resultados; si no, la tarea con cronómetro activo; si no, la `en_curso` actualizada más recientemente (`actualizado_en`); si no, la `pendiente` más reciente; si no hay ninguna, estado vacío actual (crear tarea / ir a proyectos). Se renderiza con `TaskDetail` tal como hoy.
- A3. Cola lateral («Siguientes»), en desktop a la derecha (`.task-workspace` ya es 2 columnas) y debajo en < 1190px. Contiene dos grupos con contador: «En curso» y «Pendientes»; la tarea en foco se excluye de cualquier grupo (también del de finalizadas) porque ya se ve a la izquierda. Solo tareas no archivadas de proyectos no archivados. Orden: `actualizado_en` desc. Sin paginación.
- A4. Cada fila de la cola es compacta (una línea principal + una secundaria): punto de estado, título (truncado con `title` completo), chip del ID de Odoo si hay, proyecto en gris, `imputado / estimación` en mono. Clic en la fila → pasa a ser la tarea en foco. Fila del cronómetro activo resaltada con el acento.
- A5. Cabecera de la cola: un único buscador (título, ID Odoo, descripción, proyecto) y un selector de proyecto compacto que sigue leyendo/escribiendo `?proyecto=` (enlaces existentes desde Proyectos siguen funcionando). Un interruptor «Finalizadas y archivadas»: al activarlo la cola muestra solo un grupo «Finalizadas y archivadas» (tareas `completada` o archivadas o de proyecto archivado) filtrado por buscador/proyecto, orden `actualizado_en` desc, limitado a 20 con texto «N más sin mostrar. Refina la búsqueda.» si hay más. Con el interruptor apagado nunca aparecen tareas completadas ni archivadas.
- A6. Exportar CSV exporta las tareas del modo actual de la cola (activas, o finalizadas/archivadas) respetando buscador y proyecto.
- A7. Se eliminan `TaskBoard.tsx`, `task-board.css`, `TaskPagination.tsx`, `task-pagination.css` y el prop `defaultView` / parámetro `?vista`.

### B. Parte semanal (`/parte-semanal`)

- B1. Navegación de semana: «‹», «Hoy», «›» y la etiqueta «Semana del 28 sep – 2 oct 2026». Total imputado de la semana en pequeño. Semana actual por defecto (zona del perfil).
- B2. Columnas: lunes a viernes siempre; sábado y domingo solo si tienen algún parte esa semana. Cabecera de columna: día abreviado + número, y total redondeado del día. Hoy resaltado.
- B3. **Un item por parte** (`TimeEntry`, no eliminado, `fecha` dentro de la semana), ordenado por `inicio_en` asc dentro del día. Cada item muestra:
  - título de la tarea (1 línea truncada, `title` completo); «Tarea no disponible» si no se encuentra;
  - ID de tarea de Odoo (`entry.odoo_id ?? task.odoo_id`) como chip si existe;
  - franja horaria `HH:mm–HH:mm` en la zona del parte (`entry.zona_horaria`); si el fin cae en otro día natural, sufijo `(+N)` con N = diferencia real de días naturales entre inicio y fin calculada en `entry.zona_horaria` (cubre partes de varios días y cambios de horario); si está abierto, `HH:mm–en curso`;
  - tiempo a imputar ya redondeado = `duracion_imputada_segundos` (el redondeo por parte que ya calcula la BD), formateado `formatDuration`; para partes abiertos «—»;
  - checkbox «Imputado en Odoo»: marcado si `imputado_en_odoo`. Al marcarlo envía `editar_parte { id, version, imputado_en_odoo: true }`. Una vez marcado queda `disabled` y nunca se envía `false` desde esta vista. Deshabilitado también para partes abiertos y mientras hay un comando en curso. Error → mensaje `role="alert"` en la página.
  - botón «Imputar en Odoo» (solo icono, nuevo icono `send` de lucide) sin funcionalidad: `aria-disabled="true"`, `title`/`aria-label` «Imputar automáticamente en Odoo (próximamente)», `onClick` no hace nada.
- B4. En columnas estrechas (6–7 días) el check y el botón pasan debajo de la franja (container query) para que franja, tiempo y controles sigan legibles. Sin scroll de página en 1280×720 y 1440×900 con una semana típica (≤ 5 partes/día). La tabla ocupa el alto disponible; si un día tiene más partes de los que caben, solo esa columna hace scroll interno (fallback), nunca la página. Día sin partes: «—» atenuado.
- B5. Rutas: `paths.timesheet = '/parte-semanal'`, título «Parte semanal». `/tablero` redirige (`<Navigate replace>`) a `/parte-semanal`. Menú «Trabajo»: «Tablero de tareas» se sustituye por «Parte semanal» (icono `grid`). `safeReturnTo` acepta `/parte-semanal` y sigue aceptando `/tablero`.
- B6. La regla «no desmarcable» aplica **solo** a esta vista. «Partes de horas» y el modal de edición no cambian. Sin migraciones de BD.

## Enfoque

- `src/features/timesheet/timesheet.model.ts` (puro, testeable con `node --experimental-strip-types`): `buildTimesheetWeek({ entries, tasks, monday })` → `{ days: { date, isWeekend, items, loggedSeconds }[], loggedSeconds }` con la regla de fin de semana, orden, franjas (`formatRange(entry)`) y totales (solo partes finalizados). Importaciones con extensión `.ts` como `week.model.ts`.
- `src/features/timesheet/TimesheetPage.tsx` + `timesheet.css` (grid CSS de N columnas, `height: calc(100dvh - offset)`, tokens existentes `--surface`, `--border`, `--accent`, `--font-mono`).
- `src/features/tasks/taskQueue.ts` (puro): `taskQueue({ tasks, projects, entries, query, projectId, archiveMode })` → grupos y `pickFocus(...)` para A2/A3/A5. `TasksPage.tsx` reescrito para usarlo; `TaskQueue.tsx` como componente de la cola; estilos en `src/features/tasks/task-queue.css` (se eliminan los selectores `.backlog*` y `.task-aside` de `components.css` si quedan sin uso).
- `Icon.tsx`: añadir `send: Send`.
- `App.tsx`, `paths.ts`, `WorkspaceLayout.tsx`, `returnTo.ts`, `tests/returnTo.test.ts` actualizados.
- Arnés `tools/ui-smoke/main.tsx`: añadir rutas `/tareas` y `/parte-semanal`; mover el `<details>` de «Operaciones de prueba» a un overlay `position: fixed` fuera del flujo del documento para que no altere la medición de scroll; ampliar los partes de `repository.ts` para una semana con varios días (incluido un parte abierto, uno imputado y uno con ID Odoo) para la verificación visual.

## Decisiones (confirmadas por el usuario)

- Un item por parte (no agrupado). Bloqueo de Odoo solo en la nueva vista. L–V + fin de semana si hay partes. Nombre «Parte semanal», `/tablero` redirige.

## Decisiones del planificador (reversibles)

- La cola va en columna lateral (reutiliza el layout existente), no debajo del detalle, para que «siguientes» se vea sin pasar por la lista de partes de la tarea.
- Finalizadas y archivadas se agrupan en un único modo de búsqueda explícito.
- Sin diálogo de confirmación al marcar «imputado»: el `title` del checkbox avisa de que no se puede desmarcar desde aquí; la corrección sigue siendo posible en «Partes de horas».

## No objetivos

- Integración real con Odoo. Cambios en BD/RPC. Cambios en `TaskDetail`/`TaskEntries` más allá de lo necesario. Drag & drop.

## Riesgos

- «Sin scroll» depende de la altura de cabecera del layout; se mide en el arnés con Playwright.
- `useCommand` concurrente: se deshabilitan los checks mientras `pending`.
- Riesgo preexistente conocido (no se corrige aquí, sin cambios de BD): `editar_parte` recalcula la jornada con la zona de la jornada aunque no se envíe `inicio_en`. Si el usuario cambió la zona del perfil y un parte quedó asociado a una jornada de otra zona cerca de medianoche, marcar Odoo puede mover el parte de día o fallar con `CONFIRMAR_CAMBIO_ZONA`. Ya ocurre hoy con el checkbox de «Partes de horas». Si falla, la vista muestra el error del comando. Se recomienda una migración aparte que preserve `jornada_id` en cambios solo de estado.

## Verificación

1. `npm run typecheck` → sin errores.
2. `npm run lint` → sin errores.
3. `npm test` → todo verde, incluidos nuevos `tests/timesheet.test.ts` (rango de semana, regla de fin de semana, orden, `(+N)` con N=1 y N=2 y un parte que cruza un cambio de horario, parte abierto, eliminados excluidos, totales) y `tests/taskQueue.test.ts` (prioridad de foco A2, exclusión de completadas/archivadas, modo finalizadas, filtros, límite 20), y `returnTo` actualizado.
4. `npm run build` → OK. `npm run format:check` → OK.
5. Visual con el arnés (`npx vite --config tools/ui-smoke/vite.config.ts`) + Playwright a 1440×900 y 1280×720:
   - `/parte-semanal`: `document.documentElement.scrollHeight <= innerHeight`; columnas L–V (+ finde solo si hay partes); marcar un check registra `editar_parte` con `imputado_en_odoo: true` en «Operaciones de prueba» y el check queda deshabilitado; botón Odoo no registra operación.
   - `/tareas`: no hay completadas en la cola; al activar «Finalizadas y archivadas» y buscar aparecen; clic en una fila cambia la tarea en foco.
   - Capturas de ambas vistas.
