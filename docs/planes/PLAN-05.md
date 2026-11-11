# Plan 5 — Ajustes menores (petición directa del usuario)

Base: working tree sobre 497bfa7 con el Plan 4 aplicado (sin commit).

- A. Datos ficticios: los tipos de cada familia se muestran **siempre** como tarjetas compactas (se elimina el plegado de Plan 4 D2 y la línea «Tipo: … · Cambiar tipo»). Las tarjetas de Desarrollo (UUID v4, Texto plano) usan el mismo tamaño compacto (icono + título, descripción en `title`).
- B. Clic para copiar: además del icono, hacer clic en el texto de un valor generado lo copia (fichas de usuario, fichas de identificadores, códigos de inmuebles, UUID y texto plano). Si hay una selección de texto manual, no se copia. El icono de copiar se mantiene para teclado.
- C. Partes de horas: botón «Imputar automáticamente en Odoo (próximamente)» (mismo componente que el parte semanal, sin funcionalidad, `aria-disabled`) en la columna Acciones de cada parte finalizado.
- D. Parte semanal: **se sustituye Plan 1 B3/B6 «no desmarcable»**: el check de imputado se puede marcar y desmarcar (envía `imputado_en_odoo: true|false`); sigue deshabilitado en partes abiertos y mientras hay un comando en curso. Se elimina el bloqueo local por versión de Plan 1 (IR-001), que solo tenía sentido con el check irreversible.

Verificación: typecheck, lint, tests, build, prettier (eol auto); navegador: submenús visibles tras elegir tipo, tarjetas de Desarrollo de 42px, clic en valor copia (portapapeles simulado), UUID copia, check se desmarca (`false`) y se marca (`true`), botón Odoo en partes finalizados sin operación.
