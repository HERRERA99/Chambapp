begin;

-- Client-side encryption (Plan 6). The browser derives a key from the user's
-- master password; the database only stores the wrapped data key and ciphertext.
-- Lock order for every write below: the profile row first (as operar_legacy and
-- therefore eliminar_proyecto do), then the user's own rows.

create table public.bovedas (
  usuario_id uuid primary key references public.perfiles(id) on delete cascade,
  generacion uuid not null,
  sal text not null check (sal ~ '^[A-Za-z0-9_-]{22}$'),
  iteraciones integer not null check (iteraciones between 100000 and 10000000),
  clave_envuelta text not null
    check (clave_envuelta ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$' and length(clave_envuelta) <= 200),
  creado_en timestamptz not null default clock_timestamp(),
  actualizado_en timestamptz not null default clock_timestamp(),
  version bigint not null default 1 check (version > 0)
);
alter table public.bovedas enable row level security;
revoke all on public.bovedas from public, anon, authenticated;
grant select on public.bovedas to authenticated;
create policy propietario on public.bovedas for select to authenticated
  using (usuario_id = (select auth.uid()));

-- Notes: either legacy plaintext or an encrypted envelope (title/content empty).
alter table public.notas
  add column cifrado text,
  add column boveda_generacion uuid,
  drop constraint notas_titulo_check,
  add constraint notas_contenido_o_cifrado check (
    (cifrado is null and boveda_generacion is null and length(btrim(titulo)) between 1 and 200) or
    (cifrado is not null and boveda_generacion is not null and titulo = '' and contenido_md = '' and
      cifrado ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$' and octet_length(cifrado) <= 1400000));

-- Writes go through chambapp_notas only.
revoke insert, update, delete on public.notas, public.nota_proyectos, public.nota_tareas from authenticated;

drop view public.notas_detalle;
create view public.notas_detalle with (security_invoker = true) as
select n.id, n.usuario_id, n.titulo, n.contenido_md, n.creado_en, n.actualizado_en, n.version,
  n.cifrado, n.boveda_generacion,
  array(select np.proyecto_id from public.nota_proyectos np
    join public.proyectos p on p.id = np.proyecto_id and p.usuario_id = np.usuario_id
    where np.nota_id = n.id and np.usuario_id = n.usuario_id and p.eliminado_en is null
    order by np.proyecto_id) as proyecto_ids,
  array(select nt.tarea_id from public.nota_tareas nt
    join public.tareas t on t.id = nt.tarea_id and t.usuario_id = nt.usuario_id
    join public.proyectos p on p.id = t.proyecto_id and p.usuario_id = t.usuario_id
    where nt.nota_id = n.id and nt.usuario_id = n.usuario_id
      and t.eliminado_en is null and p.eliminado_en is null
    order by nt.tarea_id) as tarea_ids
from public.notas n;
revoke all on public.notas_detalle from public, anon, authenticated;
grant select on public.notas_detalle to authenticated;

-- Defence in depth for any write path: once a vault exists, notes must be
-- encrypted with its current generation.
create function chambapp_private.notas_cifrado_obligatorio() returns trigger
language plpgsql security definer set search_path = '' as $$
declare vigente uuid;
begin
  perform 1 from public.perfiles where id = new.usuario_id for key share;
  select generacion into vigente from public.bovedas where usuario_id = new.usuario_id for share;
  if vigente is not null and new.cifrado is null then raise exception 'NOTA_DEBE_CIFRARSE'; end if;
  if new.cifrado is not null and new.boveda_generacion is distinct from vigente then
    raise exception 'BOVEDA_CAMBIADA';
  end if;
  return new;
end;
$$;
revoke all on function chambapp_private.notas_cifrado_obligatorio() from public, anon, authenticated;
create trigger notas_cifrado_obligatorio before insert or update on public.notas
  for each row execute function chambapp_private.notas_cifrado_obligatorio();

create table public.credenciales (
  id uuid primary key,
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  proyecto_id uuid not null,
  boveda_generacion uuid not null,
  cifrado text not null
    check (cifrado ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$' and octet_length(cifrado) <= 262144),
  creado_en timestamptz not null default clock_timestamp(),
  actualizado_en timestamptz not null default clock_timestamp(),
  version bigint not null default 1 check (version > 0),
  unique (id, usuario_id),
  foreign key (proyecto_id, usuario_id) references public.proyectos(id, usuario_id) on delete cascade
);
create index credenciales_usuario on public.credenciales(usuario_id, proyecto_id);
create index credenciales_proyecto on public.credenciales(proyecto_id, usuario_id);
alter table public.credenciales enable row level security;
revoke all on public.credenciales from public, anon, authenticated;
grant select on public.credenciales to authenticated;
create policy propietario on public.credenciales for select to authenticated
  using (usuario_id = (select auth.uid()));
create trigger credenciales_version before insert or update on public.credenciales
  for each row execute function public.actualizar_version_nota();

create view public.credenciales_detalle with (security_invoker = true) as
select c.* from public.credenciales c
  join public.proyectos p on p.id = c.proyecto_id and p.usuario_id = c.usuario_id
  where p.eliminado_en is null;
revoke all on public.credenciales_detalle from public, anon, authenticated;
grant select on public.credenciales_detalle to authenticated;

-- eliminar_proyecto only marks the project; its secrets are removed with it.
create function chambapp_private.borrar_credenciales_proyecto() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.credenciales where proyecto_id = new.id and usuario_id = new.usuario_id;
  return new;
end;
$$;
revoke all on function chambapp_private.borrar_credenciales_proyecto() from public, anon, authenticated;
create trigger proyectos_borrar_credenciales after update of eliminado_en on public.proyectos
  for each row when (old.eliminado_en is null and new.eliminado_en is not null)
  execute function chambapp_private.borrar_credenciales_proyecto();

create function chambapp_private.es_uuid(valor jsonb) returns boolean
language sql immutable set search_path = '' as $$
  -- Never NULL: a missing value is invalid, not unknown.
  select coalesce(jsonb_typeof(valor) = 'string' and
    (valor #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false);
$$;
create function chambapp_private.es_sobre(valor jsonb, maximo integer) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(valor) = 'string' and
    (valor #>> '{}') ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$' and
    octet_length(valor #>> '{}') <= maximo, false);
$$;
revoke all on function chambapp_private.es_uuid(jsonb) from public, anon, authenticated;
revoke all on function chambapp_private.es_sobre(jsonb,integer) from public, anon, authenticated;

create function chambapp_private.bloquear_perfil(u uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if u is null then raise exception 'SESION_REQUERIDA' using errcode = '42501'; end if;
  perform 1 from public.perfiles where id = u for update;
  if not found then raise exception 'PERFIL_NO_DISPONIBLE' using errcode = '42501'; end if;
end;
$$;
revoke all on function chambapp_private.bloquear_perfil(uuid) from public, anon, authenticated;

-- Vault -----------------------------------------------------------------------
create function chambapp_private.boveda(p_accion text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  fila public.bovedas;
begin
  perform chambapp_private.bloquear_perfil(u);
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' or
    not chambapp_private.es_uuid(p_datos->'generacion') then
    raise exception 'BOVEDA_DATOS_INVALIDOS';
  end if;
  select * into fila from public.bovedas where usuario_id = u for update;

  if p_accion = 'restablecer_boveda' then
    if p_datos->>'confirmacion' is distinct from 'BORRAR' then raise exception 'CONFIRMACION_REQUERIDA'; end if;
    if fila.usuario_id is null or fila.generacion is distinct from (p_datos->>'generacion')::uuid then
      raise exception 'BOVEDA_CAMBIADA';
    end if;
    delete from public.credenciales where usuario_id = u;
    delete from public.notas where usuario_id = u and cifrado is not null;
    delete from public.bovedas where usuario_id = u;
    return jsonb_build_object('restablecida', true, 'generacion', fila.generacion);
  end if;

  if p_accion not in ('crear_boveda', 'cambiar_clave') then raise exception 'ACCION_NO_ADMITIDA'; end if;
  if jsonb_typeof(p_datos->'sal') is distinct from 'string' or
    (p_datos->>'sal') !~ '^[A-Za-z0-9_-]{22}$' or
    jsonb_typeof(p_datos->'iteraciones') is distinct from 'number' or
    (p_datos->>'iteraciones') !~ '^[0-9]{6,8}$' or
    (p_datos->>'iteraciones')::integer not between 100000 and 10000000 or
    not chambapp_private.es_sobre(p_datos->'clave_envuelta', 200) then
    raise exception 'BOVEDA_DATOS_INVALIDOS';
  end if;

  if p_accion = 'crear_boveda' then
    if fila.usuario_id is not null then
      -- An identical retry returns the stored vault.
      if fila.generacion = (p_datos->>'generacion')::uuid and fila.sal = p_datos->>'sal' and
        fila.iteraciones = (p_datos->>'iteraciones')::integer and
        fila.clave_envuelta = p_datos->>'clave_envuelta' then
        return to_jsonb(fila);
      end if;
      raise exception 'BOVEDA_EXISTENTE';
    end if;
    insert into public.bovedas(usuario_id, generacion, sal, iteraciones, clave_envuelta)
      values(u, (p_datos->>'generacion')::uuid, p_datos->>'sal', (p_datos->>'iteraciones')::integer,
        p_datos->>'clave_envuelta') returning * into fila;
    return to_jsonb(fila);
  end if;

  -- cambiar_clave
  if fila.usuario_id is null or fila.generacion is distinct from (p_datos->>'generacion')::uuid then
    raise exception 'BOVEDA_CAMBIADA';
  end if;
  if fila.version is distinct from (p_datos->>'version')::bigint then raise exception 'CONFLICTO_VERSION'; end if;
  update public.bovedas set sal = p_datos->>'sal', iteraciones = (p_datos->>'iteraciones')::integer,
    clave_envuelta = p_datos->>'clave_envuelta', version = version + 1, actualizado_en = clock_timestamp()
    where usuario_id = u returning * into fila;
  return to_jsonb(fila);
end;
$$;
revoke all on function chambapp_private.boveda(text,jsonb) from public, anon, authenticated;
grant execute on function chambapp_private.boveda(text,jsonb) to authenticated;
create function public.chambapp_boveda(p_accion text, p_datos jsonb default '{}')
returns jsonb language sql security invoker set search_path = '' as $$
  select chambapp_private.boveda(p_accion, p_datos);
$$;
revoke all on function public.chambapp_boveda(text,jsonb) from public, anon, authenticated;
grant execute on function public.chambapp_boveda(text,jsonb) to authenticated;

-- Notes -----------------------------------------------------------------------
drop function public.chambapp_notas(text,jsonb);
create function chambapp_private.notas(p_accion text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  identificador uuid;
  fila public.notas;
  resultado jsonb;
  proyectos uuid[];
  tareas uuid[];
  vigente uuid;
  cifrada boolean;
begin
  perform chambapp_private.bloquear_perfil(u);
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' or not chambapp_private.es_uuid(p_datos->'id') then
    raise exception 'NOTA_DATOS_INVALIDOS';
  end if;
  identificador := (p_datos->>'id')::uuid;
  select * into fila from public.notas where id = identificador and usuario_id = u for update;

  if p_accion = 'eliminar_nota' then
    if fila.id is null then raise exception 'NOTA_NO_DISPONIBLE'; end if;
    if fila.version is distinct from (p_datos->>'version')::bigint then raise exception 'CONFLICTO_VERSION'; end if;
    select to_jsonb(d) into resultado from public.notas_detalle d where d.id = fila.id and d.usuario_id = u;
    delete from public.notas where id = fila.id and usuario_id = u;
    return resultado;
  elsif p_accion is distinct from 'guardar_nota' then
    raise exception 'ACCION_NO_ADMITIDA';
  end if;

  cifrada := p_datos ? 'cifrado';
  if jsonb_typeof(p_datos->'proyecto_ids') is distinct from 'array' or
    jsonb_typeof(p_datos->'tarea_ids') is distinct from 'array' then
    raise exception 'NOTA_DATOS_INVALIDOS';
  end if;
  select generacion into vigente from public.bovedas where usuario_id = u;
  if cifrada then
    if p_datos ? 'titulo' or p_datos ? 'contenido_md' or
      not chambapp_private.es_uuid(p_datos->'boveda_generacion') then
      raise exception 'NOTA_DATOS_INVALIDOS';
    end if;
    if jsonb_typeof(p_datos->'cifrado') is distinct from 'string' or
      (p_datos->>'cifrado') !~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$' then
      raise exception 'NOTA_DATOS_INVALIDOS';
    end if;
    if octet_length(p_datos->>'cifrado') > 1400000 then raise exception 'NOTA_DEMASIADO_GRANDE'; end if;
    if vigente is distinct from (p_datos->>'boveda_generacion')::uuid then raise exception 'BOVEDA_CAMBIADA'; end if;
  else
    if jsonb_typeof(p_datos->'titulo') is distinct from 'string' or
      length(btrim(p_datos->>'titulo')) not between 1 and 200 or
      jsonb_typeof(p_datos->'contenido_md') is distinct from 'string' then
      raise exception 'NOTA_DATOS_INVALIDOS';
    end if;
    if octet_length(p_datos->>'contenido_md') > 1000000 then raise exception 'NOTA_DEMASIADO_GRANDE'; end if;
    if vigente is not null then raise exception 'NOTA_DEBE_CIFRARSE'; end if;
  end if;
  if jsonb_array_length(p_datos->'proyecto_ids') > 100 or jsonb_array_length(p_datos->'tarea_ids') > 100 then
    raise exception 'NOTA_DEMASIADOS_VINCULOS';
  end if;
  if exists(select 1 from jsonb_array_elements((p_datos->'proyecto_ids') || (p_datos->'tarea_ids')) e
    where not chambapp_private.es_uuid(e.value)) then
    raise exception 'NOTA_DATOS_INVALIDOS';
  end if;
  select coalesce(array_agg(distinct value::uuid order by value::uuid), '{}'::uuid[]) into proyectos
    from jsonb_array_elements_text(p_datos->'proyecto_ids');
  select coalesce(array_agg(distinct value::uuid order by value::uuid), '{}'::uuid[]) into tareas
    from jsonb_array_elements_text(p_datos->'tarea_ids');

  if p_datos ? 'version' then
    if fila.id is null then raise exception 'NOTA_NO_DISPONIBLE'; end if;
    if fila.version is distinct from (p_datos->>'version')::bigint then raise exception 'CONFLICTO_VERSION'; end if;
  elsif fila.id is not null then
    -- Retried creation: only an identical request returns the stored note.
    select to_jsonb(d) into resultado from public.notas_detalle d where d.id = fila.id and d.usuario_id = u;
    if (cifrada and fila.cifrado is distinct from p_datos->>'cifrado') or
      (not cifrada and (fila.cifrado is not null or fila.titulo is distinct from btrim(p_datos->>'titulo') or
        fila.contenido_md is distinct from p_datos->>'contenido_md')) or
      resultado->'proyecto_ids' is distinct from to_jsonb(proyectos) or
      resultado->'tarea_ids' is distinct from to_jsonb(tareas) then raise exception 'NOTA_ID_REUTILIZADO'; end if;
    return resultado;
  end if;

  if exists(select 1 from unnest(proyectos) as ids(id) where not exists(
    select 1 from public.proyectos p where p.id = ids.id and p.usuario_id = u and p.eliminado_en is null)) then
    raise exception 'PROYECTO_NO_DISPONIBLE';
  end if;
  if exists(select 1 from unnest(tareas) as ids(id) where not exists(
    select 1 from public.tareas t join public.proyectos p on p.id = t.proyecto_id and p.usuario_id = t.usuario_id
    where t.id = ids.id and t.usuario_id = u and t.eliminado_en is null and p.eliminado_en is null)) then
    raise exception 'TAREA_NO_DISPONIBLE';
  end if;

  if fila.id is null then
    insert into public.notas(id, usuario_id, titulo, contenido_md, cifrado, boveda_generacion)
      values(identificador, u,
        case when cifrada then '' else btrim(p_datos->>'titulo') end,
        case when cifrada then '' else p_datos->>'contenido_md' end,
        case when cifrada then p_datos->>'cifrado' end,
        case when cifrada then (p_datos->>'boveda_generacion')::uuid end) returning * into fila;
  else
    update public.notas set
      titulo = case when cifrada then '' else btrim(p_datos->>'titulo') end,
      contenido_md = case when cifrada then '' else p_datos->>'contenido_md' end,
      cifrado = case when cifrada then p_datos->>'cifrado' end,
      boveda_generacion = case when cifrada then (p_datos->>'boveda_generacion')::uuid end
      where id = identificador and usuario_id = u returning * into fila;
  end if;
  delete from public.nota_proyectos where nota_id = identificador and usuario_id = u;
  delete from public.nota_tareas where nota_id = identificador and usuario_id = u;
  insert into public.nota_proyectos(nota_id, proyecto_id, usuario_id) select identificador, id, u from unnest(proyectos) id;
  insert into public.nota_tareas(nota_id, tarea_id, usuario_id) select identificador, id, u from unnest(tareas) id;
  select to_jsonb(d) into resultado from public.notas_detalle d where d.id = identificador and d.usuario_id = u;
  if resultado->'proyecto_ids' is distinct from to_jsonb(proyectos) then
    raise exception 'PROYECTO_NO_DISPONIBLE';
  end if;
  if resultado->'tarea_ids' is distinct from to_jsonb(tareas) then
    raise exception 'TAREA_NO_DISPONIBLE';
  end if;
  return resultado;
end;
$$;
revoke all on function chambapp_private.notas(text,jsonb) from public, anon, authenticated;
grant execute on function chambapp_private.notas(text,jsonb) to authenticated;
create function public.chambapp_notas(p_accion text, p_datos jsonb default '{}')
returns jsonb language sql security invoker set search_path = '' as $$
  select chambapp_private.notas(p_accion, p_datos);
$$;
revoke all on function public.chambapp_notas(text,jsonb) from public, anon, authenticated;
grant execute on function public.chambapp_notas(text,jsonb) to authenticated;

-- Credentials -----------------------------------------------------------------
create function chambapp_private.credenciales(p_accion text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  identificador uuid;
  proyecto uuid;
  fila public.credenciales;
  vigente uuid;
begin
  perform chambapp_private.bloquear_perfil(u);
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' or not chambapp_private.es_uuid(p_datos->'id') then
    raise exception 'CREDENCIAL_DATOS_INVALIDOS';
  end if;
  identificador := (p_datos->>'id')::uuid;
  select * into fila from public.credenciales where id = identificador and usuario_id = u for update;

  if p_accion = 'eliminar_credencial' then
    if fila.id is null then raise exception 'CREDENCIAL_NO_DISPONIBLE'; end if;
    if fila.version is distinct from (p_datos->>'version')::bigint then raise exception 'CONFLICTO_VERSION'; end if;
    delete from public.credenciales where id = fila.id and usuario_id = u;
    return to_jsonb(fila);
  elsif p_accion is distinct from 'guardar_credencial' then
    raise exception 'ACCION_NO_ADMITIDA';
  end if;

  if not chambapp_private.es_uuid(p_datos->'proyecto_id') or
    not chambapp_private.es_uuid(p_datos->'boveda_generacion') or
    jsonb_typeof(p_datos->'cifrado') is distinct from 'string' or
    (p_datos->>'cifrado') !~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$' then
    raise exception 'CREDENCIAL_DATOS_INVALIDOS';
  end if;
  if octet_length(p_datos->>'cifrado') > 262144 then raise exception 'CREDENCIAL_DEMASIADO_GRANDE'; end if;
  select generacion into vigente from public.bovedas where usuario_id = u;
  if vigente is distinct from (p_datos->>'boveda_generacion')::uuid then raise exception 'BOVEDA_CAMBIADA'; end if;
  proyecto := (p_datos->>'proyecto_id')::uuid;

  if p_datos ? 'version' then
    if fila.id is null then raise exception 'CREDENCIAL_NO_DISPONIBLE'; end if;
    if fila.version is distinct from (p_datos->>'version')::bigint then raise exception 'CONFLICTO_VERSION'; end if;
  elsif fila.id is not null then
    if fila.cifrado is distinct from p_datos->>'cifrado' or fila.proyecto_id is distinct from proyecto then
      raise exception 'CREDENCIAL_ID_REUTILIZADO';
    end if;
    return to_jsonb(fila);
  end if;

  perform 1 from public.proyectos where id = proyecto and usuario_id = u and eliminado_en is null for share;
  if not found then raise exception 'PROYECTO_NO_DISPONIBLE'; end if;

  if fila.id is null then
    insert into public.credenciales(id, usuario_id, proyecto_id, boveda_generacion, cifrado)
      values(identificador, u, proyecto, vigente, p_datos->>'cifrado') returning * into fila;
  else
    update public.credenciales set proyecto_id = proyecto, boveda_generacion = vigente,
      cifrado = p_datos->>'cifrado' where id = identificador and usuario_id = u returning * into fila;
  end if;
  return to_jsonb(fila);
end;
$$;
revoke all on function chambapp_private.credenciales(text,jsonb) from public, anon, authenticated;
grant execute on function chambapp_private.credenciales(text,jsonb) to authenticated;
create function public.chambapp_credenciales(p_accion text, p_datos jsonb default '{}')
returns jsonb language sql security invoker set search_path = '' as $$
  select chambapp_private.credenciales(p_accion, p_datos);
$$;
revoke all on function public.chambapp_credenciales(text,jsonb) from public, anon, authenticated;
grant execute on function public.chambapp_credenciales(text,jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
