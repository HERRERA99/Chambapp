# Plan 13 — Reestructurar la app: menos páginas, una sola vista de la semana

## Por qué

La app tiene 15 entradas en el menú y cinco páginas de tiempo que repiten casi lo mismo (auditoría del 2026-11-22):

- «Mi semana» nació como calendario de jornadas; al quitarle las tarjetas por día (Plan 06) se quedó con 8 bloques, la mitad duplicados (el fichado semanal aparece dos veces en la misma página; el gráfico es el del Resumen; el bloque fichado/imputado es el de Entradas y salidas).
- «Parte semanal» nació para sustituir al kanban (Plan 01), no a «Mi semana», y sobre ella se construyó todo lo de Odoo.
- El imputado se calcula de dos formas: Parte semanal redondea por tarea y día (lo que se envía a Odoo); el resto redondea cada parte por separado. Las cifras no coinciden entre páginas.

El uso real del usuario: ficha, apunta partes (a veces todo el viernes) y quiere que cada día lo imputado esté entre el 90 % y el 100 % de lo fichado. El objetivo de horas diario se mantiene (no todo el mundo tiene horario flexible), pero en segundo plano.

## Decisiones

- D1. Menú de 8 entradas sin secciones plegables: **Hoy**, **Semana**, **Registros**, **Tareas**, **Calendario**, **Notas**, **Contraseñas**, **Herramientas**. **Ajustes** al pie, junto al perfil.
- D2. Las direcciones actuales siguen funcionando (ninguna se rompe).
- D3. El imputado que se muestra en toda la app es el de Odoo: suma de los partes de cada tarea y día redondeada una vez (`groupRounding`). Junto a él, el tiempo real. Se deja de mostrar el imputado «por parte».
- D4. % del día = imputado ÷ fichado. Colores: verde 90–100 %, ámbar 85–90 %, rojo < 85 % o > 100 %. Umbrales configurables en Ajustes → Jornada.
- D5. Las jornadas de la semana se generan solas a partir del reparto (sin aviso ni botón «Generar jornadas»).
- D6. Objetivo de horas y balance en segundo plano en Semana («Fichado 31:07 de 40:00»).

## Fases

1. **Menú · Hecha.** Se estableció la navegación nueva y se agruparon las páginas existentes en pestañas:
   - Hoy → `/resumen`.
   - Semana → pestañas «Mi semana» (`/mi-semana`) y «Partes por tarea» (`/parte-semanal`). `/semana` lleva a la primera.
   - Registros → pestañas «Partes» (`/partes-de-horas`) y «Fichajes» (`/fichajes`). `/registros` lleva a la primera.
   - Tareas → pestañas «Tareas» (`/tareas`) y «Proyectos y clientes» (`/proyectos`).
   - Calendario → `/calendario`. Notas → `/notas`. Contraseñas → `/contrasenas`.
   - Herramientas → pestañas «Porcentajes», «Calculadora de horas», «Datos ficticios», «Utilidades de desarrollo» (sus rutas actuales). `/herramientas` lleva a la primera.
2. **Semana · Hecha.** Una sola página en `/semana` reúne el gráfico, los totales y una fila por día con fichado, imputado, porcentaje, estado en Odoo y solicitudes de Hera. El detalle muestra fichajes y partes por tarea. Desde la cabecera se puede enviar a Odoo, exportar e imprimir. Se aplican D3–D6.
3. **Hoy y Registros · Hecha.** Hoy muestra el balance del día y los avisos semanales. El simulador de redondeo está disponible en Ajustes y durante la configuración inicial. El país y la región de festivos se eligen en Ajustes.
4. **Limpieza · Hecha.** Se retiraron las páginas antiguas y el código exclusivo de esas vistas. `/mi-semana`, `/parte-semanal` y `/tablero` llevan a `/semana`.

El menú final muestra **Hoy**, **Semana**, **Registros**, **Tareas**, **Calendario**, **Notas**, **Contraseñas** y **Herramientas**. **Ajustes** aparece al pie, junto al perfil.

## Criterios de aceptación de la fase 1

- A1. El menú lateral muestra exactamente las 8 entradas de D1, sin secciones plegables; Ajustes está al pie. Con el menú contraído se ven los iconos con su `title`.
- A2. Una entrada está activa cuando la ruta actual es cualquiera de sus pestañas (p. ej. Semana activa en `/parte-semanal`).
- A3. Las páginas con pestañas muestran una barra de pestañas encima del contenido; cada pestaña es un enlace a su ruta actual y la activa se marca (`aria-current="page"`). Navegable con teclado.
- A4. `/semana`, `/registros` y `/herramientas` redirigen a su primera pestaña. Todas las rutas anteriores siguen funcionando.
- A5. El título de la cabecera (breadcrumb) usa el nombre de la entrada y, si hay pestañas, el de la pestaña.
- A6. Contador de tareas pendientes en la entrada Tareas, como ahora.
- A7. `npm test`, `npm run typecheck`, `npm run lint` y `npm run build:local` pasan.
