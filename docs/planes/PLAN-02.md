# Plan 2 — Archivadas en cartas, búsqueda de ocultas, popup de tarea, títulos completos y encabezado simplificado

Base: working tree sobre el commit 3679303 con los cambios del Plan 1 (sin commit). El Plan 1 (`PLAN.md`) sigue vigente salvo lo que este plan sustituye explícitamente.

## Objetivo y criterios de aceptación

### A. Tareas — vista de finalizadas y archivadas (`/tareas`)
- A1. Con el interruptor «Finalizadas y archivadas» activado, el área principal (izquierda, donde está la tarea en foco) muestra los resultados como **cartas horizontales** con el mismo lenguaje visual que los items del parte semanal: fondo `--surface`, borde sutil, borde izquierdo de color por estado (completada = `--success`, archivada = `--dim`). Cada carta: título completo (puede ocupar varias líneas), chip del ID de Odoo si hay, proyecto, estado («Completada» / «Archivada»), y `imputado / estimación`. Rejilla de 3 columnas en ≥ 1190px, 2 en tablet, 1 en móvil.
- A2. **Paginación** de 15 cartas por página (se restaura `TaskPagination` del commit base). La página vuelve a 1 al cambiar búsqueda, proyecto o modo. Sustituye el límite de 20 del Plan 1 (A5): ya no hay límite ni texto «N más sin mostrar».
- A3. Al **hacer clic en una carta** se abre un **popup** (Modal ancho, `size="wide"`, ancho `min(1100px, 100% - 32px)`, con scroll interno) que contiene `TaskDetail` completo: estado, proyecto, Odoo, descripción, acciones (reabrir, editar, archivar/desarchivar, eliminar…), métricas y **todos sus partes de horas** (`TaskEntries`). La tarea en foco no cambia. Si la tarea desaparece (p. ej. eliminada) el popup se cierra.
- A4. Con el modo archivo activo, la columna derecha mantiene los filtros y la cola activa (En curso / Pendientes, filtradas igual) y no muestra el grupo de ocultas de B1 — se elimina el grupo «Finalizadas y archivadas» de la cola del Plan 1 (A5). El CSV exporta las cartas (todas las páginas) en modo archivo y las activas fuera de él.

### B. Tareas — buscar también encuentra ocultas
- B1. Con el interruptor **desactivado** y un texto de búsqueda no vacío, si hay tareas finalizadas/archivadas que coinciden (respetando el filtro de proyecto), la cola muestra un tercer grupo «Finalizadas y archivadas · N» con hasta 5 filas compactas y, si N > 5, un botón «Ver las N» que activa el modo archivo conservando la búsqueda. Clic en una de esas filas → mismo popup que A3 (no cambia el foco).
- B2. Sin texto de búsqueda nunca aparecen tareas finalizadas/archivadas en la cola.

### C. Parte semanal — título completo
- C1. El título de la tarea en cada item del parte semanal se muestra entero, con salto de línea (`overflow-wrap: anywhere`), y la carta crece en altura. Se elimina el truncado/elipsis. El ID de Odoo sigue truncándose con `title` (Plan 1 IR-002).
- C2. Se mantiene «sin scroll de página»; si un día no cabe, scroll interno de la columna (fallback ya aceptado en Plan 1 B4).

### D. Encabezado — fichaje simplificado
- D1. En el encabezado (modo `compact` de `AttendanceControls`) queda: badge Dentro/Fuera, tiempo transcurrido y **un solo botón** «Fichar entrada» / «Fichar salida». Al pulsarlo se abre un popup «Fichar entrada|salida» con dos opciones:
  - «Ahora mismo» (muestra la hora actual HH:mm en la zona del perfil) → ejecuta `attendance.start()` / `attendance.stop()` exactamente como hoy y cierra.
  - «Otra hora…» → sustituye el popup por el `AttendanceEditor` existente en modo `entry` (entrada) o `exit` (salida, con el fichaje activo).
  Errores de `start/stop` se muestran dentro del popup (`role="alert"`) y no se cierra.
- D2. Si hay un fichaje pendiente de confirmar, el botón sigue siendo «Reintentar fichaje» (sin popup), como hoy.
- D3. El modo no compacto (Resumen, Fichajes) no cambia.

### E. Encabezado — cronómetro simplificado
- E1. Sin cronómetro activo ni pausado, el encabezado muestra **un solo botón** «Iniciar cronómetro» (se eliminan el enlace a /tareas y el botón «Iniciar a otra hora»). Abre el popup existente de inicio (`StartTimerForm`) ampliado con un selector «Cuándo»: **«Ahora mismo»** (por defecto en este botón) / «Otra hora». Con «Ahora mismo» se ocultan fecha, hora y «Usar fin del último parte», y al enviar llama `tracker.start(taskId)` sin hora (igual que «Iniciar cronómetro» de la tarea). Con «Otra hora» el comportamiento es el actual.
- E2. `StartTimerButton` acepta `label` y `defaultWhen: 'now' | 'other'`. En `TaskDetail` sigue siendo «Iniciar a otra hora» con `defaultWhen="other"` (el selector también permite «Ahora mismo»). En el estado pausado del encabezado se mantiene «Reanudar» + el botón con `defaultWhen="other"`.
- E3. El resto del cronómetro (activo, pausado, pendiente) no cambia. Sin tareas activas, el popup muestra el aviso actual del selector vacío y el botón de enviar queda deshabilitado.

## Enfoque
- `taskQueue.ts`: quitar `archiveLimit` y el parámetro `archiveMode`; devolver siempre `inProgress`, `pending` (activas filtradas) y `hidden` (finalizadas/archivadas filtradas). `archiveMode` solo se usa en la página para elegir el contenido principal (cartas) y el conjunto del CSV, y para no mostrar el grupo de ocultas en la cola. Paginación en la página (`archivePage`, tamaño 15), con helper puro `paginate(list, page, size)` testeado.
- `TasksPage.tsx`: estado `popupId`; en modo archivo el área izquierda renderiza `ArchivedTaskCards` + `TaskPagination`; popup con `Modal size="wide"` + `TaskDetail`.
- Nuevo `components/ArchivedTaskCards.tsx` (+ estilos en `task-queue.css` o `archived-cards.css`).
- `TaskQueue.tsx`: grupo de ocultas (B1) con callback `onOpen` (popup) distinto de `onSelect` (foco); sin modo archivo dentro de la cola.
- `Modal.tsx`: prop opcional `size?: 'default' | 'wide'` → clase `modal--wide`.
- `AttendanceControls.tsx`: en `compact`, el botón abre `QuickAttendanceModal` (nuevo componente en `features/attendance/`).
- `StartTimerButton.tsx`: props `label`, `defaultWhen`; `StartTimerForm` con selector «Cuándo» (`SegmentedControl` existente). `TimerDisplay.tsx`: estado inactivo = solo `StartTimerButton label="Iniciar cronómetro" defaultWhen="now"`.
- `timesheet.css`: título con `white-space: normal; overflow-wrap: anywhere`.
- Arnés `tools/ui-smoke`: añadir tareas completadas/archivadas suficientes (≥ 20) para probar paginación. Sustituir los `noop` de `TrackerContext` y `AttendanceContext` por mocks con estado que registran cada llamada en `operations` (`tracker.start` con `{ taskId, startAt }`, `attendance.start/stop`) y actualizan `active` / `elapsedSeconds`; un flag `?fail=attendance` hace que `start/stop` rechacen para probar el error dentro del popup.

## No objetivos
Cambios de BD/RPC. Cambiar el modo no compacto de fichaje. Cambiar la lógica del cronómetro.

## Riesgos
- `TaskDetail` dentro del popup tiene sus propios modales (editar, confirmar, parte manual); `<dialog>` anidados con `showModal()` funcionan en navegadores modernos (ya se usaba así en el antiguo `TaskBoard`).
- «Ahora mismo» en fichaje usa la hora del servidor como hoy (`fichar_entrada`/`fichar_salida`); la hora mostrada es orientativa.

## Verificación
1. `npm run typecheck`, `npm run lint`, `npm test` (tests actualizados de `taskQueue`: grupo `hidden`, sin límite, `paginate`), `npm run build`, `npx prettier --check --end-of-line auto` sobre los archivos tocados.
2. Navegador (arnés, 1440×900 y 1280×720):
   - `/tareas`: buscar un texto que solo coincide con una completada con el interruptor apagado → aparece el grupo de ocultas; clic → popup con detalle y partes; el foco no cambia. Activar interruptor → cartas en el área principal, 15 por página, paginación funciona, clic → popup.
   - `/parte-semanal`: un título largo se ve completo en varias líneas; sin scroll de página.
   - Encabezado: un botón de fichaje → popup con «Ahora mismo» (registra `attendance.start` en `operations` y el badge pasa a «Dentro»; con `?fail=attendance` el error aparece en el popup y no se cierra) y «Otra hora…» (abre el editor). Un botón «Iniciar cronómetro» → popup con «Ahora mismo» por defecto (registra `tracker.start` con `startAt` **ausente/undefined**) y «Otra hora» (muestra fecha/hora y registra `startAt` ISO).

## Desviaciones registradas durante la construcción
- E1 también afecta al estado inactivo del cronómetro en Resumen (mismo componente `TimerDisplay`): muestra el único botón «Iniciar cronómetro». Coherente con la simplificación pedida.
- Encabezado: el estado de Odoo del cronómetro activo se oculta en la versión compacta para que el encabezado mantenga su altura fija (68px) y el parte semanal no haga scroll. Sigue visible en la tarea y en Resumen.
- A4: pulsar una tarea activa de la cola estando en modo archivo la pone en foco y sale del modo archivo (para que se vea).
- C1: en columnas estrechas el chip del ID de Odoo baja a su propia línea para no estrechar el título.
- Cola: las filas no pueden ser más anchas que la columna (corrige un scroll horizontal con títulos largos).
