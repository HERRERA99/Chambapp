-- Chambapp local edition (Plan 12): installation identity, data generation,
-- the PostgREST pre-request guard and full backups (export / replace-all import).
-- Applied after every cloud migration; never part of the Supabase project.
begin;

create schema if not exists chambapp_local;
revoke all on schema chambapp_local from public, anon, authenticated;
grant usage on schema chambapp_local to authenticated;

-- One row. generacion_datos changes on every restore: requests and browser state
-- captured before a restore carry the old value and are rejected.
create table chambapp_local.instalacion (
  unica boolean primary key default true check (unica),
  id uuid not null default gen_random_uuid(),
  generacion_datos uuid not null default gen_random_uuid(),
  creado_en timestamptz not null default clock_timestamp()
);
insert into chambapp_local.instalacion default values;
revoke all on chambapp_local.instalacion from public, anon, authenticated;

-- Advisory lock shared by every write (pre-request) and taken exclusively by a restore.
create function chambapp_local.clave_restauracion() returns bigint
language sql immutable set search_path = '' as $$ select 7203120901::bigint $$;
revoke all on function chambapp_local.clave_restauracion() from public, anon, authenticated;
grant execute on function chambapp_local.clave_restauracion() to authenticated;

-- PostgREST pre-request hook (PGRST_DB_PRE_REQUEST). Runs inside the request's own
-- transaction, before the request itself. PostgREST does not pass the RPC arguments
-- here, only request.method, request.path and request.headers.
create function chambapp_local.antes_peticion() returns void
language plpgsql security definer set search_path = '' as $$
declare
  metodo text := upper(coalesce(current_setting('request.method', true), ''));
  ruta text := coalesce(current_setting('request.path', true), '');
  cabeceras text := nullif(current_setting('request.headers', true), '');
  enviada text;
  vigente uuid;
begin
  if metodo in ('', 'GET', 'HEAD', 'OPTIONS') then return; end if;
  -- Backup RPCs: estado/exportar only read; importar takes the exclusive lock itself
  -- (taking the shared one here first would deadlock two concurrent imports).
  if ruta in ('/rpc/chambapp_copia_estado', '/rpc/chambapp_copia_exportar',
              '/rpc/chambapp_copia_importar') then
    return;
  end if;
  perform pg_advisory_xact_lock_shared(chambapp_local.clave_restauracion());
  if cabeceras is not null then
    enviada := cabeceras::json ->> 'x-chambapp-generacion';
  end if;
  select generacion_datos into vigente from chambapp_local.instalacion;
  if enviada is null or enviada is distinct from vigente::text then
    raise sqlstate 'PT409' using message = 'GENERACION_CAMBIADA';
  end if;
end $$;
revoke all on function chambapp_local.antes_peticion() from public, anon, authenticated;
grant execute on function chambapp_local.antes_peticion() to authenticated;

-- Backups ---------------------------------------------------------------------

-- Restored tables in dependency (insert) order. Keep in sync with the completeness
-- test in tools/db-tests/local-edition.mjs.
create function chambapp_local.tablas_copia() returns text[]
language sql immutable set search_path = '' as $$
  select array[
    'public.perfiles', 'public.configuraciones_semanales', 'public.dias_configuracion_semanal',
    'public.jornadas', 'public.proyectos', 'public.tareas', 'public.imputaciones_odoo',
    'public.partes_horas', 'public.fichajes', 'public.ausencias', 'public.bovedas',
    'public.notas', 'public.nota_proyectos', 'public.nota_tareas', 'public.credenciales',
    'chambapp_private.odoo_credenciales'
  ]
$$;
-- Per-user bookkeeping that is cleared (not restored) on import.
create function chambapp_local.tablas_vaciadas() returns text[]
language sql immutable set search_path = '' as $$
  select array[
    'chambapp_private.operaciones_cronometro', 'chambapp_private.operaciones_fichajes',
    'chambapp_private.traspasos'
  ]
$$;
revoke all on function chambapp_local.tablas_copia() from public, anon, authenticated;
revoke all on function chambapp_local.tablas_vaciadas() from public, anon, authenticated;

-- Rows of one table that belong to the user.
create function chambapp_local.filtro_usuario(p_tabla text) returns text
language sql immutable set search_path = '' as $$
  select case p_tabla
    when 'public.perfiles' then 'id = $1'
    when 'public.dias_configuracion_semanal' then
      'configuracion_id in (select c.id from public.configuraciones_semanales c where c.usuario_id = $1)'
    else 'usuario_id = $1'
  end
$$;
revoke all on function chambapp_local.filtro_usuario(text) from public, anon, authenticated;

create function public.chambapp_copia_estado() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('instalacion', i.id, 'generacion', i.generacion_datos)
  from chambapp_local.instalacion i
$$;
revoke all on function public.chambapp_copia_estado() from public, anon, authenticated;
grant execute on function public.chambapp_copia_estado() to authenticated;

create function public.chambapp_copia_exportar() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  tabla text;
  filas jsonb;
  tablas jsonb := '{}';
  inst chambapp_local.instalacion;
begin
  if u is null then raise exception 'SESION_REQUERIDA'; end if;
  select * into inst from chambapp_local.instalacion;
  foreach tabla in array chambapp_local.tablas_copia() loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), ''[]'') from %s t where %s',
      tabla, chambapp_local.filtro_usuario(tabla))
      into filas using u;
    tablas := tablas || jsonb_build_object(tabla, filas);
  end loop;
  return jsonb_build_object(
    'formato', 'chambapp-servidor-datos',
    'version', 1,
    'usuario_id', u,
    'instalacion', inst.id,
    'generacion', inst.generacion_datos,
    'tablas', tablas);
end $$;
revoke all on function public.chambapp_copia_exportar() from public, anon, authenticated;
grant execute on function public.chambapp_copia_exportar() to authenticated;

-- Raises COPIA_INVALIDA with a short reason; the transaction is rolled back.
create function chambapp_local.rechazar(p_motivo text) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception 'COPIA_INVALIDA' using detail = p_motivo;
end $$;
revoke all on function chambapp_local.rechazar(text) from public, anon, authenticated;

-- Replaces all of the user's data with the backup, atomically. Rows are inserted with
-- triggers off (session_replication_role = replica) so versions and timestamps stay
-- as exported; every invariant those triggers protect for persisted data is then
-- checked here before commit (see docker/README.md, "Clasificación de triggers").
create function public.chambapp_copia_importar(p_datos jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  inst chambapp_local.instalacion;
  datos jsonb;
  tablas jsonb;
  tabla text;
  filas jsonb;
  columnas text;
  fila jsonb;
  clave text;
  restauradas oid[];
  fk record;
  condicion text;
  union_cols text;
  huerfano boolean;
  conteos jsonb := '{}';
  n bigint;
  nueva uuid := gen_random_uuid();
begin
  -- Exclusive first, then read the generation: no lock upgrade, no deadlock.
  perform pg_advisory_xact_lock(chambapp_local.clave_restauracion());
  if u is null then raise exception 'SESION_REQUERIDA'; end if;
  select * into inst from chambapp_local.instalacion for update;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    perform chambapp_local.rechazar('peticion');
  end if;
  if p_datos ->> 'generacion_esperada' is distinct from inst.generacion_datos::text then
    raise sqlstate 'PT409' using message = 'GENERACION_CAMBIADA';
  end if;

  -- 1. Shape and ownership, before touching anything.
  datos := p_datos -> 'datos';
  if jsonb_typeof(datos) is distinct from 'object' or
     datos ->> 'formato' is distinct from 'chambapp-servidor-datos' or
     datos -> 'version' is distinct from '1'::jsonb or
     datos ->> 'usuario_id' is distinct from u::text or
     jsonb_typeof(datos -> 'tablas') is distinct from 'object' then
    perform chambapp_local.rechazar('formato');
  end if;
  tablas := datos -> 'tablas';
  for clave in select jsonb_object_keys(tablas) loop
    if not clave = any(chambapp_local.tablas_copia()) then
      perform chambapp_local.rechazar('tabla desconocida: ' || clave);
    end if;
  end loop;
  foreach tabla in array chambapp_local.tablas_copia() loop
    filas := tablas -> tabla;
    if jsonb_typeof(filas) is distinct from 'array' then
      perform chambapp_local.rechazar('falta la tabla ' || tabla);
    end if;
    for fila in select value from jsonb_array_elements(filas) loop
      if jsonb_typeof(fila) <> 'object' then perform chambapp_local.rechazar('fila de ' || tabla); end if;
      if tabla = 'public.perfiles' then
        if fila ->> 'id' is distinct from u::text then perform chambapp_local.rechazar('perfil ajeno'); end if;
      elsif tabla <> 'public.dias_configuracion_semanal' then
        if fila ->> 'usuario_id' is distinct from u::text then
          perform chambapp_local.rechazar('fila ajena en ' || tabla);
        end if;
      end if;
    end loop;
  end loop;

  -- 2. Replace. Triggers (and their FK checks) are off until step 3.
  set local session_replication_role = replica;
  foreach tabla in array chambapp_local.tablas_vaciadas() loop
    execute format('delete from %s where usuario_id = $1', tabla) using u;
  end loop;
  for i in reverse array_length(chambapp_local.tablas_copia(), 1) .. 1 loop
    tabla := (chambapp_local.tablas_copia())[i];
    execute format('delete from %s where %s', tabla, chambapp_local.filtro_usuario(tabla)) using u;
  end loop;
  foreach tabla in array chambapp_local.tablas_copia() loop
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into columnas
      from pg_attribute a
      where a.attrelid = tabla::regclass and a.attnum > 0 and not a.attisdropped
        and a.attgenerated = '' and a.attidentity = '';
    begin
      execute format('insert into %s (%s) select %s from jsonb_populate_recordset(null::%s, $1)',
        tabla, columnas, columnas, tabla) using tablas -> tabla;
      get diagnostics n = row_count;
    exception when integrity_constraint_violation or invalid_text_representation or
        datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range or
        invalid_parameter_value then
      perform chambapp_local.rechazar(tabla || ': ' || sqlerrm);
    end;
    conteos := conteos || jsonb_build_object(tabla, n);
  end loop;
  set local session_replication_role = origin;

  -- 3. Validate the restored graph (CHECK, UNIQUE and EXCLUDE were enforced on insert).
  -- 3a. Every foreign key of the restored tables (their triggers were off).
  select array_agg(t::regclass::oid) into restauradas from unnest(chambapp_local.tablas_copia()) t;
  for fk in
    select c.conname, c.conrelid::regclass::text as hija, c.confrelid::regclass::text as padre,
      c.conkey, c.confkey
    from pg_constraint c
    where c.contype = 'f' and c.conrelid = any(restauradas)
  loop
    select string_agg(format('h.%I = p.%I', ha.attname, pa.attname), ' and '),
           string_agg(format('h.%I is not null', ha.attname), ' and ')
      into condicion, union_cols
      from unnest(fk.conkey, fk.confkey) as k(hc, pc)
      join pg_attribute ha on ha.attrelid = fk.hija::regclass and ha.attnum = k.hc
      join pg_attribute pa on pa.attrelid = fk.padre::regclass and pa.attnum = k.pc;
    execute format('select exists(select 1 from %s h where %s and not exists(select 1 from %s p where %s))',
      fk.hija, union_cols, fk.padre, condicion) into huerfano;
    if huerfano then perform chambapp_local.rechazar('referencia rota: ' || fk.conname); end if;
  end loop;

  -- 3b. Exactly the user's profile, with a valid time zone.
  if (select count(*) from public.perfiles where id = u) <> 1 then
    perform chambapp_local.rechazar('perfil');
  end if;
  if exists(select 1 from public.perfiles p where p.id = u and not exists(
       select 1 from pg_catalog.pg_timezone_names z where z.name = p.zona_horaria)) or
     exists(select 1 from public.jornadas j where j.usuario_id = u and not exists(
       select 1 from pg_catalog.pg_timezone_names z where z.name = j.zona_horaria)) then
    perform chambapp_local.rechazar('zona horaria');
  end if;

  -- 3c. validar_configuracion: each weekly version is fully distributed.
  if exists(select 1 from public.configuraciones_semanales c where c.usuario_id = u and
       c.minutos_semanales is distinct from (select sum(d.minutos_objetivo)
         from public.dias_configuracion_semanal d where d.configuracion_id = c.id)) then
    perform chambapp_local.rechazar('reparto semanal');
  end if;

  -- 3d. validar_arbol (the delete RPCs keep it): no live child of a deleted parent, and
  -- no running entry on an archived task or project.
  if exists(select 1 from public.tareas t join public.proyectos p on p.id = t.proyecto_id
       where t.usuario_id = u and t.eliminado_en is null and p.eliminado_en is not null) or
     exists(select 1 from public.partes_horas h join public.tareas t on t.id = h.tarea_id
       join public.proyectos p on p.id = t.proyecto_id
       where h.usuario_id = u and h.eliminado_en is null and
         (t.eliminado_en is not null or p.eliminado_en is not null or
          (h.fin_en is null and (t.archivado_en is not null or p.archivado_en is not null)))) then
    perform chambapp_local.rechazar('hijos activos de un padre borrado');
  end if;

  -- 3e. validar_fila / validar_fichaje on persisted live intervals: not in the future.
  if exists(select 1 from public.partes_horas h where h.usuario_id = u and h.eliminado_en is null
       and (h.inicio_en > clock_timestamp() or h.fin_en > clock_timestamp())) or
     exists(select 1 from public.fichajes f where f.usuario_id = u and f.eliminado_en is null
       and (f.inicio_en > clock_timestamp() or f.fin_en > clock_timestamp())) then
    perform chambapp_local.rechazar('intervalo futuro');
  end if;

  -- 3f. Vault: encrypted notes and credentials use the current vault generation.
  -- Plaintext notes may coexist with a vault (creating one does not encrypt them).
  if exists(select 1 from public.notas n where n.usuario_id = u and n.cifrado is not null and
       n.boveda_generacion is distinct from (select b.generacion from public.bovedas b where b.usuario_id = u)) or
     exists(select 1 from public.credenciales c where c.usuario_id = u and
       c.boveda_generacion is distinct from (select b.generacion from public.bovedas b where b.usuario_id = u)) then
    perform chambapp_local.rechazar('generacion de la boveda');
  end if;

  -- 3g. enlace_propio: links never point at another account's records (links to
  -- deleted or unknown records are valid persisted state).
  if exists(select 1 from public.nota_proyectos l join public.proyectos p on p.id = l.proyecto_id
       where l.usuario_id = u and p.usuario_id <> u) or
     exists(select 1 from public.nota_tareas l join public.tareas t on t.id = l.tarea_id
       where l.usuario_id = u and t.usuario_id <> u) or
     exists(select 1 from public.credenciales c join public.proyectos p on p.id = c.proyecto_id
       where c.usuario_id = u and p.usuario_id <> u) then
    perform chambapp_local.rechazar('enlace ajeno');
  end if;

  update chambapp_local.instalacion set generacion_datos = nueva;
  return jsonb_build_object('ok', true, 'generacion', nueva, 'conteos', conteos);
end $$;
revoke all on function public.chambapp_copia_importar(jsonb) from public, anon, authenticated;
grant execute on function public.chambapp_copia_importar(jsonb) to authenticated;

-- The single local user. Its profile is created by the chambapp_crear_perfil trigger.
insert into auth.users(id, email, raw_user_meta_data)
  values ('00000000-0000-4000-8000-000000000001', 'local@chambapp.local', '{"nombre": "Usuario"}')
  on conflict (id) do nothing;

notify pgrst, 'reload schema';
commit;
