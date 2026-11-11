# Plan 4 — Notas en tareas activas, Partes de horas, restas múltiples, Datos ficticios y Ajustes

Base: commit 497bfa7 (Planes 1–3 confirmados por el usuario). Planes anteriores siguen vigentes salvo lo que se sustituye aquí.

## Criterios de aceptación

### A. Tareas activas — notas asociadas
- A1. En la pestaña «Activas», bajo el detalle de la tarea en foco, aparece la sección «Notas asociadas · N» (mismo componente `TaskNotes` del popup, Plan 3 F1), con enlaces que abren la nota en Notas.

### B. Partes de horas
- B1. El panel de filtros se puede **ocultar/mostrar** con un botón «Filtros» en una barra compacta encima de la tabla. El botón indica cuántos filtros están activos («Filtros · 2»). Si hay filtros activos y el panel está oculto, la barra muestra «Limpiar filtros». La preferencia (oculto/visible) se recuerda en `localStorage` (`chambapp:entries-filters-hidden`, fallback silencioso). Por defecto: visible.
- B2. La tabla se pagina de **5 en 5** (antes 25). El pie muestra «1–5 de N partes filtrados» y Anterior/Siguiente. La página vuelve a 1 al cambiar cualquier filtro (comportamiento existente).

### C. Calculadora de horas — varias restas
- C1. En «Restar una duración», la hora de referencia va seguida de una **lista de duraciones** a restar (cada una horas + minutos), empezando con una fila (1 h 45 min por defecto, como hoy). Botón «Añadir otra resta» añade una fila (0 h 0 min); cada fila (si hay más de una) tiene un botón «Quitar». Máximo 20 filas.
- C2. El resultado resta la **suma** de todas las duraciones válidas. Si alguna fila es inválida se muestra el error actual y no hay resultado. La ecuación muestra todas las restas: «17:30 − 1 h 30 min − 2 h 15 min = 13:45» y, si hay más de una, el total restado («Total: 3 h 45 min»). Copiar resultado igual que ahora.
- C3. Lógica pura `sumDurations(rows)` → minutos o `null`, testeada (incluye límites y filas inválidas).

### D. Datos ficticios — rediseño centrado en ver, generar y copiar
Objetivo: que los datos generados se vean sin desplazarse y que generar/copiar esté siempre a mano.
- D1. **Barra de selección compacta**: la fila de familias (Usuarios, Documentos personales, Bancos y empresas, Inmuebles, Desarrollo) se mantiene pero más baja (≈40px).
- D2. **Submenú que se minimiza**: en familias con varios tipos, las tarjetas grandes de tipo (DNI, Pasaportes…) solo se muestran desplegadas al entrar en la familia sin tipo elegido o al pulsar «Cambiar tipo». Al elegir un tipo, el submenú se **pliega** a una línea: «Tipo: DNI, NIF, NIE y CIF · Cambiar» (las tarjetas desaparecen). Cambiar de familia vuelve a mostrar el submenú desplegado (con el primer tipo ya generado). Cuando está desplegado, las tarjetas son más compactas (sin descripción larga visible salvo `title`).
- D3. **Barra de acciones única y pegajosa** (`position: sticky` bajo la barra superior) justo encima de los resultados, con: título del tipo + número de fichas; **«Generar de nuevo»** (botón primario, más destacado); opciones del tipo en línea y compactas (dominio de correo, tipo de documento, país, formato de texto); **«Copiar todo»**, JSON, CSV. La **cantidad** pasa a un selector pequeño y secundario dentro de esta barra («×1 ▾»: 1, 5, 10, 20), sin bloque propio.
- D4. Se elimina el bloque «Prepara tus ejemplos» (icono, título y descripción); la nota legal de datos sintéticos queda como texto pequeño al final.
- D5. Criterio medible: con 1 ficha de Usuarios a 1440×900, el primer valor generado (DOI) es visible sin desplazarse (top < 900px); con Documentos personales tras elegir tipo, igual. Atajo de teclado «G» (fuera de campos de texto) = Generar de nuevo, indicado en el `title` del botón.
- D3b. **Excepción Inmuebles** (`properties`, `cups`): `PropertyDataTools` genera y exporta sus propios lotes. Para estos tipos la barra unificada solo contiene título, «Generar ambos tipos» (regenera como hoy, cambiando la `key`) y la cantidad; copiar/exportar siguen en la barra propia de `PropertyDataTools` (no se duplica ni se conecta a los registros del padre).
- D6. No cambia: modelos de generación, tarjetas de ficha (`UserProfileCard`, `FakeDataRecordCard`), copiar por campo, regenerar ficha, validadores LEI/ISIN, herramientas de inmuebles y Desarrollo.

### E. Ajustes — una sección cada vez
- E1. Diseño en dos columnas: a la izquierda un **menú de secciones** vertical (Perfil y zona horaria, Jornada semanal, Redondeo, Odoo, Seguridad), cada una con icono y una línea de resumen del valor actual (p. ej. «37 h 30 min / semana», «R60 · Horas completas», «Europe/Madrid», «API key guardada/no configurada» si es barato de obtener, si no «Integración»). A la derecha solo se muestra **la sección elegida**. En < 900px el menú pasa a una fila horizontal desplazable.
- E2. La sección elegida se refleja en el hash (`#perfil`, `#jornada`, `#redondeo`, `#odoo`, `#seguridad`); el enlace existente `/ajustes#redondeo` abre Redondeo. Por defecto: Perfil. `#regional` (anterior) se acepta como alias de Perfil.
- E3. **Barra de guardado** pegajosa al pie del área de contenido que aparece si hay cambios sin guardar **o** si el perfil cambió en otra sesión (`dirty || changedElsewhere`); «Guardar» solo se habilita con cambios. Contenido: «Cambios sin guardar en: Jornada, Redondeo» + «Descartar» + «Guardar cambios». Se eliminan los botones de la cabecera y el pie «El histórico se conserva / Aplicar cambios». Las secciones con cambios muestran un punto en el menú. Mensajes de éxito/error se muestran sobre la sección activa. El aviso «El perfil ha cambiado en otra sesión» se mantiene y la barra muestra «Cargar valores actuales» también cuando el formulario está limpio.
- E4. Menos texto: los avisos explicativos largos de cada sección (p. ej. «Las horas de inicio y fin siempre se conservan», «El histórico conserva su regla», «Las jornadas conservan su zona») se reducen a una línea de ayuda o se mueven a un `<details>` «Cómo funciona». En Jornada, los 7 días se muestran en una fila de 7 columnas compacta (2 filas en pantallas estrechas). En Redondeo, el ejemplo de duración pasa a un `<details>` «Ver ejemplo».
- E5. La lógica de guardado (`submit`, validaciones, comandos) no cambia; Odoo y Seguridad siguen siendo acciones independientes del guardado.

## Enfoque
- `TasksPage.tsx`: `TaskNotes` bajo `TaskDetail` en Activas.
- `EntriesPage.tsx`: estado `filtersHidden` + barra; tamaño de página 5.
- `calculators.model.ts`: `sumDurations`; `TimeCalculatorPage.tsx`: filas dinámicas; CSS.
- `FakeDataPage.tsx` + `fake-data.css`: estado `pickerOpen`; barra sticky; quitar bloque intro; atajo «G».
- `SettingsPage.tsx`: navegación por secciones con hash, barra de guardado, resúmenes; ajustes de texto/CSS en `WorkdaySettings`, `RoundingSettings`, `RegionalSettings` (solo presentación).
- Arnés: ruta `/ajustes`; `executeCommand` con manejadores con estado para `editar_perfil` (comprueba y sube `version`) y `crear_configuracion_semanal` (añade configuración y días); `MemoryRouter` conserva `location.hash` en la entrada inicial. `SettingsPage` lee la sección desde `useLocation().hash` (funciona con MemoryRouter), sin depender de `RouteEffects`. Un botón de prueba del arnés (`?bump=perfil`) simula un cambio de perfil desde otra sesión (sube la versión en los datos).

## No objetivos
Cambios de BD/RPC; cambios en generadores de datos ficticios; cambios de lógica de guardado de ajustes.

## Riesgos
- La barra sticky de datos ficticios debe quedar bajo la barra superior (top = `var(--header-height)`).
- Hash de Ajustes: `RouteEffects` hace `scrollIntoView` del hash; con secciones ocultas no debe romper (el elemento existe al mostrarse).

## Verificación
1. `npm run typecheck`, `npm run lint`, `npm test` (nuevo test `sumDurations`), `npm run build`, `npx prettier --check --end-of-line auto` sobre lo tocado.
2. Navegador (arnés, 1440×900 y 1280×720):
   - Tareas: notas asociadas visibles bajo la tarea activa.
   - Partes: ocultar/mostrar filtros (persistente), contador de filtros, 5 por página.
   - Calculadora: añadir/quitar restas; 17:30 − 1:30 − 2:15 = 13:45; fila inválida → sin resultado.
   - Datos ficticios: primer dato visible sin scroll (D5); submenú plegado tras elegir tipo y «Cambiar» lo despliega; barra sticky al desplazar; «G» regenera; cantidad funciona.
   - Ajustes: una sección cada vez; `/ajustes#redondeo` abre Redondeo; barra de guardado aparece al modificar y desaparece al descartar/guardar (guardar registra `editar_perfil` en el arnés); con el formulario limpio y un cambio externo simulado, la barra muestra «Cargar valores actuales»; altura de página mucho menor (< 1400px por sección en 1440×900).
   - Datos ficticios / Inmuebles: la barra unificada no muestra copiar/exportar; los de `PropertyDataTools` siguen funcionando.
