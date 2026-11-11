# Plan 3 — Barra superior, Notas (biblioteca, dividida, pantalla completa, asociaciones), buscadores con sugerencias, pestañas de tareas, notas en el popup y enlace Odoo en el parte

Base: working tree sobre 3679303 con Planes 1 y 2 aplicados (sin commit). Los Planes 1 y 2 siguen vigentes salvo lo que este plan sustituye.

## Criterios de aceptación

### A. Barra superior — estilo de los dos botones
- A1. Fichaje y cronómetro inactivo se muestran como dos «chips» hermanos con la misma altura (34px), radio completo, icono + texto y sin la caja con borde actual (`.header-tracker` solo conserva su caja cuando hay cronómetro activo/pausado/pendiente).
  - Fichaje: el chip integra el estado (punto verde + tiempo transcurrido «03:00:00» cuando está Dentro; «Fuera» atenuado cuando no) y la acción («Fichar salida» / «Fichar entrada»). Un único botón que abre el popup del Plan 2 (D1). Con fichaje pendiente se mantiene «Reintentar fichaje».
  - Cronómetro: chip con acento («Iniciar cronómetro», icono play) que abre el popup del Plan 2 (E1).
- A2. Estados hover/focus visibles (`:focus-visible` con outline del acento). La altura del encabezado sigue siendo 68px (sin scroll en el parte semanal).

### B. Notas — biblioteca
- B1. La lista de la biblioteca se pagina: 8 notas por página, con `TaskPagination` reutilizado (etiquetas genéricas configurables: «notas»). La página vuelve a 1 al cambiar búsqueda o proyecto.
- B2. La biblioteca se puede **minimizar** como el menú lateral: botón (icono `sidebarClose`/`sidebarOpen`) en su cabecera; minimizada queda un raíl estrecho (≈44px) con el botón para expandir y el contador; el editor ocupa el resto. El estado se recuerda en `localStorage` (`chambapp:notes-library-collapsed`), con fallback silencioso si no hay almacenamiento.

### C. Notas — editor
- C1. **Vista dividida sincronizada**: en modo «Dividida», al desplazar el código la vista previa se desplaza a la posición proporcional equivalente y viceversa (relación `scrollTop / (scrollHeight - clientHeight)`), sin bucles de rebote (bandera de origen que ignora el evento reflejado). Al escribir se mantiene la sincronía (re-aplicar tras renderizar la vista previa).
- C2. Para que la sincronía tenga sentido, en modo dividido ambos paneles tienen la misma altura fija con scroll interno (el textarea no crece con el contenido).
- C3. **Pantalla completa de sección**: botón «Pantalla completa» (icono maximizar) en la barra del editor. Al activarlo se ocultan la cabecera de página y la biblioteca; el editor ocupa todo el área de contenido (alto `calc(100dvh - var(--header-height) - padding)`), con el menú lateral y la barra superior visibles. Botón «Salir de pantalla completa» y tecla Esc para salir. No usa la Fullscreen API del navegador.
- C4. **Asociaciones rediseñadas**: el bloque «Proyectos y tareas asociados» pasa a:
  - Cabecera con el título y el contador; contenido siempre visible (sin `<details>`).
  - Asociaciones actuales como **chips** agrupados («Proyectos», «Tareas»), cada uno con su botón «Quitar» (×, `aria-label`); las tareas muestran su proyecto en pequeño; las no disponibles aparecen como chip «No disponible» quitable.
  - Un único campo «Añadir proyecto o tarea» con sugerencias mientras se escribe (mismo componente de C/D): resultados agrupados Proyectos / Tareas, excluye los ya asociados; clic o Enter añade. Se respetan los límites de 100 por tipo (opción deshabilitada con aviso al llegar al límite).

### D. Buscadores con sugerencias (cada uno lo suyo)
- D1. Nuevo componente compartido `SearchSuggest` (patrón combobox ARIA: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `role="listbox"`/`option`): mientras se escribe muestra **todas** las coincidencias en un desplegable con scroll interno (máx. ≈320px), con título y una línea secundaria; ↑/↓ mueve, Enter abre, Esc cierra; clic abre. Se cierra al perder el foco. El texto escrito sigue filtrando la lista de la página como hoy.
- D2. Notas: el buscador de la biblioteca sugiere **notas** (título + extracto); clic → abre esa nota (pasando por el aviso de cambios sin guardar si procede).
- D3. Tareas: el buscador de la cola sugiere **tareas** (activas y ocultas; título + proyecto · estado · ID Odoo); clic → abre el **popup de la tarea** (Plan 2 A3).
- D4. Proyectos: el buscador de proyectos sugiere **proyectos** (nombre + cliente · estado); clic → abre el **detalle del proyecto** (`ProjectDetails`).
- D5. Coincidencia sin acentos ni mayúsculas (se reutiliza `normalizeNoteSearch`), por título/nombre, ID de Odoo, cliente o proyecto según el tipo.

### E. Tareas — pestañas en lugar del interruptor
- E1. Se elimina el interruptor «Finalizadas y archivadas». Encima del contenido principal se muestran pestañas (`role="tablist"`): «Activas · N» y «Finalizadas y archivadas · N», con N según búsqueda y proyecto. «Activas» = vista con tarea en foco; la otra = cartas paginadas (Plan 2 A1–A2). El enlace «Ver las N» del grupo de ocultas activa la segunda pestaña.
- E2. Justificación (investigación): los interruptores están pensados para ajustes binarios de efecto inmediato, no para cambiar entre dos conjuntos de contenido; el patrón establecido para alternar entre estados de una colección es una pestaña con contador (p. ej. «Open / Closed» en GitHub Issues), que además muestra cuántas hay en cada lado.

### F. Popup de tarea — notas asociadas
- F1. El popup de tarea (Plan 2 A3) añade, bajo el detalle, una sección «Notas asociadas · N» con las notas cuyo `tarea_ids` incluye la tarea: título, fecha de actualización y extracto (1 línea). Cada nota es un enlace a `/notas?nota=<id>` que abre esa nota en Notas. Sin notas: «Esta tarea no tiene notas asociadas.»
- F2. `NotesPage` acepta `?nota=<id>`: si existe, la selecciona al cargar (respetando un borrador sin guardar existente: si hay borrador de otra nota, se muestra el aviso de descartar).

### G. Parte semanal — enlace a Odoo
- G1. Si la tarea del parte tiene enlace de Odoo válido (`task.odoo_url ?? entry.odoo_url`, validado con `isOdooUrl`), el título del item es un enlace `<a target="_blank" rel="noopener noreferrer">` a esa URL, con `title` «Abrir en Odoo» e icono de enlace externo pequeño. Sin enlace, el título es texto como ahora. El check y el botón no cambian.

## Enfoque
- `src/shared/ui/SearchSuggest.tsx` + estilos en `components.css`; lógica pura de navegación por teclado mínima en el componente.
- `src/features/notes/notes.model.ts`: helper puro `syncScrollTarget(source, target)` (proporción) testeado; `NoteEditor` lo usa en `onScroll` de textarea y preview.
- `NotesPage.tsx`: paginación (`paginate` de `taskQueue.ts` movido a `src/lib/paginate.ts` y reexportado), colapso de biblioteca, modo pantalla completa (estado elevado desde `NoteEditor` mediante prop `fullscreen`/`onFullscreen`), `?nota=`.
- `NoteAssociations.tsx` reescrito (chips + `SearchSuggest`).
- `TaskPagination` con prop opcional `noun` (por defecto «tareas») y etiquetas acordes.
- `TasksPage.tsx`/`TaskQueue.tsx`: pestañas y `SearchSuggest`; popup con `TaskNotes` (nuevo componente).
- `ProjectsPage.tsx`: `SearchSuggest` en el buscador.
- `AttendanceControls`/`QuickAttendanceButton`/`TimerDisplay`: estilos de chip (`header-chip`), CSS en `components.css`/`attendance.css`.
- `TimesheetPage.tsx`: enlace Odoo.
- Iconos nuevos si faltan: `maximize`, `minimize`, `external` (lucide `Maximize2`, `Minimize2`, `ExternalLink`).
- Arnés: rutas `/proyectos`; datos con varias notas (≥ 10) para paginar y una tarea con `odoo_url`.

## No objetivos
Cambios de BD/RPC. Búsqueda global entre tipos. Sincronía exacta por línea (se usa proporcional).

## Riesgos
- La sincronía proporcional no alinea exactamente bloques de distinta altura (imágenes, tablas); aceptado.
- `?nota=` con un borrador pendiente de otra nota debe pasar por el diálogo de descarte.

## Verificación
1. `npm run typecheck`, `npm run lint`, `npm test` (nuevos tests: `syncScrollTarget`, `paginate` movido, `normalize`/filtros de sugerencias si se extraen a función pura), `npm run build`, `npx prettier --check --end-of-line auto` sobre lo tocado.
2. Navegador (arnés, 1440×900 y 1280×720):
   - Barra superior: chips con misma altura, encabezado 68px; ambos abren su popup.
   - Notas: 8 por página y paginación; minimizar/expandir biblioteca y persistencia tras recargar; dividida: desplazar el textarea mueve la vista previa (y viceversa); pantalla completa oculta cabecera y biblioteca, Esc sale; asociaciones con chips, añadir/quitar con sugerencias.
   - Sugerencias: escribir en Notas/Tareas/Proyectos muestra desplegable; teclado ↑/↓/Enter; clic abre nota / popup de tarea / detalle de proyecto.
   - Tareas: pestañas con contadores; «Ver las N» cambia de pestaña.
   - Popup de tarea muestra notas asociadas; el enlace abre la nota en Notas.
   - Parte semanal: el título con Odoo es un enlace con `target="_blank"`; sin Odoo no lo es.
