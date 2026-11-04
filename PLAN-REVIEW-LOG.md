# Plan review log

- Fecha: 2026-11-03
- Host/planificador: Claude Code (Opus 5.5). Revisor del plan: Codex (modelo por defecto de su CLI, sin override). Builder: Claude. Inspector final: Codex (sesión nueva).
- Plan: PLAN.md. Rondas máx.: 5. Fix rounds máx.: 2. Inspección: on.
- Autorización: el usuario pidió modificar la app (implementación autorizada). No se autoriza commit/push.
- Decisiones del usuario: un item por parte; bloqueo Odoo solo en nueva vista; L–V + finde si hay partes; nombre «Parte semanal».

## Ronda 1 — Codex — REVISE
Resultado: scratchpad/r1/claudex-0xgg0y6o/result.json (fuera del repo). Modelo efectivo: gpt-6.1-sol (ultra), sandbox read-only. Plan sha256 dd5752…ee28d.
- R001 (medium) editar_parte recalcula jornada → marcar Odoo puede mover el parte de día tras cambiar zona. RECHAZADO (fuera de alcance; preexistente; documentado en Riesgos).
- R002 (medium) (+1) fijo incorrecto para partes multi-día. ACEPTADO → (+N).
- R003 (medium) <details> del arnés rompe la medición de scroll. ACEPTADO → overlay fixed.

## Ronda 2 — Codex — APPROVED
Resultado: scratchpad/r2/claudex-sgi9iy4a/result.json. Plan sha256 ef76b96b…452b4e. Sin hallazgos.

## Build (Claude) — desviaciones registradas en el plan
Base: 3679303. Cambios en PLAN.md durante la construcción: A3 excluye la tarea en foco de todos los grupos; A5 texto «N más sin mostrar». Nuevo sha256 171efc9d05e27154b0ab6edea9a182675c57b99938fae0ba9959ec1cf7afa5a5.

## Inspección 1 — Codex (sesión nueva) — REVISE
Resultado: scratchpad/i1/claudex-o2cfco6d/result.json.
- REVIEW-001 (medium) columnas estrechas desbordan. ACEPTADO → container query apila controles; .mono hereda tamaño. Verificado con 6 columnas a 1280x720 (sin desbordes, sin scroll de página; una columna con 5 partes usa scroll interno, fallback de B4).
- REVIEW-002 (medium) si falla la recarga tras guardar, el check se reactiva. ACEPTADO → estado local de partes confirmados.
- REVIEW-003 (low) etiqueta acaba en domingo aunque no se muestre. ACEPTADO → último día visible y prefijo «Semana del».
- REVIEW-004 (low) el arnés recalcula duración en cambios solo de estado. ACEPTADO.
Plan actualizado (B4); sha256 12086881cca9d2a0571a54a374066738a6eae110541de65d682e69250461a488. Pruebas re-ejecutadas: lint OK, tests OK, build OK, prettier (eol auto) OK.

## Inspección 2 — Codex (sesión nueva) — REVISE
Resultado: scratchpad/i2/claudex-8kvj8jhj/result.json.
- IR-001 (medium) la confirmación local podía ocultar una corrección posterior desde otra pestaña. ACEPTADO → override ligado a la versión devuelta; deja de aplicarse cuando los datos alcanzan esa versión.
- IR-002 (low) IDs de Odoo de 64 caracteres desbordan chips. ACEPTADO → truncado con title.
Presupuesto de inspección agotado (2/2): estos dos arreglos NO tienen inspección independiente. Pruebas re-ejecutadas: typecheck, lint, 131 tests, build y prettier (eol auto) OK; verificación visual con IDs de 64 caracteres sin desbordes.

# Ronda de cambios 2 (PLAN-2.md)
- Petición: cartas para archivadas con paginación (15), búsqueda que muestra ocultas, popup de tarea con partes, títulos completos en parte semanal, encabezado simplificado (fichaje y cronómetro con popup Ahora/Otra hora). Implementación autorizada. Sin commit.

## Plan 2 ronda 1 — Codex — REVISE
- P2-001 contradicción A4/enfoque. ACEPTADO.
- P2-002 el arnés no registra cronómetro/fichaje. ACEPTADO.

## Plan 2 ronda 2 — Codex — APPROVED
Resultado: scratchpad/p2r2/claudex-vxlqk6vp/result.json. Snapshot pre-build: scratchpad/pre-plan2/tree.tar.

## Plan 2 — Inspección 1 — Codex (sesión nueva) — REVISE
Resultado: scratchpad/p2i1/claudex-842vdx9h/result.json. Todos ACEPTADOS y corregidos:
- P2-001 popup de fichaje se desmontaba al pasar a pending → QuickAttendanceButton siempre montado; retry dentro. Arnés simula pending; verificado error y éxito.
- P2-002 página de archivo no se reiniciaba → reset en render al cambiar la clave.
- P2-003 foco desaparecía de la cola en modo archivo → solo se excluye fuera del modo archivo.
- P2-004 popup de cronómetro sin aviso de tareas vacías → aviso y submit ligado a tarea válida.
- P2-005 2 columnas por debajo de 1190px.
- P2-006 «Sin estimar» vs 0 en cartas.
Pruebas: typecheck, lint, 130 tests, build, prettier (eol auto) OK; verificación en navegador.

## Plan 2 — Inspección 2 — Codex (sesión nueva) — REVISE
Resultado: scratchpad/p2i2/claudex-7_58r9um/result.json. Presupuesto de inspección agotado (2/2).
- REVIEW-001 (medium) el editor manual usaba el fichaje vivo (versión nueva) → ACEPTADO y corregido: snapshot al abrir. SIN inspección independiente.
- REVIEW-002 (low) fidelidad del arnés (cronómetro inicial y tiempo transcurrido). NO corregido: solo afecta a la herramienta de pruebas, no a la app.
Pruebas tras el arreglo: typecheck, lint, 130 tests, build, prettier OK; editor de salida verificado en navegador.

# Ronda de cambios 3 (PLAN-3.md)
- Petición: estilo de botones de barra superior, biblioteca paginada y minimizable, dividida sincronizada, pantalla completa de sección, asociaciones de notas, buscadores con sugerencias (cada uno lo suyo; proyecto abre detalle), notas en popup de tarea, sustituir interruptor (investigado: pestañas con contador), enlace Odoo en parte semanal. Implementación autorizada. Sin commit.

## Plan 3 ronda 1 — Codex — APPROVED
Resultado: scratchpad/p3r1/claudex-57nl3516/result.json.

## Plan 3 — build (Claude)
Base de inspección: 941e430 (commit del usuario con Planes 1–2). Pruebas: typecheck, lint, 133 tests, build, prettier OK; verificación en navegador de todos los criterios.

## Plan 3 — Inspección 1 — Codex (sesión nueva) — REVISE
Resultado: scratchpad/p3i1/claudex-_v0jsx2d/result.json. Todos ACEPTADOS y corregidos:
- P3-001 (high) guardado tardío de otra nota podía reseleccionarla y perder cambios → ?nota espera a que no haya guardado/importación; diálogo de descarte bloqueado si busy; callbacks de guardar/eliminar ignorados si el editor ya no es el actual.
- P3-002 búsqueda de tareas/proyectos sensible a acentos → normalizeNoteSearch en taskQueue y lista de proyectos (+ test).
- P3-003 opción activa fuera de vista con teclado → scroll interno de la lista.
- P3-004 lista de notas desbordaba en móvil → overflow-y:auto.
- P3-005 raíl minimizado sobrescrito por media queries → mayor especificidad.
Pruebas: typecheck, lint, tests, build, prettier OK; verificación en navegador (1440, 1000, 560 px).

## Plan 3 — Inspección 2 — Codex (sesión nueva) — REVISE
Resultado: scratchpad/p3i2/claudex-8i30p792/result.json. Presupuesto de inspección agotado (2/2).
- P3-R2-001 (medium) pantalla completa con biblioteca minimizada dejaba el editor en 44px → clase de colapso solo fuera de pantalla completa. SIN inspección independiente.
- P3-R2-002 (low) la lista de sugerencias no volvía arriba al reescribir → scroll a 0 al cambiar el texto. SIN inspección independiente.
Pruebas tras los arreglos: typecheck, lint, 133 tests, build, prettier OK; ambos casos verificados en navegador.

# Ronda de cambios 4 (PLAN-4.md)
- Base 497bfa7. Petición: notas en tareas activas, filtros ocultables y paginación de 5 en partes, varias restas en calculadora, rediseño de datos ficticios (submenú plegable, cantidad secundaria), rediseño de ajustes. Implementación autorizada. Sin commit.

## Plan 4 ronda 1 — Codex — REVISE
- P4-001 conflicto externo sin barra. ACEPTADO.
- P4-002 Inmuebles con lotes propios. ACEPTADO (excepción D3b).
- P4-003 arnés no soporta guardar ajustes/hash. ACEPTADO.
- Ronda 2 intento 1: fallo operativo de Codex ("Selected model is at capacity"); no cuenta como veredicto. Reintento.
- Ronda 2 intento 2: mismo fallo de capacidad. DECISIÓN DEL USUARIO: construir con el plan revisado SIN reaprobación del plan (no consta como APPROVED) e inspeccionar el código con Codex al final.

## Plan 4 — build (Claude)
Base 497bfa7. Plan no reaprobado (fallo de capacidad de Codex; decisión del usuario). Pruebas: typecheck, lint, tests, build, prettier OK; verificación en navegador de A–E.

## Plan 4 — Inspección 1 — Codex (sesión nueva) — REVISE
Resultado: scratchpad/p4i1/claudex-2wgkzjib/result.json. Todos ACEPTADOS y corregidos:
- P4-IR-001 Odoo/Seguridad se desmontaban al cambiar de sección → todas las secciones montadas y ocultas (+ noValidate: submit() valida y muestra el error).
- P4-IR-002 días demasiado estrechos con el menú → container query (4 / 2 columnas).
- P4-IR-003 búsqueda solo con espacios no contaba como filtro → cuenta cualquier texto.
- P4-IR-004 bump del arnés antes de cargar Ajustes → espera al editor.
Pruebas: typecheck, lint, tests, build, prettier OK; verificación en navegador.

## Plan 4 — Inspección 2 — Codex (sesión nueva) — REVISE
Resultado: scratchpad/p4i2/claudex-3_o96m4s/result.json. Presupuesto de inspección agotado (2/2).
- P4-R2-001 (medium) tarjetas de redondeo apretadas en pantallas estrechas → container queries (6/3/2/1 columnas). SIN inspección independiente. Verificado en navegador a 1280, 1000 y 360 px sin solapamientos.
Pruebas tras el arreglo: typecheck, lint, 135 tests, build, prettier OK.

# Ronda 5 (PLAN-5.md) — cambios menores pedidos directamente
- Plan escrito a partir de la petición (sin revisión previa de Codex por ser cambios pequeños y explícitos). Sustituye Plan 1 B3/B6 (check no desmarcable).
- Pruebas: typecheck, lint, tests, build, prettier OK; verificación en navegador.

## Plan 5 — Inspección 1 — Codex (sesión nueva) — REVISE
Resultado: scratchpad/p5i1/claudex-ax8hbmoj/result.json. Ambos ACEPTADOS y corregidos:
- P5-001 con clic real `user-select: all` selecciona el valor y la guarda anulaba la copia → solo se cancela ante una selección parcial manual. Verificado con clics reales de Playwright (perfil, fecha, UUID).
- P5-002 si fallaba la recarga tras guardar, el check volvía al valor viejo → se aplica a la caché el valor y la versión devueltos (solo si la caché es más antigua).

## Plan 5 — Inspección 2 — Codex (sesión nueva) — REVISE
Resultado: scratchpad/p5i2/claudex-8ry_v178/result.json. Presupuesto de inspección agotado (2/2).
- P5-R2-001 (medium) arrastrar para seleccionar el valor completo también copiaba → se distingue el gesto: si el puntero se mueve > 4 px entre pulsar y soltar no se copia. SIN inspección independiente. Verificado con ratón real: clic copia, arrastre no copia.
Pruebas: typecheck, lint, 135 tests, build, prettier OK.

# Ronda 6 (PLAN-6.md) — cifrado de notas, gestor de contraseñas, búsqueda en notas, Mi semana
- Roles: host/coordinador y builder = Claude (Opus 5.5); revisor del plan e inspector final = Codex (modelo por configuración del CLI).
- Autorización: el usuario pidió implementar (planificar + construir). Commit/push no autorizados. Migración remota no autorizada.
- Decisiones del usuario: D1 clave maestra con cifrado en navegador; D2 navegación de semana a la cabecera y se elimina la edición del objetivo diario.
- Límites: 5 rondas de revisión, 2 de corrección, 2 inspecciones.

## Plan 6 ronda 1 — Codex (gpt-6.1-sol según rollout) — REVISE
Resultado: scratchpad/p6r1/claudex-lifbtd6q/result.json. 9 hallazgos (2 high, 6 medium, 1 low), todos ACEPTADOS e incorporados al plan:
R01 permisos RPC (definer privado + envoltorio invoker); R02 generación de bóveda en escrituras cifradas; R03 invariante sin texto en claro en tabla (trigger); R04 límites de tamaño del sobre (formato binario para notas, límites de credenciales); R05 aislamiento de sobres corruptos por nota; R06 borrado lógico de proyectos borra credenciales; R07 petición pendiente persistida en el borrador cifrado; R08 migración de borradores antiguos en claro; R09 /contrasenas en returnTo.

## Plan 6 ronda 2 — Codex (sesión reanudada) — REVISE
Resultado: scratchpad/p6r2/claudex-tpvij35t/result.json. 3 hallazgos, ACEPTADOS: R10 cambiar_clave valida generación+versión; R11 petición pendiente separada del borrador y reconciliada antes de reenviar; R12 orden único de bloqueos (perfil primero), sin advisory lock, DML directo de notas revocado.

## Plan 6 ronda 3 — Codex (sesión reanudada) — REVISE
Resultado: scratchpad/p6r3/claudex-f411j6pw/result.json. R13 (fixture de concurrencia de notes.mjs colgaría con el bloqueo de perfil) y R14 (tests existentes de DML directo y recuentos de catálogo) ACEPTADAS; plan ampliado con las adaptaciones de verificación.

## Plan 6 ronda 4 — Codex (sesión reanudada) — APPROVED
Resultado: scratchpad/p6r4/claudex-8zd00i3q/result.json. Sin hallazgos. Aprobación ligada al hash actual de PLAN-6.md.
- Desviación conocida (registrada, sin cambiar el plan aprobado): en D, `EntryModal` se mantiene en WeekPage porque también lo abre el botón «Registrar bloque manual» de la cabecera; solo se elimina su apertura desde DayCard.

## Plan 6 — build (Claude), commit base a78b84d
Implementado por Claude (único autor del código). Base a78b84d.
- Migración `20261104120000_encrypted_notes_and_credentials.sql`; cliente: `src/lib/crypto/vault.ts`, `src/features/vault/*`, `src/features/passwords/*`, notas cifradas (`useNotes`, `notesDraft`, `NoteEditor`, `NotesPage`), `TaskNotes`, Ajustes (`VaultSettings`), Mi semana sin `DayCard`/`DayGoalModal`, búsqueda con fragmento resaltado.
- Desviaciones: `EntryModal` se mantiene en Mi semana (lo usa el botón de la cabecera); `#cifrado` vive dentro de la sección Seguridad de Ajustes y no usa `<form>` propio porque Ajustes ya es un formulario; generador de contraseñas acotado a 4096 valores por llamada (límite de `getRandomValues` detectado por un test).
- Pruebas: typecheck, lint, 150 tests, build, prettier (eol auto), db:test 45 grupos (PostgreSQL 17.10) OK.
- Navegador (Playwright con Supabase simulado por rutas interceptadas, porque el remoto no tiene la migración y no hay sesión): Mi semana sin tarjetas y navegación en cabecera; búsqueda por cuerpo con fragmento resaltado; crear clave maestra cifra las 2 notas antiguas (servidor: título/contenido vacíos, sobre v1); guardar/crear nota sin texto en claro en la red; borrador cifrado en sessionStorage y restaurado tras recarga + desbloqueo; clave errónea rechazada; bloqueo; gestor: entrada por defecto Usuario+Contraseña, 2 campos personalizados, generar, mostrar, copiar, buscar (no busca en ocultos), editar, eliminar, sin texto en claro en la red; cambiar clave (la antigua deja de servir); restablecer; vista móvil 560 px. Corregidos durante la verificación: título de pestaña de /contrasenas, `<form>` anidado en Ajustes, alineación de filas de campos, insignia estirada en móvil.

## Plan 6 — Inspección 1 — Codex (sesión nueva) — REVISE
Resultado: scratchpad/p6i1/claudex-d9vyp8gg/result.json. 9 hallazgos, todos ACEPTADOS:
P6-IR-001 (high) cambiar clave tras reset en otra pestaña conservaba la clave antigua con la generación nueva; IR-002 el guardia de conflicto impedía reconciliar un guardado pendiente; IR-003 refs desactualizadas tras confirmar el pendiente; IR-004 clave y textos descifrados retenidos tras bloquear; IR-005 caché de notas con vínculos obsoletos; IR-006 fallos de migración silenciosos y notas en claro etiquetadas como cifradas; IR-007 cambios de los últimos 250 ms perdidos al bloquear; IR-008 credencial confirmada sin refrescar al cerrar el modal; IR-009 borrador antiguo en claro sin aviso si falla su cifrado.
Arreglos (Claude): IR-001 `changePassword` conserva la clave solo si coincide la generación; IR-002 un pendiente se reconcilia antes del guardia de conflicto (botón habilitado); IR-003 `accept` actualiza las refs de forma síncrona; IR-004 `useNotes` borra caché y resultado al bloquear, la migración se detiene y no retiene la clave; IR-005 la caché guarda solo texto y los vínculos salen siempre de la fila actual; IR-006 aviso «N notas siguen sin cifrar» con «Reintentar cifrado», estado «Guardada · sin cifrar todavía» y `handleError` en la migración; IR-007 volcado del borrador al bloquear (`registerFlush`) con secuencia de escritura global por clave; IR-008 refresco de credenciales al cerrar el editor; IR-009 el borrador antiguo se cifra al restaurarlo y, si falla, se avisa; aviso también si falla guardar el borrador.
Pruebas tras los arreglos: typecheck, lint, 150 tests, build, prettier, db:test 45 grupos OK. Navegador (Supabase simulado): bloquear justo después de teclear conserva el último cambio; dos pestañas (reset + recreación en B, cambio de clave en A) → A queda bloqueada.

## Plan 6 — Inspección 2 — Codex (sesión nueva) — REVISE
Resultado: scratchpad/p6i2/claudex-u4vmkr8i/result.json. Presupuesto de inspección agotado (2/2). 5 hallazgos, todos ACEPTADOS y corregidos SIN inspección independiente posterior:
- P6-IR2-001 (high) «Reintentar cifrado» con cambios sin guardar remontaba el espacio y perdía el borrador → el botón se deshabilita mientras hay cambios sin guardar.
- P6-IR2-002 (medium) `es_uuid` devolvía NULL con la generación ausente: reset sin generación borraba la bóveda → `es_uuid`/`es_sobre` nunca devuelven NULL y las generaciones se comparan con `is distinct from`; tests db de generación ausente en reset, cambio de clave, nota y credencial.
- P6-IR2-003 (medium) las claves tecleadas en Ajustes sobrevivían al bloqueo → se vacían al perder la clave en memoria.
- P6-IR2-004 (medium) el botón Atrás antes del debounce perdía el último cambio → volcado al desmontar salvo descarte explícito (`clearNoteDraft` invalida escrituras pendientes); test unitario.
- P6-IR2-005 (medium) la confirmación de borrar proyecto no avisaba de que borra sus contraseñas → texto del diálogo y del aviso actualizado.
Pruebas: typecheck, lint, 151 tests, build, prettier, db:test 45 grupos OK. Navegador (Supabase simulado): Atrás inmediato conserva el texto; descartar no recrea el borrador.

## Plan 6 — Corrección tras uso real (Claude, sin inspección independiente)
- Con la migración sin aplicar en el Supabase remoto, `notas_detalle` no devuelve `cifrado`/`boveda_generacion` y `assertNote` rechazaba la nota, bloqueando todo el espacio («La nota contiene datos incompletos o no válidos»). `withNoteDefaults` trata las columnas ausentes como nota en claro; test añadido. VaultGate indica que falta la migración (PGRST205). Pruebas: typecheck, lint, 152 tests, build OK.
