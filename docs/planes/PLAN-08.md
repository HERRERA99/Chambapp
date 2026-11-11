# Plan 8 — Rediseño visual de Parte semanal (tabla por tarea + timeline)

Base: rama `feat/agrupar-partes-generar-imputaciones`, árbol de trabajo con el Plan 7 sin commitear (HEAD 348ab57). Solo frontend; sin cambios de base de datos, dominio ni comandos.

## Petición del usuario

1. La timeline de abajo ha empeorado: con la tabla de arriba ocupando hasta el 45 % de la altura, cada columna de día tiene scroll interno y hay que desplazarse para ver todos los partes.
2. La tabla de arriba debe ser **vertical como la de abajo**: una columna por día.
3. Sus elementos deben ser **tarjetas espaciadas como las de la timeline**; al hacer **clic** se despliegan y muestran los campos que hay ahora (partes con casilla, imputaciones con «Deshacer», selección con total redondeado, botones de enviar deshabilitados y de marcar).
4. Buenas prácticas de UI: usable y armónico.

## Diagnóstico (fuentes)

- `src/features/timesheet/timesheet.css`: `.timesheet` tiene altura fija al viewport; `.timesheet-groups` `max-height: 45%`; `.timesheet__grid` `flex: 1; min-height: 240px`; `.timesheet__items` `overflow-y: auto`. Dos áreas de scroll anidadas compiten por la misma altura → columnas diminutas con scroll interno.
- `src/features/timesheet/components/TimesheetGroups.tsx`: lista horizontal por día (filas a todo el ancho), distinta de la cuadrícula de columnas.

## Diseño

### D1. Flujo de página en lugar de alturas fijas

- `.timesheet` pasa a altura automática; ninguna de las dos cuadrículas tiene scroll interno (`.timesheet__items` sin `overflow`). Cada columna crece con su contenido y la página hace un único scroll natural. Se elimina la regla de 45 % y el `min-height` de la cuadrícula.
- Razón: un solo eje de scroll es la práctica recomendada; las áreas de scroll anidadas ocultan contenido y obligan a desplazar varias zonas. Con las tarjetas de grupo plegadas (compactas) la timeline queda inmediatamente debajo.

### D2. Dos secciones con la misma cuadrícula de días

- Cada sección tiene una cabecera ligera (título + dato secundario):
  - «Partes por tarea» · dato secundario según estado (P8-001): «N pendientes» si hay partes terminados sin imputar; si además hay partes en curso, «· N en curso»; «Todo imputado» **solo** si hay partes y todos los grupos están en estado imputado; con partes en curso y nada pendiente, «N en curso»; semana sin partes, «Sin partes esta semana».
  - «Timeline» · «N partes».
- Ambas usan la **misma** estructura de columnas (`.timesheet__grid`, `--timesheet-days`, mismos días visibles, mismo resaltado de hoy, misma cabecera de día). Las columnas quedan alineadas verticalmente entre secciones: el lunes de arriba está sobre el lunes de abajo.
- Cabecera de día arriba: total imputable del día (agrupado). Abajo: total real del día (la timeline muestra duraciones reales), con `aria-label` distintos.
- Día sin grupos: «—» como hoy en la timeline.

### D3. Tarjeta de grupo (plegada)

- Misma caja que `.timesheet__item`: fondo `--surface`, borde sutil, borde izquierdo de color por estado (pendiente `--warning`, parcial `--accent-soft`, imputado `--success`), radio 4 px, mismo padding y `gap` entre tarjetas (6 px), tipografía 12 px.
- Contenido: título completo (con salto de línea como la timeline) + chip `odoo_id`; línea meta: «N partes» · real → **imputable** (mono); icono de estado a la derecha (mismo lenguaje que la timeline: `clock` pendiente, `minus` parcial, `check` imputado, `timer` en curso), con `aria-label`/`title`.
- Toda la cabecera de la tarjeta es un `<button aria-expanded aria-controls>` (objetivo de clic grande, accesible por teclado). Chevron que rota al desplegar. Hover/focus visibles como el resto de la app. El enlace a Odoo no va dentro del botón (no anidar interactivos): se muestra en el detalle como «Abrir en Odoo».

### D4. Tarjeta desplegada (columna estrecha)

- Detalle dentro de la misma tarjeta, separado por una línea sutil, apilado verticalmente para caber en columnas de ~150 px:
  - Partes pendientes/en curso: casilla + rango (mono) a la izquierda, duración real a la derecha; descripción debajo en `dim` si existe (truncada a 2 líneas con `title`).
  - Imputaciones: bloque verde compacto «✓ Imputado · N partes», rangos, «real → imputable», botón «Deshacer» pequeño.
  - Resumen en vivo: «N seleccionados: X → **Y**» o «Pendiente: **Y**».
  - Acciones a ancho completo, botones compactos (min-height 28 px, 11 px): primero las operativas («Marcar seleccionados», «Marcar todos»), después las de envío deshabilitadas («Enviar seleccionados», «Enviar todos (Y)», icono `send`, «próximamente»). Aviso de límite 1000 igual que ahora.
- Varias tarjetas pueden estar abiertas a la vez; el estado de selección y la reconciliación (`reconcileSelection`) se conservan tal cual.
- En columnas anchas (contenedor ≥ 260 px, p. ej. ≤ 900 px de viewport con una columna) los botones se colocan en 2 por fila mediante container query.

### D5. Responsive

- ≤ 900 px: ambas cuadrículas pasan a una columna (como ya hace la timeline); cada sección sigue su orden de días.
- Se mantienen las container queries existentes de la timeline para columnas estrechas.

## No cambia

- Lógica (`timesheet.model.ts`), comandos, caché, validaciones, base de datos y textos de los avisos.
- Comportamiento de los botones (enviar deshabilitado; marcar/deshacer operativos).

## Verificación

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npx prettier --check --end-of-line auto src tests tools/*.mjs package.json README.md docs/base-de-datos.md`.
- Arnés `tools/ui-smoke` (`npx vite tools/ui-smoke --config tools/ui-smoke/vite.config.ts`), `/parte-semanal`:
  - 1280×720 y 1440×900 con 6 columnas: ninguna columna tiene scroll interno; todos los partes de la timeline visibles con el scroll de página; columnas alineadas entre secciones; sin desbordes horizontales.
  - Desplegar la tarea con 3 partes del jueves, seleccionar 2 (05h 36m → 05h 45m), marcar, estado parcial, marcar todos, deshacer; teclado (Tab/Enter/Espacio) despliega y pliega.
  - 760×900: una columna, botones 2 por fila.
- Inspección final por Codex en sesión nueva.
