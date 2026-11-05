# Chambapp

Aplicación de control de tiempo con React, TypeScript, Vite y Supabase. Incluye autenticación, configuración inicial, proyectos, tareas con referencias opcionales a Odoo, notas Markdown, cronómetro, partes de horas, fichajes de entrada y salida, calendario semanal y ajustes. La página pública utiliza ejemplos visuales; las pantallas de la cuenta leen y guardan datos reales.

## Arrancar en local

Usa Node.js 24 y npm. Desde la raíz del repositorio:

```powershell
npm ci
```

Si no tienes `.env.local`, copia `.env.example` y completa la URL y la clave publicable del proyecto:

```powershell
Copy-Item .env.example .env.local
```

```dotenv
VITE_SUPABASE_URL=https://<referencia>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<clave-publicable>
SUPABASE_PROJECT_REF=<referencia>
```

El frontend utiliza una clave publicable. Las claves administrativas y el token de CLI quedan fuera de las variables `VITE_` y del repositorio; `.env.local` está ignorado por Git. `SUPABASE_PROJECT_REF` identifica el destino de las migraciones y también puede definirse en `supabase/project.json`.

```powershell
npm run dev
```

Abre [http://127.0.0.1:5173](http://127.0.0.1:5173). Reinicia Vite si cambias las variables de entorno. Para probar la compilación de producción, ejecuta `npm run build` y después `npm run preview`.

## Configurar Supabase Auth

En **Authentication → URL Configuration**, registra `http://127.0.0.1:5173/**` como Redirect URL de desarrollo. En producción establece **Site URL** en el dominio definitivo y permite las rutas que usa la aplicación: `/login` con su parámetro `returnTo` y `/recuperar-contrasena`. Por ejemplo, `https://tu-dominio/login**` y `https://tu-dominio/recuperar-contrasena`; limita los patrones al dominio y las rutas correspondientes. [Documentación de redirecciones](https://supabase.com/docs/guides/auth/redirect-urls).

El registro con correo y contraseña respeta la configuración **Confirm email** del proyecto. Si está activada, abre el enlace recibido para confirmar la cuenta antes de acceder. La recuperación de contraseña utiliza un enlace enviado por correo y la pantalla `/recuperar-contrasena`.

El login y el registro admiten los proveedores sociales de Supabase, incluidos Google, Apple, Microsoft, GitHub, Facebook, Discord, X y LinkedIn. La interfaz consulta la configuración pública de Auth y solo muestra los proveedores habilitados. Actualmente el proyecto Chambapp tiene desactivados todos los proveedores sociales: necesitan una aplicación OAuth y sus credenciales en el panel de Supabase. El código no contiene esas credenciales. [Configuración de proveedores y redirecciones](docs/oauth.md).

El entorno Supabase local configura las redirecciones del puerto 5173 en `supabase/config.toml`. En producción, el alojamiento debe servir `index.html` al abrir directamente una ruta de la SPA.

## Estructura

| Ruta                  | Responsabilidad                                                                |
| --------------------- | ------------------------------------------------------------------------------ |
| `src/app`             | Rutas, carga de pantallas, protección de sesión y layout.                      |
| `src/features`        | Funcionalidades independientes con páginas, componentes, hooks y selectores.   |
| `src/domain`          | Tipos de negocio y utilidades de tiempo, duración y zona horaria.              |
| `src/lib/supabase`    | Cliente tipado, repositorio de lectura, RPC, validación y errores.             |
| `src/shared/ui`       | Controles accesibles reutilizables: botones, formularios, tablas y diálogos.   |
| `src/styles`          | Tokens de diseño y estilos compartidos; cada funcionalidad puede tener su CSS. |
| `supabase/migrations` | Esquema y cambios versionados.                                                 |
| `tests`, `tools`      | Pruebas de dominio, cronómetro, seguridad de datos y PostgreSQL.               |

Los providers de Auth, Workspace y Tracker coordinan la sesión, la caché de consultas y el cronómetro. Los componentes presentan datos y envían comandos a través de esa capa; los cálculos se mantienen en utilidades y selectores verificables.

Dentro del espacio de trabajo, el logo de Chambapp abre **Resumen** y mantiene al usuario en la aplicación.

## Notas Markdown

En **Notas** (`/notas`) puedes crear y editar notas, importar archivos `.md` UTF-8 y descargar el contenido como Markdown. El editor ofrece vista de edición, vista previa y vista dividida, con tablas, listas de tareas y bloques de código. Usa **Guardar nota** o `Ctrl/Cmd + S` para guardar. Se admiten títulos de hasta 200 caracteres y contenido de hasta 1 MB.

Cada nota puede asociarse con varios proyectos y tareas existentes, o guardarse sin asociaciones. La biblioteca permite buscar por título o contenido y filtrar por proyecto, incluidas sus tareas asociadas. Las notas son privadas de cada usuario y se guardan como texto Markdown en Supabase; la descarga contiene el texto, mientras que las asociaciones permanecen en la aplicación.

El navegador conserva el borrador durante la sesión y avisa antes de cambiar de nota o salir desde la navegación. Si otra pestaña cambia la nota, el editor conserva tus cambios y permite descargar el borrador antes de cargar la versión guardada. Las migraciones de notas y sus permisos deben estar aplicadas antes de ejecutar esta versión del frontend.

## Odoo y fichajes

Cada tarea admite un **ID de Odoo** opcional (`T` seguida de números, por ejemplo `T443212`) y un enlace HTTP(S) opcional. Se pueden guardar y borrar por separado. El formulario normaliza el ID a mayúsculas y el enlace a una URL válida. Los enlaces aparecen en tareas, partes y calendario; las búsquedas admiten el ID y los CSV incluyen ambos campos. Estos datos permiten navegar a Odoo; la sincronización con su API queda para una integración posterior.

Cada parte de horas tiene una marca **Imputado en Odoo**, editable en su formulario y desde la lista. Permite filtrar los partes pendientes o imputados y se incluye en el CSV. La marca registra una confirmación manual del usuario; no envía horas a Odoo. Los partes existentes empiezan como pendientes.

En **Fichajes** (`/fichajes`) puedes registrar entrada y salida con la hora del servidor, introducirlas manualmente o corregir un registro. Se admiten varias sesiones al día, una entrada abierta por usuario y tramos que cruzan medianoche. Los fichajes no se redondean y sus solapamientos se rechazan; los partes de tareas siguen siendo independientes. El tiempo de descanso se excluye cerrando un fichaje y abriendo otro al volver.

**Entrada manual** abre directamente un formulario de fecha y hora y guarda el fichaje con salida pendiente. Puedes salir de la página y volver más tarde: **Salida manual** cierra esa misma entrada con la hora que introduzcas. **Registrar tramo completo** permite añadir una sesión pasada con ambas horas. El balance y el historial muestran la duración de los fichajes con segundos, sin aplicar el redondeo de los partes.

El resumen, la semana y Fichajes comparan horas fichadas e imputadas. El porcentaje es `horas imputadas de partes finalizados / horas fichadas × 100`; sin horas fichadas aparece **Sin fichajes** y el redondeo puede producir valores superiores al 100 %. Las entradas abiertas aportan tiempo provisional claramente indicado. La comparativa reparte los tramos entre días según la zona horaria del perfil, respetando los cambios de horario; distribuye el tiempo imputado proporcionalmente a la duración real de cada parte. Los informes originales de partes mantienen su atribución a la jornada de inicio.

El provider de fichajes conserva las operaciones pendientes por usuario en el navegador y coordina pestañas con Web Locks. **Reintentar fichaje** reutiliza los parámetros originales; el servidor devuelve el mismo resultado para evitar duplicados, también después de una edición o eliminación. El usuario de la RPC queda fijado a la sesión que inició la operación.

Las lecturas se paginan en bloques de 500 para recuperar todos los registros sin truncarlos con el límite de respuesta de Supabase. La caché se actualiza después de escribir, al recuperar el foco y periódicamente. Si crece el volumen de datos, la siguiente optimización consiste en consultas filtradas y agregaciones en el servidor por pantalla y periodo.

## Extensión de navegador

La carpeta `extension/` contiene la extensión de Chrome, Edge y Firefox: importa tareas de Odoo, envía los partes de Parte semanal a Odoo sin usar su API y rellena contraseñas de la bóveda. Se compila con `npm run ext:build` (`extension/dist` y `extension/dist-firefox`), se empaqueta para la web con `npm run ext:pack` y la versión de Firefox se firma con `npm run ext:sign:firefox`. Instalación, configuración y pruebas en [docs/extension.md](docs/extension.md).

## Reglas de tiempo y persistencia

El inicio y fin se conservan exactos, incluidos segundos y fracciones. El redondeo superior se aplica a la duración total de cada parte: **4 h 8 min** imputa **4 h 15 min**, **4 h 30 min** o **5 h** según el intervalo. Se admiten 0, 5, 10, 15, 30 y 60 minutos; 0 conserva la duración exacta. Las horas de inicio y fin visibles no se ajustan.

Cada parte guarda el intervalo vigente al crearlo. Cambiar ajustes afecta a partes futuros; editar un parte conserva su intervalo histórico. Las jornadas conservan su zona horaria y objetivo. Cambiar el reparto semanal crea una nueva configuración; generar una semana es repetible y mantiene los objetivos diarios ya guardados. Los informes suman partes finalizados y presentan el cronómetro activo como tiempo provisional separado.

El cronómetro guarda la intención de iniciar/detener antes de enviarla. Si falla la red, conserva la operación pendiente y **Reintentar** reutiliza el mismo UUID y los mismos parámetros. El servidor evita duplicar efectos. Una parada que nunca llegó al servidor registra la hora del reintento; después puede corregirse su fin exacto en el parte.

Web Locks coordina las operaciones entre pestañas del mismo origen y `storage` sincroniza su estado. El navegador necesita Web Locks y almacenamiento local para usar el cronómetro. El servidor serializa las escrituras por usuario, permite un único cronómetro activo y rechaza solapamientos reales. Una operación pendiente debe confirmarse antes de iniciar otra.

## Base de datos y migraciones

Las tablas tienen RLS y cada cuenta lee únicamente sus registros. Las escrituras pasan por `chambapp_operar`, con propietario derivado de la sesión, validación de relaciones y versiones para detectar cambios concurrentes. Las vistas utilizan `security_invoker`; el cliente no tiene permisos directos de escritura. [Modelo y payloads RPC](docs/base-de-datos.md).

El proyecto alojado [Chambapp](https://supabase.com/dashboard/project/azylnnujzpqwpzedkoxv) tiene aplicadas las migraciones `20261001181821`, `20261001213125`, `20261002190139`, `20261002201755` y `20261005185736`. La CLI y el plugin MCP tienen autenticaciones independientes: para futuras migraciones con CLI necesitas iniciar sesión.

La migración [Odoo y fichajes](supabase/migrations/20261002190139_odoo_and_attendance.sql) está aplicada al proyecto alojado y verificada tanto en PostgreSQL aislado como con los controles remotos de catálogo y permisos. Añade los campos Odoo, las tablas y vistas de fichajes y amplía la RPC existente. Los tipos TypeScript se han generado desde la base actualizada; la versión del archivo coincide con el historial remoto.

La migración [Marca manual de imputación en Odoo](supabase/migrations/20261002201755_manual_odoo_time_entry_status.sql) añade `imputado_en_odoo` a los partes y su vista, con valor inicial `false`, y amplía la creación y edición por RPC. Está aplicada, con tipos regenerados y la verificación remota de catálogo y permisos correcta.

```powershell
npm run db:login
npm run db:link
npm run db:status
npm run db:plan
npm run db:migrate
```

`db:plan` muestra las migraciones pendientes y `db:migrate` las aplica. Para desarrollo con Supabase local y Docker en ejecución: `npm run db:start`; para detenerlo: `npm run db:stop`. [Guía de migraciones](docs/ejecutar-migraciones.md).

## Verificación

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run format:check
```

`npm test` usa el runner de Node para comprobar redondeo, zonas horarias, configuración, validaciones, rutas de retorno, operaciones pendientes y coordinación del cronómetro; también verifica la selección y los agregados del calendario semanal. `npm run format` aplica el formato acordado.

Pruebas de base de datos sin Docker:

```powershell
npm run db:test:install
npm run db:test
```

La suite levanta PostgreSQL 17 aislado con datos sintéticos, aplica todas las migraciones y verifica RLS, propiedad, versiones, redondeo, DST, cronómetro, referencias Odoo, fichajes, reintentos y concurrencia. No modifica la base alojada. `supabase/verify.sql` comprueba catálogo y permisos después de aplicar una migración; las pruebas de SQL no sustituyen la verificación de registro, confirmación por correo y login en el navegador.

La migración [Inicio retroactivo y credenciales de Odoo](supabase/migrations/20261005185736_selected_timer_start_and_odoo_credentials.sql) está aplicada al proyecto alojado y verificada con PostgreSQL aislado y con el script remoto de catálogo y permisos. Es necesaria para activar «Iniciar a otra hora» y el guardado de la API key en el tutorial y en Ajustes. Las tareas se paginan de seis en seis y todas las vistas de partes muestran su estado de imputación en Odoo.
