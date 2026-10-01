# Base de datos inicial de Chambapp

La migración `supabase/migrations/20261001181821_initial_chambapp.sql` implementa el modelo acumulado de los documentos v1, v2 y v3. Cuando hay cambios entre versiones, prevalece la v3 y las decisiones confirmadas en la conversación: redondeo de inicio y fin hacia arriba a límites del reloj de 5, 10 o 15 minutos.

Está preparada para un proyecto Supabase PostgreSQL nuevo. No borra ni adapta tablas de instalaciones anteriores. Antes de aplicarla a una base existente se debe revisar su esquema e historial de migraciones. Los modelos anteriores se conservan como documentación; no son migraciones que deban aplicarse por separado.

## Tablas y lectura

| Modelo | Tabla | Observaciones |
|---|---|---|
| PerfilUsuario | `public.perfiles` | Mismo UUID que `auth.users`; perfil creado al registrar una cuenta. |
| Proyecto | `public.proyectos` | Propietario, archivado, eliminación lógica y versión. |
| Tarea | `public.tareas` | Un proyecto; sus partes pueden pertenecer a distintas jornadas. |
| ConfiguracionSemanal | `public.configuraciones_semanales` | Versiones por lunes de entrada en vigor. |
| DiaConfiguracionSemanal | `public.dias_configuracion_semanal` | Reparto semanal, con suma validada al confirmar la transacción. |
| Jornada | `public.jornadas` | Una por usuario y fecha; zona horaria y objetivo históricos. |
| ParteHoras | `public.partes_horas` | Instantes reales, preferencias de redondeo copiadas, eliminación lógica y versión. |
| OperacionCronometro | `chambapp_private.operaciones_cronometro` | Resultado de peticiones de inicio y parada; acceso mediante RPC. |

Todas las tablas tienen RLS. En las tablas públicas, cada usuario autenticado solo puede leer sus datos. No hay acceso de lectura para `anon`. Las escrituras directas del cliente están revocadas: se realizan mediante RPC autenticada.

Las tablas de proyectos, tareas y partes permiten leer las marcas `eliminado_en` propias para reconciliar operaciones. Las vistas habituales del frontend deben filtrar `eliminado_en IS NULL`. El historial eliminado no aparece en las vistas de totales.

Vistas disponibles con `security_invoker = true`, respetando RLS:

- `partes_detalle`: intervalos reales e imputados, duración real e imputada en segundos, fecha de jornada y proyecto.
- `resumen_jornadas`: objetivos, totales reales e imputados, saldo en segundos y número de partes abiertos.
- `resumen_tareas` y `resumen_proyectos`: totales reales e imputados de partes finalizados.
- `resumen_semanas`: objetivos y totales por lunes. El objetivo incluye las jornadas existentes; se debe generar la semana completa para compararla con la planificación completa.

Los totales persistidos de las vistas no incluyen tiempo provisional de cronómetros abiertos. El frontend lo calcula usando el inicio confirmado y la referencia de hora del servidor.

## Escrituras desde el frontend

Una sola función pública define la interfaz inicial:

```ts
const { data, error } = await supabase.rpc('chambapp_operar', {
  p_accion: 'crear_proyecto',
  p_datos: { nombre: 'Web corporativa', descripcion: 'Proyecto de ejemplo' }
});
```

No se envía `usuario_id`: se obtiene de la sesión. Si se incluye un propietario en el JSON, no se utiliza. Los UUID de proyectos, tareas y partes los genera el servidor; los UUID de operaciones del cronómetro los genera el cliente.

| Acción | Campos de `p_datos` |
|---|---|
| `editar_perfil` | `version`; opcionales `nombre`, `zona_horaria`, `intervalo_redondeo_minutos`. |
| `crear_proyecto` | `nombre`; opcional `descripcion`. |
| `editar_proyecto` | `id`, `version`; opcionales `nombre`, `descripcion`, `archivado` booleano. |
| `crear_tarea` | `proyecto_id`, `titulo`; opcionales `descripcion`, `estado`, `estimacion_minutos`. |
| `editar_tarea` | `id`, `version`; opcionales `titulo`, `descripcion`, `estado`, `estimacion_minutos`, `proyecto_id`, `archivado`. |
| `crear_configuracion_semanal` | `minutos_semanales`, `vigente_desde` (lunes), `dias` (lista de números 1–7); opcional `reparto` con minutos por día. |
| `generar_semana` | `lunes`, como fecha `YYYY-MM-DD`. |
| `editar_jornada` | `id`, `version`; opcionales `minutos_objetivo`, `notas`. |
| `crear_parte` | `tarea_id`, `inicio_en`, `fin_en`; opcional `descripcion`. Ambos instantes deben incluir zona/desplazamiento UTC. |
| `editar_parte` | `id`, `version`; opcionales `tarea_id`, `inicio_en`, `fin_en`, `descripcion`, `confirmar_zona`. |
| `eliminar_proyecto` / `eliminar_tarea` | `id`, `version`, `confirmar_cascada: true`; opcional `descartar_activo: true`. |
| `eliminar_parte` | `id`, `version`; opcional `descartar_activo: true`. |
| `iniciar` | `operacion_id`, `tarea_id`; opcional `descripcion`. |
| `detener` | `operacion_id`, `parte_id`. |
| `consultar_operacion` | `operacion_id`. |
| `consultar_cronometro` | Objeto vacío. |

En las ediciones, omitir un campo mantiene su valor; enviar `null` borra los campos opcionales. Campos obligatorios no admiten `null`. La API no permite cambiar propietario, fechas de control, versión, preferencias históricas de un parte o marca de eliminación libremente. `archivado: false` permite desarchivar.

Ejemplo de reparto automático:

```json
{
  "minutos_semanales": 2250,
  "vigente_desde": "2026-10-05",
  "dias": [1, 2, 3, 4, 5]
}
```

Ejemplo de reparto ajustado, cuya suma debe seguir siendo 2250:

```json
{
  "minutos_semanales": 2250,
  "vigente_desde": "2026-10-05",
  "dias": [1, 2, 3, 4, 5],
  "reparto": { "1": 480, "2": 480, "3": 480, "4": 480, "5": 330 }
}
```

## Cronómetro y reintentos

La intención debe persistirse en el cliente antes de enviar la petición, con un UUID de operación y sus parámetros. Al reintentar se utiliza el mismo UUID y el mismo objeto. Iniciar y detener guardan su efecto y resultado en una transacción, serializando las operaciones de cada usuario mediante un bloqueo del perfil.

```ts
// Persistir esta petición localmente antes de enviarla.
const peticion = { operacion_id: crypto.randomUUID(), tarea_id: tareaId };
const { data, error } = await supabase.rpc('chambapp_operar', {
  p_accion: 'iniciar', p_datos: peticion
});
```

Las respuestas de inicio y parada tienen `ok`, `parte` y, cuando corresponde, `hora_servidor`. Si ya hay un cronómetro activo, un inicio distinto devuelve `ok: false` y `codigo: 'CRONOMETRO_ACTIVO'`; ese resultado se conserva para su UUID. Una parada de un registro eliminado devuelve `PARTE_ELIMINADO`. Reutilizar un UUID con otros parámetros provoca `OPERACION_ID_REUTILIZADO`.

`consultar_operacion` devuelve `encontrada`, el `resultado` original y `parte_actual`, que puede haberse editado, finalizado o eliminado desde entonces. Una operación no encontrada no demuestra por sí sola que una petición pendiente vaya a fallar: se reintenta con el mismo ID y se vuelve a reconciliar. `consultar_cronometro` devuelve el parte abierto o `null`, junto con `hora_servidor`.

Una respuesta perdida se recupera sin duplicar efectos. Si el servidor nunca recibió la parada, el reintento registra su hora de recepción; el usuario puede corregir el fin real después. Los fallos de red no se presentan como guardados confirmados. La cola local, los estados visuales y los reintentos de la interfaz quedan para la implementación del frontend.

## Edición, eliminación y errores

La versión leída es obligatoria al editar o eliminar. Se devuelve `CONFLICTO_VERSION` si otra operación la cambió. El backend incrementa las versiones y fechas de modificación. Finalizar un parte también cambia su versión. Un parte finalizado no puede reabrirse: reanudar crea uno nuevo.

Eliminar un proyecto o tarea elimina lógicamente sus partes en la misma transacción. Se exige confirmar ese alcance. Si hay un parte abierto se exige detenerlo primero o indicar expresamente `descartar_activo: true`. Una repetición de la eliminación no restaura nada ni vuelve a cambiar la fecha. Las jornadas y sus objetivos permanecen.

Archivar conserva las horas en informes; eliminar las excluye. No se crean tareas ni partes bajo entidades eliminadas. No se pueden archivar entidades con partes abiertos. Mover una tarea de proyecto mueve la atribución de todo su historial al proyecto destino del mismo usuario.

Al cambiar la fecha de inicio de un parte se reasigna su jornada según la zona histórica de origen. Si la jornada destino usa otra zona, se devuelve `CONFIRMAR_CAMBIO_ZONA:<zona>` y se exige enviar `confirmar_zona` con esa zona para aceptar el cambio. El redondeo no determina la jornada: un parte cerca de medianoche conserva su fecha de inicio real.

Errores de validación se devuelven mediante `error` de Supabase RPC. Además de los anteriores: `SESION_REQUERIDA`, `ZONA_HORARIA_INVALIDA`, `INTERVALO_REAL_FUTURO`, `REPARTO_SEMANAL_INVALIDO`, `CONFIRMACION_CASCADA_REQUERIDA`, `DETENER_O_DESCARTAR_ACTIVO` y `ACCION_NO_ADMITIDA`. Una restricción de exclusión rechaza solapamientos con código PostgreSQL `23P01`; una restricción única usa `23505`. Las respuestas `ok: false` de cronómetro son conflictos de negocio y no errores de transporte.

## Decisiones de implementación

- Intervalo inicial de 15 minutos y zona inicial `Europe/Madrid`, ambos editables.
- `tareas.usuario_id` es una copia técnica del propietario del proyecto. Claves foráneas compuestas garantizan su coherencia y la de jornadas y partes, también en escrituras privilegiadas.
- Las configuraciones semanales son de solo inserción: cambiar la planificación crea una versión. Se validan repartos dentro de la transacción; generar jornadas es repetible y conserva objetivos editados.
- El UUID de una operación se identifica junto a su usuario (`usuario_id`, `id`) para evitar colisiones entre cuentas. No hay eliminación automática del registro de operaciones.
- El historial de zona y redondeo se conserva. Se admite duración imputada cero. Se cuentan partes no solapados en tiempo real aunque sus intervalos redondeados coincidan.
- Un intervalo que cruza medianoche sigue imputado a la jornada de inicio, como en la v3. Trabajar en una tarea varios días se representa con distintos partes; la tarea no tiene una fecha única.
- La baja definitiva de cuenta, equipos, festivos, aprobaciones y reparto automático por tareas quedan pendientes, como indican los modelos.

Las funciones con privilegios de escritura están en `chambapp_private`, fuera de los esquemas expuestos de la API. La función pública es `SECURITY INVOKER`; el punto de escritura privado verifica la sesión, el propietario y cada acción admitida. El trigger de alta de Auth es una operación de sistema: crea el perfil para `NEW.id` y usa metadatos únicamente como nombre visible, nunca como autorización.

Referencias: [Supabase Auth y perfiles](https://supabase.com/docs/guides/auth/managing-user-data), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) y [seguridad de funciones](https://supabase.com/docs/guides/database/functions).

## Aplicación y verificación

El flujo con los comandos instalados del proyecto se detalla en [ejecutar-migraciones.md](ejecutar-migraciones.md). `supabase/verify.sql` permite comprobar los objetos y permisos tras aplicar la migración.

La configuración local usa PostgreSQL 17, expone solo `public` y `graphql_public` y exige permisos explícitos de API. La migración inicial está aplicada en el proyecto [Chambapp](https://supabase.com/dashboard/project/azylnnujzpqwpzedkoxv), organización Aitor, región París (`eu-west-3`). Su versión local coincide con la registrada remotamente: `20261001181821`.

Con Docker funcionando, se puede iniciar el entorno Supabase local desde la raíz del repositorio:

```powershell
npx --yes supabase@2.119.0 start
npx --yes supabase@2.119.0 migration list --local
```

Para publicar en un proyecto nuevo seleccionado por el usuario, revisar primero las migraciones pendientes y después aplicarlas:

```powershell
npx --yes supabase@2.119.0 db push --project-ref <project-ref> --dry-run
npx --yes supabase@2.119.0 db push --project-ref <project-ref>
```

La autenticación de CLI y los permisos del proyecto son necesarios. También se puede aplicar la migración mediante el plugin de Supabase y su operación `apply_migration`, después de identificar y revisar el proyecto destino. Tras publicar se deben consultar los advisors de seguridad y rendimiento, verificar el alta real de Auth y probar la RPC a través de la API.

Pruebas reproducibles sin Docker:

```powershell
cd tools/db-tests
npm ci --ignore-scripts
npm test
```

La suite usa PostgreSQL 17.10 real y recrea únicamente las tablas/roles mínimos de Auth para probar SQL, RLS y permisos. Comprueba 12 grupos de casos: migración, alta de perfil, aislamiento, validación de zona/versiones, propiedad, reparto semanal, redondeo y DST, partes y solapamientos, historial/edición, reintentos, concurrencia/borrado y catálogo de seguridad. Los directorios temporales contienen solo datos sintéticos y se conservan tras detener el servidor.

Resultado: todos los grupos pasan. Además, `supabase/verify.sql` se ha ejecutado correctamente en el proyecto alojado. Una prueba remota transaccional ha validado el trigger de perfil en `auth.users`, RLS bajo el rol `authenticated`, creación de proyecto y tarea, inicio idempotente, parada y lectura de partes. Se han comprobado las restricciones diferidas y revertido la transacción sin dejar datos de ejemplo. Los advisors remotos no muestran errores ni advertencias; hay avisos informativos por índices aún sin uso y por la tabla interna con RLS sin políticas (su acceso directo está revocado de forma intencionada). Docker está instalado, pero su motor no estaba activo durante la verificación local. La prueba completa de registro y login a través de la interfaz queda para la implementación del frontend.

Referencias de esos avisos: [índices sin uso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) y [RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
