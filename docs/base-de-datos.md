# Base de datos de Chambapp

La migración `supabase/migrations/20261001181821_initial_chambapp.sql` implementa el modelo acumulado de los documentos v1, v2 y v3. La migración posterior `20261001213125_duration_rounding_and_preferences.sql` aplica la decisión más reciente: conservar el inicio y fin exactos y redondear únicamente la duración total hacia arriba. Añade también preferencias, finalización de onboarding, cliente y presupuesto de proyecto.

`20261002190139_odoo_and_attendance.sql` añade referencias opcionales de Odoo a las tareas y fichajes de presencia independientes de los partes. Mantiene las acciones anteriores de la RPC y sus datos históricos.

`20261002201755_manual_odoo_time_entry_status.sql` añade `partes_horas.imputado_en_odoo`, booleano obligatorio que empieza en `false` para datos existentes y nuevos. Esta marca manual identifica los partes pendientes de imputar en Odoo y no requiere ID o enlace en la tarea. No sincroniza datos ni envía horas a Odoo.

La cadena de migraciones se puede aplicar a un proyecto nuevo. La segunda migración actualiza una instalación que ya tiene la inicial, conserva sus registros, permisos y tipos de las vistas. Los modelos anteriores se conservan como documentación; no son migraciones que deban aplicarse por separado.

## Tablas y lectura

| Modelo                  | Tabla                                     | Observaciones                                                                                                      |
| ----------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| PerfilUsuario           | `public.perfiles`                         | Mismo UUID que `auth.users`; perfil creado al registrar una cuenta, `onboarding_completado` y `preferencias` JSON. |
| Proyecto                | `public.proyectos`                        | Propietario, cliente opcional, presupuesto opcional en minutos, archivado, eliminación lógica y versión.           |
| Tarea                   | `public.tareas`                           | Un proyecto; referencia y URL de Odoo opcionales; sus partes pueden pertenecer a distintas jornadas.               |
| ConfiguracionSemanal    | `public.configuraciones_semanales`        | Versiones por lunes de entrada en vigor.                                                                           |
| DiaConfiguracionSemanal | `public.dias_configuracion_semanal`       | Reparto semanal, con suma validada al confirmar la transacción.                                                    |
| Jornada                 | `public.jornadas`                         | Una por usuario y fecha; zona horaria y objetivo históricos.                                                       |
| ParteHoras              | `public.partes_horas`                     | Instantes reales, preferencias de redondeo copiadas, eliminación lógica y versión.                                 |
| OperacionCronometro     | `chambapp_private.operaciones_cronometro` | Resultado de peticiones de inicio y parada; acceso mediante RPC.                                                   |
| Fichaje                 | `public.fichajes`                         | Entrada y salida de presencia, jornada histórica, eliminación lógica y versión; sin redondeo.                      |
| OperacionFichaje        | `chambapp_private.operaciones_fichajes`   | Resultado de intenciones de creación, salida, edición y borrado; acceso exclusivamente mediante RPC.               |

Todas las tablas tienen RLS. En las tablas públicas, cada usuario autenticado solo puede leer sus datos. No hay acceso de lectura para `anon`. Las escrituras directas del cliente están revocadas: se realizan mediante RPC autenticada.

Las tablas de proyectos, tareas, partes y fichajes permiten leer las marcas `eliminado_en` propias para reconciliar operaciones. Las vistas habituales del frontend deben filtrar `eliminado_en IS NULL`. El historial eliminado no aparece en las vistas de totales.

Vistas disponibles con `security_invoker = true`, respetando RLS:

- `partes_detalle`: inicio y fin exactos, duración real e imputada en segundos, fecha de jornada, proyecto y referencias `odoo_id` / `odoo_url` actuales de la tarea. Los alias de compatibilidad `inicio_imputado_en` y `fin_imputado_en` contienen los mismos instantes exactos; la duración imputada se calcula aparte.
- `fichajes_detalle`: fichajes vivos, fecha y zona históricas de la jornada y duración exacta en segundos; `duracion_segundos` es `null` mientras la salida esté pendiente.
- `resumen_jornadas`: objetivos, totales reales e imputados, saldo en segundos y número de partes abiertos.
- `resumen_tareas` y `resumen_proyectos`: totales reales e imputados de partes finalizados.
- `resumen_semanas`: objetivos y totales por lunes. El objetivo incluye las jornadas existentes; se debe generar la semana completa para compararla con la planificación completa.

Los totales persistidos de las vistas no incluyen tiempo provisional de cronómetros abiertos. El frontend lo calcula usando el inicio confirmado y la referencia de hora del servidor. Las vistas `resumen_*` mantienen el significado de horas de tareas; la presencia se obtiene de `fichajes_detalle` y se compara por separado.

## Referencias de Odoo y presencia

`odoo_id` y `odoo_url` son independientes y opcionales. El ID admite `T` mayúscula seguido de uno o más dígitos, hasta 64 caracteres. El frontend normaliza el ID y guarda la URL canónica del navegador; la base admite HTTP(S), DNS ASCII/punycode, IPv4 e IPv6 válidas y puertos entre 0 y 65535, hasta 2048 caracteres. Se rechazan credenciales, espacios, controles y barras inversas. Las rutas, parámetros y fragmentos propios de Odoo se conservan. Guardar estos datos prepara la navegación; no sincroniza ni envía información a Odoo.

Cada parte tiene su propia marca `imputado_en_odoo`, también expuesta al final de `partes_detalle` para conservar el orden y tipo de sus columnas anteriores. `crear_parte` admite el booleano opcional; si se omite, queda pendiente (`false`). `editar_parte` permite cambiarlo usando `id` y `version`; omitirlo conserva su valor, enviar `false` lo vuelve a pendiente y `null` o valores no booleanos producen `IMPUTACION_ODOO_INVALIDA`. Los cronómetros nuevos comienzan pendientes; detenerlos conserva la marca actual. La marca no modifica instantes, duración, redondeo, jornada ni objetivos, y mantiene los permisos y reglas de versiones de los partes.

El formulario de partes permite marcarlo al crear o editar. La tabla permite cambiar la marca de partes finalizados, filtrar pendientes o imputados y exportar el estado en la columna «Imputado en Odoo» del CSV. El cambio rápido solo envía `id`, `version` y la marca; los tiempos conservan toda su precisión. Tras guardar o recibir un conflicto de versión se recarga el workspace antes de reintentar.

Un fichaje guarda presencia real y puede coexistir con un cronómetro de tarea. Se permiten varios intervalos por jornada, incluidos descansos y turnos que crucen medianoche. La restricción de exclusión comprueba solapamientos por usuario sobre todo el historial vivo; un intervalo abierto ocupa desde su entrada hasta el infinito. Solo puede existir uno abierto. Entrada y salida deben ser finitas, no futuras, y la salida debe ser posterior a la entrada. Dos sesiones pueden tocarse en el mismo instante.

La presencia nunca se redondea. Para los indicadores diarios y semanales, el frontend reparte los segundos de un turno entre los días locales que atraviesa según la zona actual del perfil, indicada en la comparativa. La zona histórica de cada fichaje se conserva para su edición. Los cambios de horario de verano usan los instantes reales. El porcentaje de imputación compara los segundos imputados de tareas con los segundos de presencia, pudiendo superar el 100 % por redondeo o registros independientes. La presencia cero no produce un porcentaje. Eliminar una tarea o proyecto conserva los fichajes.

## Redondeo de duración

`inicio_en` y `fin_en` nunca se ajustan a una cuadrícula del reloj. El cálculo usa el tiempo transcurrido entre esos instantes, incluidos segundos y fracciones, y aplica `ceil(segundos_reales / (intervalo_minutos * 60)) * (intervalo_minutos * 60)` a cada parte finalizado. El intervalo `0` conserva la duración exacta. Se admiten `0`, `5`, `10`, `15`, `30` y `60` minutos.

Un parte de 09:07 a 13:15 dura exactamente 4 h 8 min. Con intervalos de 15, 30 y 60 minutos, imputa respectivamente 4 h 15 min, 4 h 30 min y 5 h; las horas visibles siguen siendo 09:07 y 13:15. Una duración que ya coincide con un múltiplo no aumenta, pero un segundo adicional pasa al siguiente múltiplo. Los cambios de horario de verano se resuelven restando los instantes UTC reales, sin depender de los números del reloj local.

El intervalo se copia del perfil al crear el parte. Cambiar ajustes afecta a partes futuros; los existentes conservan su intervalo, incluso al editar su inicio o fin. La actualización del criterio recalcula las vistas de los partes existentes con sus intervalos conservados, sin reescribir los instantes. Las duraciones de cronómetros abiertos son `null` en `partes_detalle`; los informes suman únicamente partes finalizados.

## Escrituras desde el frontend

Una sola función pública define la interfaz inicial:

```ts
const { data, error } = await supabase.rpc('chambapp_operar', {
  p_accion: 'crear_proyecto',
  p_datos: { nombre: 'Web corporativa', descripcion: 'Proyecto de ejemplo' },
});
```

No se envía `usuario_id`: se obtiene de la sesión. Si se incluye un propietario en el JSON, no se utiliza. Los UUID de proyectos, tareas y partes los genera el servidor; los UUID de operaciones del cronómetro y de fichajes los genera el cliente.

| Acción                                 | Campos de `p_datos`                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `editar_perfil`                        | `version`; opcionales `nombre`, `zona_horaria`, `intervalo_redondeo_minutos`, `onboarding_completado` booleano, `preferencias` objeto JSON.      |
| `crear_proyecto`                       | `nombre`; opcionales `descripcion`, `cliente`, `presupuesto_minutos` entero no negativo.                                                         |
| `editar_proyecto`                      | `id`, `version`; opcionales `nombre`, `descripcion`, `cliente`, `presupuesto_minutos`, `archivado` booleano.                                     |
| `crear_tarea`                          | `proyecto_id`, `titulo`; opcionales `descripcion`, `estado`, `estimacion_minutos`, `odoo_id`, `odoo_url`.                                        |
| `editar_tarea`                         | `id`, `version`; opcionales `titulo`, `descripcion`, `estado`, `estimacion_minutos`, `proyecto_id`, `archivado`, `odoo_id`, `odoo_url`.          |
| `crear_configuracion_semanal`          | `minutos_semanales`, `vigente_desde` (lunes), `dias` (lista de números 1–7); opcional `reparto` con minutos por día.                             |
| `generar_semana`                       | `lunes`, como fecha `YYYY-MM-DD`.                                                                                                                |
| `editar_jornada`                       | `id`, `version`; opcionales `minutos_objetivo`, `notas`.                                                                                         |
| `crear_parte`                          | `tarea_id`, `inicio_en`, `fin_en`; opcionales `descripcion`, `imputado_en_odoo` booleano. Ambos instantes deben incluir zona/desplazamiento UTC. |
| `editar_parte`                         | `id`, `version`; opcionales `tarea_id`, `inicio_en`, `fin_en`, `descripcion`, `confirmar_zona`, `imputado_en_odoo` booleano.                     |
| `eliminar_proyecto` / `eliminar_tarea` | `id`, `version`, `confirmar_cascada: true`; opcional `descartar_activo: true`.                                                                   |
| `eliminar_parte`                       | `id`, `version`; opcional `descartar_activo: true`.                                                                                              |
| `iniciar`                              | `operacion_id`, `tarea_id`; opcional `descripcion`.                                                                                              |
| `detener`                              | `operacion_id`, `parte_id`.                                                                                                                      |
| `consultar_operacion`                  | `operacion_id`.                                                                                                                                  |
| `consultar_cronometro`                 | Objeto vacío.                                                                                                                                    |
| `fichar_entrada`                       | `id` UUID generado y persistido por el cliente; utiliza la hora de recepción del servidor.                                                       |
| `fichar_salida`                        | `id`, `version`; utiliza la hora de recepción del servidor.                                                                                      |
| `crear_fichaje`                        | `id`, `inicio_en`; opcional `fin_en` o `null`. Los instantes deben ser ISO 8601 con desplazamiento UTC explícito.                                |
| `editar_fichaje`                       | `id`, `version`; opcionales `inicio_en`, `fin_en`, `confirmar_zona`. Omitir la salida la conserva; `null` permite corregirla a abierta.          |
| `eliminar_fichaje`                     | `id`, `version`; eliminación lógica, también de un fichaje abierto.                                                                              |

En las ediciones, omitir un campo mantiene su valor; enviar `null` borra los campos opcionales. Campos obligatorios no admiten `null`. La API no permite cambiar propietario, fechas de control, versión, preferencias históricas de un parte o marca de eliminación libremente. `archivado: false` permite desarchivar.

Todas las acciones de fichaje devuelven la fila confirmada (`id`, propietario, jornada, instantes, versión y fechas de control). Sus escrituras están serializadas con el mismo bloqueo del perfil usado por el cronómetro y las demás acciones.

`onboarding_completado` comienza en `false`. `preferencias` comienza en `{}`, debe ser un objeto y se reemplaza completo si se envía: el frontend debe combinar los valores actuales antes de guardar un subconjunto. Almacena preferencias de presentación, región, recordatorios y flexibilidad; no interviene en autorización ni concede acceso. `cliente` admite hasta 200 caracteres no vacíos, o `null`; `presupuesto_minutos` admite cero, un entero positivo o `null`.

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
  p_accion: 'iniciar',
  p_datos: peticion,
});
```

Las respuestas de inicio y parada tienen `ok`, `parte` y, cuando corresponde, `hora_servidor`. Si ya hay un cronómetro activo, un inicio distinto devuelve `ok: false` y `codigo: 'CRONOMETRO_ACTIVO'`; ese resultado se conserva para su UUID. Una parada de un registro eliminado devuelve `PARTE_ELIMINADO`. Reutilizar un UUID con otros parámetros provoca `OPERACION_ID_REUTILIZADO`.

`consultar_operacion` devuelve `encontrada`, el `resultado` original y `parte_actual`, que puede haberse editado, finalizado o eliminado desde entonces. Una operación no encontrada no demuestra por sí sola que una petición pendiente vaya a fallar: se reintenta con el mismo ID y se vuelve a reconciliar. `consultar_cronometro` devuelve el parte abierto o `null`, junto con `hora_servidor`.

Una respuesta perdida se recupera sin duplicar efectos. Si el servidor nunca recibió la parada, el reintento registra su hora de recepción; el usuario puede corregir el fin real después. Los fallos de red no se presentan como guardados confirmados. El frontend conserva la cola local y muestra los estados pendientes y sus controles de reintento.

Los fichajes mantienen su propio registro de intenciones en `operaciones_fichajes`: la clave es usuario, ID del fichaje, acción y versión solicitada (0 para la creación). Repetir la misma acción con exactamente los mismos datos devuelve el resultado original, incluso si después se corrigió o eliminó la fila. Repetir una salida confirmada conserva su instante original. Cambiar los parámetros de una creación con el mismo UUID devuelve `FICHAJE_ID_REUTILIZADO`; cambiar los de una edición con la misma versión devuelve `CONFLICTO_VERSION`. El cliente debe persistir la intención completa antes del envío y actualizar el estado actual tras reconciliarla.

## Edición, eliminación y errores

La versión leída es obligatoria al editar o eliminar. Se devuelve `CONFLICTO_VERSION` si otra operación la cambió. El backend incrementa las versiones y fechas de modificación. Finalizar un parte también cambia su versión. Un parte finalizado no puede reabrirse: reanudar crea uno nuevo.

Eliminar un proyecto o tarea elimina lógicamente sus partes en la misma transacción. Se exige confirmar ese alcance. Si hay un parte abierto se exige detenerlo primero o indicar expresamente `descartar_activo: true`. Una repetición de la eliminación no restaura nada ni vuelve a cambiar la fecha. Las jornadas y sus objetivos permanecen.

Archivar conserva las horas en informes; eliminar las excluye. No se crean tareas ni partes bajo entidades eliminadas. No se pueden archivar entidades con partes abiertos. Mover una tarea de proyecto mueve la atribución de todo su historial al proyecto destino del mismo usuario.

Al cambiar la fecha de inicio de un parte se reasigna su jornada según la zona histórica de origen. Si la jornada destino usa otra zona, se devuelve `CONFIRMAR_CAMBIO_ZONA:<zona>` y se exige enviar `confirmar_zona` con esa zona para aceptar el cambio. El redondeo no determina la jornada: un parte cerca de medianoche conserva su fecha de inicio real.

La edición de entrada de un fichaje aplica la misma reasignación y confirmación de zona histórica. Su salida puede corregirse a `null` si no provoca solapamientos. `ENTRADA_REQUERIDA`, `ZONA_HORARIA_REQUERIDA`, `FICHAJE_NO_DISPONIBLE` y `FICHAJE_ID_REQUERIDO` identifican errores de fichaje; las restricciones de formato de Odoo son `tareas_odoo_id_formato` y `tareas_odoo_url_formato`.

Errores de validación se devuelven mediante `error` de Supabase RPC. Además de los anteriores: `SESION_REQUERIDA`, `ZONA_HORARIA_INVALIDA`, `INTERVALO_REAL_FUTURO`, `REPARTO_SEMANAL_INVALIDO`, `CONFIRMACION_CASCADA_REQUERIDA`, `DETENER_O_DESCARTAR_ACTIVO` y `ACCION_NO_ADMITIDA`. Una restricción de exclusión rechaza solapamientos con código PostgreSQL `23P01`; una restricción única usa `23505`. Las respuestas `ok: false` de cronómetro son conflictos de negocio y no errores de transporte.

## Decisiones de implementación

- Intervalo inicial de 15 minutos y zona inicial `Europe/Madrid`, ambos editables.
- `tareas.usuario_id` es una copia técnica del propietario del proyecto. Claves foráneas compuestas garantizan su coherencia y la de jornadas y partes, también en escrituras privilegiadas.
- Las configuraciones semanales son de solo inserción: cambiar la planificación crea una versión. Se validan repartos dentro de la transacción; generar jornadas es repetible y conserva objetivos editados.
- El UUID de una operación se identifica junto a su usuario (`usuario_id`, `id`) para evitar colisiones entre cuentas. No hay eliminación automática del registro de operaciones.
- El historial de zona y del intervalo de redondeo se conserva. Un parte válido tiene duración real positiva; con redondeo activo su duración imputada es al menos un intervalo. El helper admite cero para cálculos provisionales. Los solapamientos se validan sobre los instantes reales.
- Un intervalo que cruza medianoche sigue imputado a la jornada de inicio, como en la v3. Trabajar en una tarea varios días se representa con distintos partes; la tarea no tiene una fecha única.
- Los fichajes se vinculan a la jornada de entrada y conservan su zona histórica. Los indicadores de presencia reparten el intervalo entre días; no cambian la atribución histórica de los partes de tareas.
- La baja definitiva de cuenta, equipos, aprobaciones y reparto automático por tareas quedan pendientes, como indican los modelos.

Las funciones con privilegios de escritura están en `chambapp_private`, fuera de los esquemas expuestos de la API. La función pública es `SECURITY INVOKER`; el punto de escritura privado verifica la sesión, el propietario y cada acción admitida. El trigger de alta de Auth es una operación de sistema: crea el perfil para `NEW.id` y usa metadatos únicamente como nombre visible, nunca como autorización.

Referencias: [Supabase Auth y perfiles](https://supabase.com/docs/guides/auth/managing-user-data), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) y [seguridad de funciones](https://supabase.com/docs/guides/database/functions).

## Aplicación y verificación

El flujo con los comandos instalados del proyecto se detalla en [ejecutar-migraciones.md](ejecutar-migraciones.md). `supabase/verify.sql` permite comprobar los objetos y permisos tras aplicar la migración.

La configuración local usa PostgreSQL 17, expone solo `public` y `graphql_public` y exige permisos explícitos de API. Las tres migraciones están aplicadas en el proyecto [Chambapp](https://supabase.com/dashboard/project/azylnnujzpqwpzedkoxv), organización Aitor, región París (`eu-west-3`): `20261001181821`, `20261001213125` y `20261002190139`. La migración de Odoo y fichajes se verificó en PostgreSQL aislado antes del despliegue; el nombre del archivo local se alineó con la versión registrada por el plugin de Supabase. Los tipos TypeScript se regeneraron desde la base remota actualizada y `supabase/verify.sql` confirmó el catálogo y los permisos después de aplicar la migración.

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

La suite usa PostgreSQL 17.10 real y recrea únicamente las tablas/roles mínimos de Auth para probar SQL, RLS y permisos. Comprueba 27 grupos de casos: actualización con datos existentes y tipos de vistas, alta de perfil, aislamiento, validación de zona/versiones, onboarding/preferencias, cliente/presupuesto, propiedad, reparto semanal, todos los intervalos de duración, segundos y DST, partes y solapamientos, historial/edición, reintentos, concurrencia/borrado y catálogo de seguridad. Incluye formatos y navegación de Odoo, creación idempotente de fichajes, presencia independiente, permisos y propiedad, entradas y salidas manuales o automáticas, turnos nocturnos, ambos cambios DST, zona histórica, omisión y borrado de campos, repetición tras correcciones y carreras de entrada/salida/edición. La entrada manual abierta y su salida posterior conservan segundos y fracciones aunque el perfil redondee los partes de tareas. Los directorios temporales contienen solo datos sintéticos y se conservan tras detener el servidor. No simula el servicio GoTrue, la validación JWT ni PostgREST.

Resultado local de las cuatro migraciones: los 27 grupos pasan. La nueva migración conserva RLS, SECURITY INVOKER en las vistas y RPC pública, las restricciones de propiedad y la comprobación de versiones. La implementación anterior de las acciones se conserva en una función privada sin permisos de ejecución del cliente; el dispatcher actualizado valida la sesión y delega en ella las acciones anteriores.

La verificación remota documentada a continuación corresponde a la migración inicial y la de redondeo. `supabase/verify.sql` se ejecutó correctamente en el proyecto alojado antes de ampliar los checks de fichajes. Una prueba remota transaccional validó el trigger de perfil en `auth.users`, RLS bajo el rol `authenticated`, creación de proyecto y tarea, inicio idempotente, parada y lectura de partes. Se comprobaron las restricciones diferidas y se revirtió la transacción sin dejar datos de ejemplo. Los advisors remotos de esa revisión no mostraron errores ni advertencias; hubo avisos informativos por índices aún sin uso y por la tabla interna con RLS sin políticas (su acceso directo está revocado de forma intencionada). Docker está instalado, pero su motor no estaba activo durante la verificación local. La verificación de registro y login a través de la interfaz se realiza aparte de las pruebas SQL.

Referencias de esos avisos: [índices sin uso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) y [RLS sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Inicio retroactivo y credenciales de Odoo

La migración `20261005185736_selected_timer_start_and_odoo_credentials.sql` está aplicada al proyecto remoto y verificada con PostgreSQL 17 aislado y con el script remoto de catálogo y permisos. La versión local coincide con el historial de Supabase.

`iniciar` admite `inicio_en` opcional con un instante que incluya zona horaria. Si se omite, usa el reloj del servidor. Conserva el UUID de operación para reintentos y rechaza instantes futuros y solapamientos. La jornada corresponde a la fecha del inicio seleccionado. El botón «Usar fin del último parte» utiliza el último fin entre todas las tareas y conserva la precisión original.

La tabla `chambapp_private.odoo_credenciales` almacena una clave por usuario, tiene RLS y no concede acceso directo al cliente. La RPC pública `chambapp_configurar_odoo(p_api_key text default null, p_guardar boolean default false)` es SECURITY INVOKER y delega en una función privada que autentica al usuario y limita las operaciones a su cuenta. Con `p_guardar=false` devuelve solo si hay clave configurada; con `true` guarda o sustituye la clave, o la elimina si está vacía. Nunca devuelve la clave ni la incluye en los datos del workspace, preferencias, exportaciones o almacenamiento local. La clave puede configurarse opcionalmente en el tutorial inicial y posteriormente en Ajustes. No activa sincronización automática con Odoo.

## Calendario y tablero de tareas

La migración `20261006173904_holidays_calendar.sql` añade `public.ausencias` y la RPC `chambapp_calendario`. Las filas pertenecen al usuario autenticado; las políticas RLS restringen lectura, inserción, edición y eliminación a su propietario. La RPC es SECURITY INVOKER, comprueba versiones para ediciones y eliminaciones, y serializa las operaciones por cuenta. No expone datos a `anon`.

Aplicada y verificada en el proyecto remoto Chambapp. Una prueba bajo el rol `authenticated` comprobó objetivos de 0, 1920 y 2400 minutos al añadir vacaciones, conservar un festivo solapado y eliminar ambos. La transacción se revirtió sin dejar registros de prueba. El historial remoto y el nombre de la migración local coinciden. La revisión de seguridad no detectó incidencias de calendario; mantiene el aviso previo de [protección de contraseñas filtradas desactivada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Los intervalos de festivos y vacaciones incluyen ambas fechas. Una ausencia pone a cero el objetivo efectivo de cada día incluido, tanto en `buildWeek` (resumen, gráficos e informes) como en las vistas `resumen_jornadas` y `resumen_semanas`. Las jornadas conservan `minutos_objetivo` original: retirar una ausencia restaura el objetivo si no queda otra ausencia solapada. Las horas de esos días no se reparten entre el resto de la semana. Los partes y fichajes reales se conservan y siguen sumando tiempo trabajado si hubo actividad durante un día libre.

`/calendario` ofrece un calendario mensual y creación, edición y eliminación manual. La sincronización se inicia con un botón y consulta la [API de Nager](https://github.com/nager/Nager.Date) para el año visible y un país ISO de dos letras. Se pueden seleccionar festivos nacionales y una región devuelta por el servicio. Solo se importan los de tipo `Public`; se valida toda la respuesta antes de guardar y se agrupan nombres coincidentes en una fecha. La importación es atómica y usa `(usuario_id, ambito, inicio)` para actualizar sin duplicar un mismo ámbito. Conserva registros manuales y ámbitos anteriores; no elimina fechas ya guardadas que dejen de aparecer en la API. Editar un festivo importado lo convierte en manual. Los festivos municipales que no cubra el proveedor se añaden manualmente. No se requiere una clave ni una nueva dependencia.

`/tablero` y la opción Tablero de `/tareas` muestran las tres columnas del estado actual de las tareas: pendiente, en curso y completada. Comparten filtros de proyecto, estado, búsqueda y archivo. Permiten arrastrar tarjetas o usar un selector accesible para cambiar el estado, crear y editar tareas, consultar detalles y partes, controlar el cronómetro y abrir el enlace de Odoo. Los cambios se guardan con `editar_tarea`, incluyendo su versión y las comprobaciones existentes de propietario. No se añade un orden persistente de tarjetas, estados personalizados ni funciones de equipo.

Validación: 64 pruebas de dominio, pruebas semanales de ausencias y 33 grupos de pruebas en PostgreSQL 17 aislado. Incluyen intervalos solapados y entre semanas, restauración de objetivos, importación atómica e idempotente, RLS y transiciones del tablero. Compilación y lint correctos. La comprobación visual en el navegador quedó limitada por el bloqueo de Computer Use para Firefox.

## Notas Markdown

La migración `20261027144005_markdown_notes.sql` añade `notas`, `nota_proyectos` y `nota_tareas`, todas con RLS por propietario, claves foráneas compuestas por identificador y usuario e índices para lectura y asociaciones. `notas_detalle` es una vista `SECURITY INVOKER` que devuelve cada nota con `proyecto_ids` y `tarea_ids`; omite los vínculos a proyectos o tareas eliminados. Archivar un proyecto o una tarea conserva su vínculo. El texto Markdown se guarda exactamente como se recibe, incluidos saltos de línea y caracteres Unicode, con un máximo de 1 000 000 bytes UTF-8 por nota y 200 caracteres en el título.

La RPC `chambapp_notas(p_accion, p_datos)` admite `guardar_nota` y `eliminar_nota`. Guardar requiere `id` UUID del cliente, `titulo`, `contenido_md`, `proyecto_ids` y `tarea_ids`; al editar se añade `version`. El alta es repetible con el mismo UUID y los mismos datos. Las ediciones y eliminaciones verifican la versión actual para impedir sobrescribir cambios de otra sesión. El contenido y sus asociaciones se guardan en una única transacción. Los vínculos nuevos se validan contra registros accesibles del mismo usuario y se limitan a 100 proyectos y 100 tareas por nota. Eliminar una nota borra sus asociaciones mediante cascada y conserva los proyectos y tareas.

Las tres tablas y la vista revocan acceso a `anon`. La RPC ejecuta con los permisos del usuario, valida `auth.uid()` y usa un bloqueo por cuenta junto con un bloqueo de fila. Las claves foráneas y RLS impiden crear vínculos con datos de otra cuenta incluso mediante acceso directo a las tablas. La suite de PostgreSQL incluye conservación de Markdown, límites UTF-8, aislamiento, relaciones ajenas, atomicidad, versiones, ediciones simultáneas y eliminación. Se inicializa el PostgreSQL de pruebas en UTF-8 también en Windows.

La migración adicional de consistencia de vínculos comprueba el resultado final de las asociaciones antes de confirmar el guardado. Si un proyecto o una tarea se elimina en otra sesión entre la validación y la lectura final, toda la escritura de la nota se revierte. Una prueba concurrente detiene el guardado después de validar, elimina cada tipo de vínculo desde otra conexión y comprueba que no quedan la nota ni asociaciones parciales. La cadena completa supera 39 grupos de pruebas en PostgreSQL 17.10.

## Notas y contraseñas cifradas

La migración `20261104120000_encrypted_notes_and_credentials.sql` añade cifrado en el navegador para las notas y el gestor de contraseñas. La base de datos nunca recibe la clave maestra ni la clave de datos.

- **Bóveda (`bovedas`, una fila por usuario):** guarda la sal, las iteraciones de PBKDF2-SHA-256 (600 000), la clave de datos AES-GCM-256 envuelta con la clave derivada de la clave maestra y una `generacion` UUID que cambia al crear una bóveda nueva. Cambiar la clave maestra solo vuelve a envolver la clave de datos; la generación se mantiene.
- **Sobres:** `v1.<iv>.<datos>` en base64url, AES-GCM con IV aleatorio de 12 bytes y datos adicionales que atan cada sobre a su usuario y registro. Las notas cifran `[longitud del título][título][contenido]` en UTF-8 (máximo de sobre 1 400 000 caracteres); las credenciales, un JSON con nombre, dirección y hasta 30 campos (máximo 262 144).
- **Notas:** `notas.cifrado` y `notas.boveda_generacion` guardan el sobre; `titulo` y `contenido_md` quedan vacíos. Las notas en claro de antes de crear la bóveda se cifran desde el navegador al desbloquear. Con bóveda, `chambapp_notas` y un trigger de la tabla rechazan texto en claro (`NOTA_DEBE_CIFRARSE`) y sobres de otra generación (`BOVEDA_CAMBIADA`). El DML directo sobre `notas`, `nota_proyectos` y `nota_tareas` queda revocado: las escrituras pasan por la RPC.
- **Credenciales (`credenciales`, vista `credenciales_detalle`):** una fila por entrada con `proyecto_id`, generación y sobre. La vista oculta las de proyectos eliminados y `eliminar_proyecto` las borra mediante un trigger.
- **RPC:** `chambapp_boveda` (`crear_boveda`, `cambiar_clave` con `generacion` y `version`, `restablecer_boveda` con `confirmacion = 'BORRAR'`), `chambapp_notas` y `chambapp_credenciales` (`guardar_credencial`, `eliminar_credencial`). Son envoltorios `SECURITY INVOKER` sobre implementaciones privadas `SECURITY DEFINER` que comprueban el usuario. Todas bloquean primero la fila del perfil, igual que `chambapp_operar`, para mantener un único orden de bloqueos. Las altas son repetibles con el mismo UUID y el mismo sobre.

**Qué protege y qué no.** Supabase, sus copias de seguridad y quien tenga la clave de servicio no pueden leer títulos, contenidos ni contraseñas. Siguen siendo visibles los metadatos: fechas, versiones, número de entradas y sus proyectos, y los vínculos de las notas con proyectos y tareas. Las copias de seguridad o el WAL anteriores al cifrado pueden conservar el texto de las notas antiguas. Quien controle el frontend desplegado podría capturar la clave al escribirla. Si se olvida la clave maestra no hay recuperación: `restablecer_boveda` borra las notas cifradas y todas las credenciales del usuario.
