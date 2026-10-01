# Ejecutar las migraciones de Chambapp

El proyecto incluye Supabase CLI 2.119.0 como dependencia fijada, configuración local, migraciones SQL y pruebas de base de datos. No requiere instalar la CLI globalmente.

## Instalar

En una terminal PowerShell, desde `C:\dev\Chambapp`, con Node.js 22 o posterior:

```powershell
npm ci
npm run db:test:install
npm run db:test
```

El último comando aplica la migración a PostgreSQL 17 aislado y verifica sus reglas. No necesita Docker ni modifica la base alojada.

## Preparar el destino alojado

`supabase/project.json` ya guarda la referencia pública `azylnnujzpqwpzedkoxv` del proyecto [Chambapp](https://supabase.com/dashboard/project/azylnnujzpqwpzedkoxv), creado en la organización Aitor, región París. La migración inicial ya está aplicada mediante el plugin y su versión local coincide con el historial remoto: `20261001181821`. `db:migrate` se reserva para futuras migraciones pendientes.

Como alternativa, establece `SUPABASE_PROJECT_REF` en el entorno o en `.env.local`. No es una contraseña. Para cambiar de destino en una ejecución, usa `--project-ref <ref>`.

El plugin de Supabase y la CLI tienen autenticaciones independientes. Para ejecutar tú los comandos remotos, inicia sesión con la CLI:

```powershell
npm run db:login
npm run db:link
```

La CLI puede solicitar la contraseña de la base de datos. Introduce las credenciales en su flujo de autenticación; no las copies en los archivos públicos del repositorio.

## Revisar y aplicar

```powershell
npm run db:status
npm run db:plan
npm run db:migrate
npm run db:status
```

`db:plan` realiza una simulación y muestra lo pendiente. `db:migrate` aplica las migraciones pendientes y registra su versión en Supabase; no utiliza un reset. Si la migración ya está aplicada y el historial coincide, no vuelve a crear las tablas.

Después de aplicar, se puede ejecutar `supabase/verify.sql` en el SQL Editor para comprobar las ocho tablas, RLS, permisos de RPC y trigger de alta. Solo consulta el catálogo; no modifica datos. También deben revisarse los advisors de seguridad y rendimiento del proyecto.

La migración inicial debe aplicarse a un esquema nuevo. Si ya ejecutaste su SQL manualmente desde SQL Editor, hay que comprobar el esquema y sincronizar el historial antes de ejecutar `db:migrate`. No se debe registrar una versión como aplicada sin comprobar que sus objetos coinciden.

Si se aplica mediante el plugin, se sincronizará el nombre local con la versión que Supabase registre, para que CLI y plugin compartan el mismo historial.

## Conexión del futuro frontend

La URL del proyecto, su clave publicable y la referencia de destino ya están guardadas en `.env.local`, que Git ignora. Para otra instalación, el formato es:

```dotenv
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<clave-publicable>
SUPABASE_PROJECT_REF=<ref>
```

Estas variables preparan la conexión; la interfaz de la aplicación todavía no se ha implementado. Las claves administrativas no se incluyen en variables `VITE_`.

## Supabase local

Con Docker iniciado:

```powershell
npm run db:start
```

El arranque crea el entorno local y aplica las migraciones. Para ver su historial:

```powershell
npm run db:cli -- migration list --local
```

Para detenerlo conservando los datos:

```powershell
npm run db:stop
```

Más detalles sobre las tablas, las operaciones RPC y las pruebas en [base-de-datos.md](base-de-datos.md). Referencia oficial: [migraciones de Supabase](https://supabase.com/docs/guides/deployment/database-migrations).
