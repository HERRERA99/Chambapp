# Chambapp

Aplicación de control de tiempo con React, TypeScript, Vite y Supabase. Incluye autenticación, configuración inicial, proyectos, tareas, cronómetro, partes de horas, calendario semanal y ajustes. La página pública utiliza ejemplos visuales; las pantallas de la cuenta leen y guardan datos reales.

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

Google y GitHub están deshabilitados actualmente en el proyecto Chambapp. La interfaz consulta la configuración pública de Auth y solo muestra proveedores habilitados. Para activarlos necesitas configurar sus credenciales OAuth en Supabase y el callback que indique cada proveedor. El código no contiene esas credenciales.

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

Las lecturas se paginan en bloques de 500 para recuperar todos los registros sin truncarlos con el límite de respuesta de Supabase. La caché se actualiza después de escribir, al recuperar el foco y periódicamente. Si crece el volumen de datos, la siguiente optimización consiste en consultas filtradas y agregaciones en el servidor por pantalla y periodo.

## Reglas de tiempo y persistencia

El inicio y fin se conservan exactos, incluidos segundos y fracciones. El redondeo superior se aplica a la duración total de cada parte: **4 h 8 min** imputa **4 h 15 min**, **4 h 30 min** o **5 h** según el intervalo. Se admiten 0, 5, 10, 15, 30 y 60 minutos; 0 conserva la duración exacta. Las horas de inicio y fin visibles no se ajustan.

Cada parte guarda el intervalo vigente al crearlo. Cambiar ajustes afecta a partes futuros; editar un parte conserva su intervalo histórico. Las jornadas conservan su zona horaria y objetivo. Cambiar el reparto semanal crea una nueva configuración; generar una semana es repetible y mantiene los objetivos diarios ya guardados. Los informes suman partes finalizados y presentan el cronómetro activo como tiempo provisional separado.

El cronómetro guarda la intención de iniciar/detener antes de enviarla. Si falla la red, conserva la operación pendiente y **Reintentar** reutiliza el mismo UUID y los mismos parámetros. El servidor evita duplicar efectos. Una parada que nunca llegó al servidor registra la hora del reintento; después puede corregirse su fin exacto en el parte.

Web Locks coordina las operaciones entre pestañas del mismo origen y `storage` sincroniza su estado. El navegador necesita Web Locks y almacenamiento local para usar el cronómetro. El servidor serializa las escrituras por usuario, permite un único cronómetro activo y rechaza solapamientos reales. Una operación pendiente debe confirmarse antes de iniciar otra.

## Base de datos y migraciones

Las tablas tienen RLS y cada cuenta lee únicamente sus registros. Las escrituras pasan por `chambapp_operar`, con propietario derivado de la sesión, validación de relaciones y versiones para detectar cambios concurrentes. Las vistas utilizan `security_invoker`; el cliente no tiene permisos directos de escritura. [Modelo y payloads RPC](docs/base-de-datos.md).

El proyecto alojado [Chambapp](https://supabase.com/dashboard/project/azylnnujzpqwpzedkoxv) tiene aplicadas las migraciones `20261001181821` y `20261001213125`. La CLI y el plugin MCP tienen autenticaciones independientes: para futuras migraciones con CLI necesitas iniciar sesión.

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

La suite levanta PostgreSQL 17 aislado con datos sintéticos, aplica ambas migraciones y verifica RLS, propiedad, versiones, redondeo, DST, cronómetro, reintentos y concurrencia. No modifica la base alojada. `supabase/verify.sql` comprueba catálogo y permisos después de aplicar una migración; las pruebas de SQL no sustituyen la verificación de registro, confirmación por correo y login en el navegador.
