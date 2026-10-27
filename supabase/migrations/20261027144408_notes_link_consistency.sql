begin;

create or replace function public.chambapp_notas(p_accion text, p_datos jsonb default '{}')
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
  -- A project/task can be soft-deleted concurrently by the workspace RPC.
  -- Reject an inconsistent final snapshot so the complete note write rolls back.
  if resultado->'proyecto_ids' is distinct from to_jsonb(proyectos) then
    raise exception 'PROYECTO_NO_DISPONIBLE';
  end if;
  if resultado->'tarea_ids' is distinct from to_jsonb(tareas) then
    raise exception 'TAREA_NO_DISPONIBLE';
  end if;
  return resultado;
end;
$$;

commit;
