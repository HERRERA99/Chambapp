begin;

create table public.notas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references public.perfiles(id) on delete cascade,
  titulo text not null check (length(btrim(titulo)) between 1 and 200),
  contenido_md text not null default '' check (octet_length(contenido_md) <= 1000000),
  creado_en timestamptz not null default clock_timestamp(),
  actualizado_en timestamptz not null default clock_timestamp(),
  version bigint not null default 1 check (version > 0),
  unique (id, usuario_id)
);
create index notas_usuario_actualizadas on public.notas(usuario_id, actualizado_en desc, id);

create table public.nota_proyectos (
  nota_id uuid not null,
  proyecto_id uuid not null,
  usuario_id uuid not null default auth.uid(),
  primary key (nota_id, usuario_id, proyecto_id),
  foreign key (nota_id, usuario_id) references public.notas(id, usuario_id) on delete cascade,
  foreign key (proyecto_id, usuario_id) references public.proyectos(id, usuario_id) on delete cascade
);
create index nota_proyectos_proyecto on public.nota_proyectos(proyecto_id, usuario_id);
create index nota_proyectos_usuario on public.nota_proyectos(usuario_id);
create table public.nota_tareas (
  nota_id uuid not null,
  tarea_id uuid not null,
  usuario_id uuid not null default auth.uid(),
  primary key (nota_id, usuario_id, tarea_id),
  foreign key (nota_id, usuario_id) references public.notas(id, usuario_id) on delete cascade,
  foreign key (tarea_id, usuario_id) references public.tareas(id, usuario_id) on delete cascade
);
create index nota_tareas_tarea on public.nota_tareas(tarea_id, usuario_id);
create index nota_tareas_usuario on public.nota_tareas(usuario_id);

do $$
declare tabla text;
begin
  foreach tabla in array array['notas', 'nota_proyectos', 'nota_tareas'] loop
    execute format('alter table public.%I enable row level security', tabla);
    execute format('revoke all on public.%I from public, anon, authenticated', tabla);
    execute format('grant select, insert, update, delete on public.%I to authenticated', tabla);
    execute format('create policy propietario on public.%I to authenticated using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()))', tabla);
  end loop;
end $$;

create function public.actualizar_version_nota() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.creado_en := clock_timestamp();
    new.actualizado_en := new.creado_en;
  else
    new.id := old.id;
    new.usuario_id := old.usuario_id;
    new.creado_en := old.creado_en;
    new.version := old.version + 1;
    new.actualizado_en := clock_timestamp();
  end if;
  return new;
end;
$$;
revoke all on function public.actualizar_version_nota() from public, anon, authenticated;
create trigger notas_version before insert or update on public.notas
  for each row execute function public.actualizar_version_nota();

-- Invoker semantics apply RLS to notes and every associated record. Soft-deleted
-- projects/tasks disappear from associations without removing the Markdown.
create view public.notas_detalle with (security_invoker = true) as
select n.*,
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

create function public.chambapp_notas(p_accion text, p_datos jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  u uuid := auth.uid();
  identificador uuid;
  fila public.notas;
  resultado jsonb;
  proyectos uuid[];
  tareas uuid[];
begin
  if u is null then raise exception 'SESION_REQUERIDA' using errcode = '42501'; end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' or
    jsonb_typeof(p_datos->'id') is distinct from 'string' or
    (p_datos->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'NOTA_DATOS_INVALIDOS';
  end if;
  identificador := (p_datos->>'id')::uuid;
  -- Serialize note changes per account. Row locks protect each note's version.
  perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
  select * into fila from public.notas where id = identificador and usuario_id = u for update;

  if p_accion = 'eliminar_nota' then
    if fila.id is null then raise exception 'NOTA_NO_DISPONIBLE'; end if;
    if fila.version is distinct from (p_datos->>'version')::bigint then raise exception 'CONFLICTO_VERSION'; end if;
    select to_jsonb(d) into resultado from public.notas_detalle d where d.id = fila.id;
    delete from public.notas where id = fila.id and usuario_id = u;
    return resultado;
  elsif p_accion is distinct from 'guardar_nota' then
    raise exception 'ACCION_NO_ADMITIDA';
  end if;

  if jsonb_typeof(p_datos->'titulo') is distinct from 'string' or
    length(btrim(p_datos->>'titulo')) not between 1 and 200 or
    jsonb_typeof(p_datos->'contenido_md') is distinct from 'string' or
    jsonb_typeof(p_datos->'proyecto_ids') is distinct from 'array' or
    jsonb_typeof(p_datos->'tarea_ids') is distinct from 'array' then
    raise exception 'NOTA_DATOS_INVALIDOS';
  end if;
  if octet_length(p_datos->>'contenido_md') > 1000000 then raise exception 'NOTA_DEMASIADO_GRANDE'; end if;
  if jsonb_array_length(p_datos->'proyecto_ids') > 100 or jsonb_array_length(p_datos->'tarea_ids') > 100 then
    raise exception 'NOTA_DEMASIADOS_VINCULOS';
  end if;
  if exists(select 1 from jsonb_array_elements((p_datos->'proyecto_ids') || (p_datos->'tarea_ids')) e
    where jsonb_typeof(e.value) <> 'string' or
      (e.value #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
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
    select to_jsonb(d) into resultado from public.notas_detalle d where d.id = fila.id;
    if fila.titulo is distinct from btrim(p_datos->>'titulo') or
      fila.contenido_md is distinct from p_datos->>'contenido_md' or
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
    insert into public.notas(id, usuario_id, titulo, contenido_md)
      values(identificador, u, btrim(p_datos->>'titulo'), p_datos->>'contenido_md') returning * into fila;
  else
    update public.notas set titulo = btrim(p_datos->>'titulo'), contenido_md = p_datos->>'contenido_md'
      where id = identificador and usuario_id = u returning * into fila;
  end if;
  delete from public.nota_proyectos where nota_id = identificador and usuario_id = u;
  delete from public.nota_tareas where nota_id = identificador and usuario_id = u;
  insert into public.nota_proyectos(nota_id, proyecto_id, usuario_id) select identificador, id, u from unnest(proyectos) id;
  insert into public.nota_tareas(nota_id, tarea_id, usuario_id) select identificador, id, u from unnest(tareas) id;
  select to_jsonb(d) into resultado from public.notas_detalle d where d.id = identificador and d.usuario_id = u;
  return resultado;
end;
$$;
revoke all on function public.chambapp_notas(text,jsonb) from public, anon, authenticated;
grant execute on function public.chambapp_notas(text,jsonb) to authenticated;

commit;
