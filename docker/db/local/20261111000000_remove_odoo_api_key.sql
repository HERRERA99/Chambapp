begin;

-- The Odoo API key table is gone (supabase/migrations/20261111000000_remove_odoo_api_key.sql):
-- backups no longer include it. Copies made before still carry the key
-- "chambapp_private.odoo_credenciales"; the client drops it before importing.
create or replace function chambapp_local.tablas_copia() returns text[]
language sql immutable set search_path = '' as $$
  select array[
    'public.perfiles', 'public.configuraciones_semanales', 'public.dias_configuracion_semanal',
    'public.jornadas', 'public.proyectos', 'public.tareas', 'public.imputaciones_odoo',
    'public.partes_horas', 'public.fichajes', 'public.ausencias', 'public.bovedas',
    'public.notas', 'public.nota_proyectos', 'public.nota_tareas', 'public.credenciales'
  ]
$$;
revoke all on function chambapp_local.tablas_copia() from public, anon, authenticated;

commit;
