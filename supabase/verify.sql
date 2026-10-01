-- Read-only verification after applying the initial migration, as an administrator.
do $$
declare n integer;
begin
  select count(*) into n from pg_catalog.pg_class c join pg_catalog.pg_namespace s on s.oid = c.relnamespace
    where c.relkind = 'r' and c.relrowsecurity and
      ((s.nspname = 'public' and c.relname in ('perfiles','proyectos','tareas','configuraciones_semanales',
        'dias_configuracion_semanal','jornadas','partes_horas')) or
       (s.nspname = 'chambapp_private' and c.relname = 'operaciones_cronometro'));
  if n <> 8 then raise exception 'Faltan tablas o RLS: % de 8', n; end if;
  if not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname = 'chambapp_operar' and not p.prosecdef) then
    raise exception 'Falta la RPC SECURITY INVOKER'; end if;
  if pg_catalog.has_table_privilege('authenticated','public.partes_horas','INSERT') or
     pg_catalog.has_table_privilege('authenticated','public.partes_horas','UPDATE') or
     pg_catalog.has_table_privilege('anon','public.perfiles','SELECT') or
     pg_catalog.has_table_privilege('authenticated','chambapp_private.operaciones_cronometro','SELECT') then
    raise exception 'Hay permisos directos inesperados'; end if;
  if not pg_catalog.has_function_privilege('authenticated','public.chambapp_operar(text,jsonb)','EXECUTE') or
     pg_catalog.has_function_privilege('anon','public.chambapp_operar(text,jsonb)','EXECUTE') then
    raise exception 'Permisos de RPC incorrectos'; end if;
  if not exists(select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = 'auth.users'::regclass and t.tgname = 'chambapp_crear_perfil' and not t.tgisinternal) then
    raise exception 'Falta el trigger de alta'; end if;
end $$;

select s.nspname as esquema, c.relname as tabla, c.relrowsecurity as rls
from pg_catalog.pg_class c join pg_catalog.pg_namespace s on s.oid = c.relnamespace
where c.relkind = 'r' and s.nspname in ('public','chambapp_private')
order by s.nspname,c.relname;

select 'verificacion_correcta' as resultado;
