-- Read-only verification after applying all migrations, as an administrator.
do $$
declare n integer;
begin
  select count(*) into n from pg_catalog.pg_class c join pg_catalog.pg_namespace s on s.oid = c.relnamespace
    where c.relkind = 'r' and c.relrowsecurity and
      ((s.nspname = 'public' and c.relname in ('perfiles','proyectos','tareas','configuraciones_semanales',
        'dias_configuracion_semanal','jornadas','partes_horas','fichajes')) or
       (s.nspname = 'chambapp_private' and c.relname in ('operaciones_cronometro','operaciones_fichajes','odoo_credenciales')));
  if n <> 11 then raise exception 'Faltan tablas o RLS: % de 11', n; end if;
  if not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname = 'chambapp_operar' and not p.prosecdef) then
    raise exception 'Falta la RPC SECURITY INVOKER'; end if;
  if pg_catalog.has_table_privilege('authenticated','public.partes_horas','INSERT') or
     pg_catalog.has_table_privilege('authenticated','public.partes_horas','UPDATE') or
     pg_catalog.has_table_privilege('anon','public.perfiles','SELECT') or
     pg_catalog.has_table_privilege('authenticated','chambapp_private.operaciones_cronometro','SELECT') or
     pg_catalog.has_table_privilege('authenticated','chambapp_private.operaciones_fichajes','SELECT') or
     pg_catalog.has_table_privilege('authenticated','public.fichajes','INSERT') or
     pg_catalog.has_table_privilege('authenticated','public.fichajes','UPDATE') or
     pg_catalog.has_table_privilege('authenticated','public.fichajes','DELETE') or
     pg_catalog.has_table_privilege('anon','public.fichajes','SELECT') or
     pg_catalog.has_table_privilege('authenticated','chambapp_private.odoo_credenciales','SELECT') or
     pg_catalog.has_table_privilege('authenticated','chambapp_private.odoo_credenciales','INSERT') or
     pg_catalog.has_table_privilege('authenticated','chambapp_private.odoo_credenciales','UPDATE') or
     pg_catalog.has_table_privilege('authenticated','chambapp_private.odoo_credenciales','DELETE') then
    raise exception 'Hay permisos directos inesperados'; end if;
  if not pg_catalog.has_function_privilege('authenticated','public.chambapp_operar(text,jsonb)','EXECUTE') or
     pg_catalog.has_function_privilege('anon','public.chambapp_operar(text,jsonb)','EXECUTE') then
    raise exception 'Permisos de RPC incorrectos'; end if;
  if not pg_catalog.has_function_privilege('authenticated','public.chambapp_configurar_odoo(text,boolean)','EXECUTE') or
     pg_catalog.has_function_privilege('anon','public.chambapp_configurar_odoo(text,boolean)','EXECUTE') or
     not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace
       where s.nspname='public' and p.proname='chambapp_configurar_odoo' and not p.prosecdef) then
    raise exception 'Permisos de configuración Odoo incorrectos'; end if;
  if not exists(select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'auth.users'::regclass and t.tgname = 'chambapp_crear_perfil' and not t.tgisinternal) then
    raise exception 'Falta el trigger de alta'; end if;
  if pg_catalog.has_function_privilege('authenticated','chambapp_private.operar_legacy(text,jsonb)','EXECUTE') or
     pg_catalog.has_function_privilege('anon','chambapp_private.operar(text,jsonb)','EXECUTE') then
    raise exception 'Permisos privados incorrectos'; end if;
  if not exists(select 1 from pg_catalog.pg_class c where c.oid = 'public.fichajes_detalle'::regclass
    and 'security_invoker=true' = any(c.reloptions)) then
    raise exception 'La vista de fichajes no respeta RLS'; end if;
  if not exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='tareas' and column_name='odoo_id') or
     not exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='tareas' and column_name='odoo_url') then
    raise exception 'Faltan referencias de Odoo'; end if;
  if not exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='partes_horas' and column_name='imputado_en_odoo'
    and data_type='boolean' and is_nullable='NO' and column_default='false') or
    not exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='partes_detalle' and column_name='imputado_en_odoo' and data_type='boolean') then
    raise exception 'Falta la marca manual de imputación de Odoo'; end if;
end $$;

select s.nspname as esquema, c.relname as tabla, c.relrowsecurity as rls
from pg_catalog.pg_class c join pg_catalog.pg_namespace s on s.oid = c.relnamespace
where c.relkind = 'r' and s.nspname in ('public','chambapp_private')
order by s.nspname,c.relname;

select 'verificacion_correcta' as resultado;
