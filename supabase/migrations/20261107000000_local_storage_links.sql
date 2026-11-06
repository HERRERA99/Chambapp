begin;

-- Plan 11: projects, tasks and time entries can be kept in the user's browser
-- (IndexedDB) instead of here. Notes and credentials stay in the cloud and may link
-- those local records by id only; nothing else of the local data reaches the cloud.
-- A project can move between the two stores (chambapp_traspasos).

-- 1. Links to records the cloud does not know --------------------------------
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tabla, c.conname
    from pg_constraint c
    where c.contype = 'f'
      and c.conrelid in ('public.nota_proyectos'::regclass, 'public.nota_tareas'::regclass,
                         'public.credenciales'::regclass)
      and c.confrelid in ('public.proyectos'::regclass, 'public.tareas'::regclass)
  loop
    execute format('alter table %s drop constraint %I', r.tabla, r.conname);
  end loop;
end $$;

-- Defence in depth for any write path (the foreign keys are gone): a link or a
-- credential may never point at another account's cloud record.
create function chambapp_private.enlace_propio() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name in ('nota_proyectos', 'credenciales') then
    if exists(select 1 from public.proyectos p where p.id = new.proyecto_id and p.usuario_id <> new.usuario_id) then
      raise exception 'ENLACE_AJENO';
    end if;
  elsif exists(select 1 from public.tareas t where t.id = new.tarea_id and t.usuario_id <> new.usuario_id) then
    raise exception 'ENLACE_AJENO';
  end if;
  return new;
end;
$$;
revoke all on function chambapp_private.enlace_propio() from public, anon, authenticated;
create trigger enlace_propio before insert or update on public.nota_proyectos
  for each row execute function chambapp_private.enlace_propio();
create trigger enlace_propio before insert or update on public.nota_tareas
  for each row execute function chambapp_private.enlace_propio();
create trigger enlace_propio before insert or update of proyecto_id, usuario_id on public.credenciales
  for each row execute function chambapp_private.enlace_propio();

-- A link shows unless it points at another account's or a deleted cloud record.
create or replace view public.notas_detalle with (security_invoker = true) as
select n.id, n.usuario_id, n.titulo, n.contenido_md, n.creado_en, n.actualizado_en, n.version,
  n.cifrado, n.boveda_generacion,
  array(select np.proyecto_id from public.nota_proyectos np
    where np.nota_id = n.id and np.usuario_id = n.usuario_id
      and not exists(select 1 from public.proyectos p where p.id = np.proyecto_id
        and (p.usuario_id <> np.usuario_id or p.eliminado_en is not null))
    order by np.proyecto_id) as proyecto_ids,
  array(select nt.tarea_id from public.nota_tareas nt
    where nt.nota_id = n.id and nt.usuario_id = n.usuario_id
      and not exists(select 1 from public.tareas t
        join public.proyectos p on p.id = t.proyecto_id and p.usuario_id = t.usuario_id
        where t.id = nt.tarea_id
          and (t.usuario_id <> nt.usuario_id or t.eliminado_en is not null or p.eliminado_en is not null))
    order by nt.tarea_id) as tarea_ids
from public.notas n;
revoke all on public.notas_detalle from public, anon, authenticated;
grant select on public.notas_detalle to authenticated;

create or replace view public.credenciales_detalle with (security_invoker = true) as
select c.* from public.credenciales c
  where not exists(select 1 from public.proyectos p where p.id = c.proyecto_id
    and (p.usuario_id <> c.usuario_id or p.eliminado_en is not null));
revoke all on public.credenciales_detalle from public, anon, authenticated;
grant select on public.credenciales_detalle to authenticated;

create or replace function chambapp_private.notas(p_accion text, p_datos jsonb)
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

  -- A link names a live project/task of this account in the cloud, or an id the cloud
  -- does not know (kept in the user's browser). Another account's or a deleted record
  -- is refused. Plan 11.
  if exists(select 1 from unnest(proyectos) as ids(id) join public.proyectos p on p.id = ids.id
    where p.usuario_id <> u or p.eliminado_en is not null) then
    raise exception 'PROYECTO_NO_DISPONIBLE';
  end if;
  if exists(select 1 from unnest(tareas) as ids(id) join public.tareas t on t.id = ids.id
    join public.proyectos p on p.id = t.proyecto_id and p.usuario_id = t.usuario_id
    where t.usuario_id <> u or t.eliminado_en is not null or p.eliminado_en is not null) then
    raise exception 'TAREA_NO_DISPONIBLE';
  end if;
  -- Same row locks as before for the links that are cloud records.
  perform 1 from public.proyectos p where p.id = any(proyectos) and p.usuario_id = u for share;
  perform 1 from public.tareas t where t.id = any(tareas) and t.usuario_id = u for share;

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

create or replace function chambapp_private.credenciales(p_accion text, p_datos jsonb)
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

  -- The project is a live cloud project of this account, or one the cloud does not
  -- know (kept in the user's browser). Plan 11.
  perform 1 from public.proyectos where id = proyecto and usuario_id = u for share;
  if exists(select 1 from public.proyectos where id = proyecto and
    (usuario_id <> u or eliminado_en is not null)) then
    raise exception 'PROYECTO_NO_DISPONIBLE';
  end if;

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

-- 2. Moving a project between the browser and the cloud -----------------------
create table chambapp_private.traspasos (
  usuario_id uuid not null references public.perfiles(id),
  id uuid not null,
  tipo text not null check (tipo in ('importar_proyecto','purgar_proyecto')),
  proyecto_id uuid not null,
  parametros jsonb not null,
  resultado jsonb not null,
  creado_en timestamptz not null default clock_timestamp(),
  primary key (usuario_id, id)
);
alter table chambapp_private.traspasos enable row level security;
revoke all on chambapp_private.traspasos from public, anon, authenticated;

create function chambapp_private.traspasos(p_accion text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  traspaso uuid;
  previo chambapp_private.traspasos;
  proyecto jsonb;
  pid uuid;
  fila jsonb;
  jornada public.jornadas;
  ids uuid[];
  n_tareas integer;
  n_partes integer;
  grupo record;
  nueva uuid;
  ahora timestamptz := clock_timestamp();
  respuesta jsonb;
begin
  perform chambapp_private.bloquear_perfil(u);
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' or
     not chambapp_private.es_uuid(p_datos->'traspaso_id') then
    raise exception 'TRASPASO_DATOS_INVALIDOS';
  end if;
  traspaso := (p_datos->>'traspaso_id')::uuid;
  select * into previo from chambapp_private.traspasos where usuario_id = u and id = traspaso;
  if found then
    if previo.tipo <> p_accion or previo.parametros <> p_datos then
      raise exception 'TRASPASO_ID_REUTILIZADO'; end if;
    return previo.resultado;
  end if;

  if p_accion = 'importar_proyecto' then
    proyecto := p_datos->'proyecto';
    if jsonb_typeof(proyecto) is distinct from 'object' or not chambapp_private.es_uuid(proyecto->'id') or
       jsonb_typeof(p_datos->'tareas') is distinct from 'array' or
       jsonb_typeof(p_datos->'partes') is distinct from 'array' or
       jsonb_array_length(p_datos->'tareas') > 10000 or jsonb_array_length(p_datos->'partes') > 200000 or
       exists(select 1 from jsonb_array_elements(p_datos->'tareas') e
         where not chambapp_private.es_uuid(e->'id') or (e->>'proyecto_id') is distinct from (proyecto->>'id')) or
       exists(select 1 from jsonb_array_elements(p_datos->'partes') e
         where not chambapp_private.es_uuid(e->'id') or not chambapp_private.es_uuid(e->'tarea_id') or
           (e->'imputacion_odoo_id' is not null and jsonb_typeof(e->'imputacion_odoo_id') <> 'null'
             and not chambapp_private.es_uuid(e->'imputacion_odoo_id')) or
           (e->>'fecha') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(e->>'zona_horaria','') = '') or
       exists(select 1 from jsonb_array_elements(p_datos->'partes') e
         where not exists(select 1 from jsonb_array_elements(p_datos->'tareas') t where t->>'id' = e->>'tarea_id')) then
      raise exception 'TRASPASO_DATOS_INVALIDOS';
    end if;
    pid := (proyecto->>'id')::uuid;
    if exists(select 1 from jsonb_array_elements(p_datos->'partes') e where e->'fin_en' is null or
         jsonb_typeof(e->'fin_en') = 'null') then
      raise exception 'DETENER_O_DESCARTAR_ACTIVO';
    end if;
    -- Every id must be new here (of any account): a record lives in one place only.
    select array_agg(x) into ids from (
      select pid x
      union all select (e->>'id')::uuid from jsonb_array_elements(p_datos->'tareas') e
      union all select (e->>'id')::uuid from jsonb_array_elements(p_datos->'partes') e
      union all select distinct (e->>'imputacion_odoo_id')::uuid from jsonb_array_elements(p_datos->'partes') e
        where jsonb_typeof(e->'imputacion_odoo_id') = 'string') s;
    if (select count(*) from unnest(ids)) <> (select count(distinct x) from unnest(ids) x) or
       exists(select 1 from public.proyectos where id = any(ids)) or
       exists(select 1 from public.tareas where id = any(ids)) or
       exists(select 1 from public.partes_horas where id = any(ids)) or
       exists(select 1 from public.imputaciones_odoo where id = any(ids)) then
      raise exception 'TRASPASO_ID_EXISTENTE';
    end if;

    -- Inserted unarchived; archived ones are archived at the end (the triggers refuse
    -- new children under an archived parent).
    insert into public.proyectos(id, usuario_id, nombre, descripcion, cliente, presupuesto_minutos)
      values(pid, u, proyecto->>'nombre', proyecto->>'descripcion', proyecto->>'cliente',
        (proyecto->>'presupuesto_minutos')::integer);
    insert into public.tareas(id, usuario_id, proyecto_id, titulo, descripcion, estado, estimacion_minutos,
        odoo_id, odoo_url)
      select (e->>'id')::uuid, u, pid, e->>'titulo', e->>'descripcion', coalesce(e->>'estado','pendiente'),
        (e->>'estimacion_minutos')::integer, e->>'odoo_id', e->>'odoo_url'
      from jsonb_array_elements(p_datos->'tareas') e;
    for fila in select value from jsonb_array_elements(p_datos->'partes') loop
      jornada := chambapp_private.obtener_jornada(u, (fila->>'fecha')::date, fila->>'zona_horaria');
      insert into public.partes_horas(id, usuario_id, jornada_id, tarea_id, inicio_en, fin_en,
          intervalo_redondeo_minutos, descripcion)
        values((fila->>'id')::uuid, u, jornada.id, (fila->>'tarea_id')::uuid, (fila->>'inicio_en')::timestamptz,
          (fila->>'fin_en')::timestamptz, (fila->>'intervalo_redondeo_minutos')::smallint, fila->>'descripcion');
    end loop;
    -- Imputations keep their id; one imputation groups entries of one task and day.
    for grupo in
      select (e->>'imputacion_odoo_id')::uuid imputacion, array_agg((e->>'id')::uuid) partes
      from jsonb_array_elements(p_datos->'partes') e
      where jsonb_typeof(e->'imputacion_odoo_id') = 'string' group by 1
    loop
      if (select count(distinct (h.tarea_id, h.jornada_id)) from public.partes_horas h
          where h.id = any(grupo.partes)) <> 1 then
        raise exception 'PARTES_DE_DISTINTO_GRUPO';
      end if;
      insert into public.imputaciones_odoo(id, usuario_id, tarea_id, jornada_id)
        select grupo.imputacion, u, h.tarea_id, h.jornada_id from public.partes_horas h
        where h.id = grupo.partes[1];
      update public.partes_horas set imputacion_odoo_id = grupo.imputacion where id = any(grupo.partes);
    end loop;
    update public.tareas set archivado_en = ahora
      where proyecto_id = pid and usuario_id = u and id in (
        select (e->>'id')::uuid from jsonb_array_elements(p_datos->'tareas') e
        where coalesce((e->>'archivado')::boolean, false));
    if coalesce((proyecto->>'archivado')::boolean, false) then
      update public.proyectos set archivado_en = ahora where id = pid;
    end if;
    select count(*) into n_tareas from public.tareas where proyecto_id = pid;
    select count(*) into n_partes from public.partes_horas h join public.tareas t on t.id = h.tarea_id
      where t.proyecto_id = pid;
    respuesta := jsonb_build_object('proyecto_id', pid, 'tareas', n_tareas, 'partes', n_partes);

  elsif p_accion = 'purgar_proyecto' then
    if not chambapp_private.es_uuid(p_datos->'proyecto_id') or
       (p_datos->>'confirmar') is distinct from 'true' then
      raise exception 'TRASPASO_DATOS_INVALIDOS';
    end if;
    pid := (p_datos->>'proyecto_id')::uuid;
    perform 1 from public.proyectos where id = pid and usuario_id = u for update;
    if not found then raise exception 'PROYECTO_NO_DISPONIBLE'; end if;
    if exists(select 1 from public.partes_horas h join public.tareas t on t.id = h.tarea_id
        where t.proyecto_id = pid and h.usuario_id = u and h.fin_en is null and h.eliminado_en is null) then
      raise exception 'DETENER_O_DESCARTAR_ACTIVO';
    end if;
    -- Physically removed (tombstones included): the project now lives in the browser.
    -- Notes and credentials keep the same ids and stay linked.
    delete from chambapp_private.operaciones_cronometro o using public.partes_horas h, public.tareas t
      where o.parte_id = h.id and h.tarea_id = t.id and t.proyecto_id = pid and o.usuario_id = u;
    delete from public.partes_horas h using public.tareas t
      where h.tarea_id = t.id and t.proyecto_id = pid and h.usuario_id = u;
    delete from public.imputaciones_odoo i using public.tareas t
      where i.tarea_id = t.id and t.proyecto_id = pid and i.usuario_id = u;
    delete from public.tareas where proyecto_id = pid and usuario_id = u;
    delete from public.proyectos where id = pid and usuario_id = u;
    respuesta := jsonb_build_object('proyecto_id', pid, 'purgado', true);
  else
    raise exception 'ACCION_NO_ADMITIDA';
  end if;

  insert into chambapp_private.traspasos(usuario_id, id, tipo, proyecto_id, parametros, resultado)
    values(u, traspaso, p_accion, pid, p_datos, respuesta);
  return respuesta;
end;
$$;
revoke all on function chambapp_private.traspasos(text,jsonb) from public, anon, authenticated;
grant execute on function chambapp_private.traspasos(text,jsonb) to authenticated;
create function public.chambapp_traspasos(p_accion text, p_datos jsonb default '{}')
returns jsonb language sql security invoker set search_path = '' as $$
  select chambapp_private.traspasos(p_accion, p_datos);
$$;
revoke all on function public.chambapp_traspasos(text,jsonb) from public, anon, authenticated;
grant execute on function public.chambapp_traspasos(text,jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
