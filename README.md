# Chambapp

Aplicación personal de proyectos, tareas y control horario basada en el [modelo de datos](docs/modelo-datos.md). Incluye inicio de sesión, cronómetros persistentes, partes históricos, calendario, revisión diaria, informes y calculadora de tiempo. Los enlaces de Odoo se guardan manualmente; la sincronización automática queda para una fase posterior.

## Puesta en marcha

En este equipo, `.env.local` ya apunta al proyecto Supabase **Chambapp**, las migraciones están aplicadas y las dependencias están instaladas. Para probar la app, ejecuta `npm run dev` desde este directorio y abre [http://localhost:3000](http://localhost:3000). Registra una cuenta y confirma el correo recibido antes de iniciar sesión; la confirmación por correo está activada en este proyecto.

Cuando accedas al panel de Supabase, verifica en **Authentication → URL Configuration** que la Site URL sea `http://localhost:3000` y que esa dirección esté admitida como URL de redirección. Este ajuste del panel aún no se ha comprobado porque requiere iniciar sesión allí.

1. Crea un proyecto en Supabase y aplica, en orden, [las migraciones](supabase/migrations) desde el editor SQL o con Supabase CLI. Crean las tablas, restricciones, políticas RLS y funciones transaccionales.
2. Copia `.env.example` a `.env.local` y completa `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` con la URL y la clave pública del proyecto. No uses una clave secreta o `service_role` en el navegador.
3. En Supabase, configura **Authentication → URL Configuration** con `http://localhost:3000` como Site URL y URL de redirección para las confirmaciones de correo y recuperación de contraseña.
4. Ejecuta `npm ci` y `npm run dev`. Abre [http://localhost:3000](http://localhost:3000).
5. Crea una cuenta. Si está activada la confirmación de correo en Supabase Auth, confirma el enlace recibido antes de iniciar sesión.

Para desplegar en Vercel, configura las mismas dos variables de entorno y usa `npm run build` como comando de compilación y `dist` como directorio de salida.

## Funciones

- Proyectos y tareas con código `T1`, `T2`…, estados, prioridades, estimaciones, notas y enlaces.
- Jornadas con tramos de presencia; cronómetros de tareas, descansos, comidas y actividades personalizadas.
- Partes manuales históricos, redondeo configurable al cerrar una tarea y registro de correcciones.
- Horarios semanales versionados, festivos, eventos, calendario y cierre diario.
- Resumen, informes diarios/semanales/mensuales y calculadora sin persistencia.

Los datos pertenecen al usuario autenticado. La base comprueba relaciones de propiedad y solapamientos, y las tablas expuestas tienen RLS. Las fechas se guardan como instantes UTC y se muestran según la zona horaria del perfil.

## Comprobación

`npm run build` verifica tipos y genera la versión de producción. Para comprobar la migración contra PostgreSQL/Supabase local se necesita Docker con el motor en marcha; después se puede ejecutar `npx supabase start` desde este directorio.
