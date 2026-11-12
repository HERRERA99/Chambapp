# Chambapp local (Docker)

Chambapp completa en tu PC: los datos se guardan en una base de datos de Docker y no salen del equipo. No hay página de inicio, ni cuentas, ni inicio de sesión. Sigue habiendo **clave maestra** para cifrar notas y contraseñas, y **copias de seguridad** (opcionalmente cifradas con contraseña) en **Ajustes → Datos**.

- **Un solo puerto**, alto y solo en tu PC: `http://127.0.0.1:47800` (configurable). La base de datos y la API no publican ningún puerto.
- **Poca memoria**: unos 50–60 MB en reposo entre los tres contenedores (medido: base de datos 25 MB, API 15 MB, web 12 MB), con límites de 256 / 64 / 32 MB.
- **Se actualiza sola la base de datos**: al arrancar, se aplican las migraciones nuevas, una sola vez cada una.

## Requisitos

- Docker Desktop (Windows o macOS) o Docker Engine con Compose v2 (Linux).
- Si el paquete de GitHub es privado, iniciar sesión una vez en el registro con un token de GitHub de solo lectura de paquetes (`read:packages`):

```bash
docker login ghcr.io -u TU_USUARIO_DE_GITHUB
```

## Instalar y arrancar

Solo necesitas `docker-compose.yml` (y opcionalmente `.env`). Puedes descargarlo del repositorio o usar la carpeta `docker/` de un clon:

```bash
docker compose -f docker-compose.yml up -d
```

Abre `http://127.0.0.1:47800`. La primera vez aparece la configuración inicial (perfil, jornada, redondeo, zona horaria y Odoo).

### Cambiar el puerto u otros ajustes

Copia `.env.example` como `.env` junto al compose y cambia lo que necesites:

| Variable                | Por defecto           | Para qué                                                                                           |
| ----------------------- | --------------------- | -------------------------------------------------------------------------------------------------- |
| `CHAMBAPP_PORT`         | `47800`               | Puerto en `127.0.0.1` donde se abre la app                                                         |
| `CHAMBAPP_DB_PASSWORD`  | `chambapp-local`      | Contraseña interna de la base de datos (no sale de Docker). Cámbiala **antes** del primer arranque |
| `CHAMBAPP_IMAGE_PREFIX` | `ghcr.io/herrera99`   | Registro y propietario de las imágenes                                                             |
| `CHAMBAPP_TAG`          | `latest`              | Versión de las imágenes (`latest` o `sha-<commit>` para fijar una)                                 |
| `CHAMBAPP_VOLUME`       | `chambapp-local-data` | Volumen de Docker con tus datos                                                                    |

Si cambias el puerto, actualiza también la dirección en la extensión (Opciones → Conexión).

## Actualizar

`up` busca imágenes nuevas como mucho una vez al día (`CHAMBAPP_PULL_POLICY`, ver `.env.example`). Para actualizar ya:

```bash
docker compose -f docker-compose.yml pull
```

```bash
docker compose -f docker-compose.yml up -d
```

Los datos están en el volumen y no se tocan. El servicio `migrate` aplica las migraciones nuevas y termina (no consume nada después).

## Parar, arrancar y desinstalar

- Parar sin perder nada (0 recursos): `docker compose -f docker-compose.yml stop`
- Volver a arrancar: `docker compose -f docker-compose.yml start`
- Quitar los contenedores (los datos se conservan en el volumen): `docker compose -f docker-compose.yml down`
- Borrar también **todos los datos** (irreversible; haz antes una copia): `docker compose -f docker-compose.yml down -v`

Los contenedores usan `restart: unless-stopped`: arrancan con Docker salvo que los hayas parado tú.

## Copias de seguridad

**Ajustes → Datos → Descargar copia** genera un JSON con todo: perfil y ajustes, jornadas, proyectos, tareas, partes, imputaciones de Odoo, fichajes, festivos y vacaciones, notas, y contraseñas. (Las copias anteriores que incluían la antigua clave de Odoo se siguen pudiendo importar; esa parte se ignora.) Con «Cifrar con contraseña» (recomendado) el archivo se cifra con PBKDF2-SHA-256 (600 000 iteraciones) y AES-GCM; sin esa contraseña no se puede abrir. Las notas y contraseñas van además cifradas con tu clave maestra.

**Importar copia** muestra lo que contiene y **reemplaza todo** (antes descarga automáticamente una copia de lo que hay). La importación es atómica: si el archivo está dañado o es incoherente, no se cambia nada. Tras restaurar, todas las pestañas se recargan y las operaciones pendientes de antes de la restauración se descartan. Las notas y contraseñas restauradas se abren con la clave maestra que tenías al hacer la copia.

Copia de bajo nivel de la base de datos (alternativa, sin cifrar):

```bash
docker compose -f docker-compose.yml exec -T db pg_dump -U postgres -d chambapp -Fc > chambapp.dump
```

## Extensión del navegador

La misma extensión sirve para la nube y para la versión local. Descárgala desde la app (botón «Descargar extensión»): la copia que trae la imagen ya viene conectada a `http://127.0.0.1:47800`, sin configurar nada. Si usas otro puerto, cámbialo en **Opciones de la extensión → Conexión** (el navegador pedirá permiso para esa dirección). Si la app dice que la descarga «no está disponible en este entorno», tu imagen es anterior a la que incluye la extensión: actualízala (sección anterior). También está en la [release `extension-latest`](https://github.com/HERRERA99/Chambapp/releases/tag/extension-latest) del repositorio, o se compila con `npm run ext:pack:local`. En modo local no hay inicio de sesión. Al cambiar de conexión se bloquea la bóveda de la extensión y los envíos a Odoo de la otra conexión quedan apartados hasta volver a ella.

## Construir las imágenes desde el repositorio

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

La imagen incluye siempre la extensión para descargar. Sin más, es una extensión **solo local**. Si exportas antes `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` (valores públicos del proyecto en la nube), también podrá usar la nube.

Las imágenes se publican solas en GitHub Container Registry al subir a `main` (`.github/workflows/docker-local.yml`): `chambapp-local-db` y `chambapp-local-web`, con las etiquetas `latest` y `sha-<commit>`, para `linux/amd64` y `linux/arm64`. Siempre incluyen la extensión. Si defines en el repositorio las variables de Actions `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`, esa extensión también podrá usar la nube. La visibilidad del paquete (público o privado) se elige en GitHub → Packages.

## Cómo funciona

| Contenedor | Imagen                                       | Qué hace                                                               |
| ---------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| `db`       | `chambapp-local-db` (PostgreSQL 17 alpine)   | Los datos, en el volumen                                               |
| `migrate`  | la misma                                     | Aplica las migraciones pendientes y termina                            |
| `api`      | `postgrest/postgrest:v13.0.7`                | API REST sobre la base de datos (la misma que usa la nube)             |
| `web`      | `chambapp-local-web` (nginx sin privilegios) | La app compilada con `VITE_EDITION=local` y el proxy `/rest/v1/` → API |

- **Mismas reglas que la nube**: se aplican las mismas migraciones de `supabase/migrations`. Un pequeño shim (`db/shim`) crea lo que esas migraciones esperan de Supabase: un único usuario fijo, `auth.uid()` que siempre lo devuelve y los roles. `db/local` añade la identidad de la instalación, la generación de datos y las copias.
- **Migraciones atómicas**: `db/migrate.sh` ejecuta cada migración y su registro en `chambapp_local.migraciones` en una sola transacción, con un bloqueo consultivo. Si una falla, no queda nada a medias. Una migración ya aplicada nunca se modifica: si su contenido cambia, el arranque se detiene con un mensaje claro.
- **Sin cuentas, pero protegido frente a webs**: nginx solo acepta `Host` `127.0.0.1:<puerto>` o `localhost:<puerto>` (frente al DNS rebinding). En `/rest/` solo acepta peticiones sin `Origin`, de la propia app o de la extensión de Chambapp (en Chrome/Edge solo su id fijo; en Firefox, que da un id aleatorio a cada instalación, cualquier extensión) (frente al CSRF). Cualquier otra web recibe 403. Los programas de tu propio PC sí pueden acceder (es un equipo de un solo usuario); las notas y contraseñas siguen cifradas con la clave maestra.
- **Generación de datos**: cada restauración cambia `generacion_datos`. Toda escritura lleva la cabecera `X-Chambapp-Generacion`, y PostgREST (`chambapp_local.antes_peticion`, en la misma transacción) rechaza con 409 `GENERACION_CAMBIADA` las de una generación anterior. Así una petición retrasada o una operación pendiente de antes de restaurar nunca modifica los datos restaurados. La restauración toma un bloqueo exclusivo y espera a las escrituras en curso.

### Clasificación de triggers (importar copias)

La importación inserta las filas con los triggers desactivados (`session_replication_role = replica`) para conservar versiones y fechas tal como se exportaron. Antes de confirmar, comprueba todas las claves foráneas y las reglas de los triggers de validación sobre el estado guardado. Si algo no cuadra, se rechaza todo.

| Trigger                                                                                                                                     | Tablas                                                | Clase               | En la importación                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `validar_fila`                                                                                                                              | perfiles, proyectos, tareas, jornadas, partes_horas   | estado guardado     | Zonas horarias válidas; tareas y partes vivos con padres vivos; partes no futuros                                   |
| `validar_arbol`                                                                                                                             | proyectos, tareas, partes_horas                       | estado guardado     | Ningún hijo vivo de un padre borrado; ningún cronómetro abierto en tarea o proyecto archivado                       |
| `validar_configuracion`                                                                                                                     | configuraciones_semanales, dias_configuracion_semanal | estado guardado     | El reparto diario suma el total semanal                                                                             |
| `validar_fichaje`                                                                                                                           | fichajes                                              | estado guardado     | Fichajes vivos no futuros                                                                                           |
| `notas_cifrado_obligatorio`                                                                                                                 | notas                                                 | estado guardado     | Notas cifradas con la generación actual de la bóveda (puede haber notas antiguas sin cifrar)                        |
| `enlace_propio`                                                                                                                             | nota_proyectos, nota_tareas, credenciales             | estado guardado     | Ningún enlace a registros de otra cuenta (los enlaces a registros borrados son válidos)                             |
| `configuracion_inmutable`, `validar_dia_nuevo`                                                                                              | configuraciones semanales                             | solo edición        | No aplica (restringen cambios posteriores)                                                                          |
| versiones (`*_version`), `sincronizar_imputacion_odoo`, `limpiar_imputacion_odoo`, `proyectos_borrar_credenciales`, `chambapp_crear_perfil` | varias                                                | historial / efectos | Se omiten (los datos ya llevan su resultado; la coherencia de imputaciones la garantiza su clave foránea compuesta) |

Las restricciones CHECK, UNIQUE y EXCLUDE (por ejemplo, partes que se solapan) siguen activas durante la importación. `tools/db-tests/local-edition.mjs` falla si aparece un trigger sin clasificar o una tabla de usuario que no se copie ni se vacíe.

## Pruebas

```bash
npm run db:test
```

```bash
node tools/docker-smoke/smoke.mjs --build
```

El primero prueba la base de datos de la versión local en un PostgreSQL embebido. El segundo levanta una instalación de prueba aparte (proyecto `chambapp-smoke`, puerto 47899, volumen propio) y comprueba la API real, las protecciones HTTP, las copias, el reinicio, una migración que falla a mitad, el puerto publicado y la memoria. Con `--keep` la deja en marcha, por ejemplo para `node tools/ext-smoke/run-local.mjs` (la extensión en modo local en Edge).
