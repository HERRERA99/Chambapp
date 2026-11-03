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
