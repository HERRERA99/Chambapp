begin;

-- Plan 7: a time entry (parte) is the atomic interval; an Odoo imputation groups
-- one or more entries of the same task and day and will become one Odoo
-- timesheet line. Its logged time is the rounding of the summed real time.
-- Lock order for writes: the profile row first (as operar_legacy does), then entries.

create table public.imputaciones_odoo (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles(id),
  tarea_id uuid not null,
  jornada_id uuid not null,
  -- Only manual marks exist today; automatic sending will add its own states.
  estado text not null default 'manual' check (estado in ('manual')),
  creado_en timestamptz not null default clock_timestamp(),
  unique(id, usuario_id, tarea_id, jornada_id),
  foreign key(tarea_id, usuario_id) references public.tareas(id, usuario_id),
  foreign key(jornada_id, usuario_id) references public.jornadas(id, usuario_id)
);
create index imputaciones_odoo_usuario_jornada on public.imputaciones_odoo(usuario_id, jornada_id);
create index imputaciones_odoo_tarea_usuario on public.imputaciones_odoo(tarea_id, usuario_id);
alter table public.imputaciones_odoo enable row level security;
revoke all on public.imputaciones_odoo from public, anon, authenticated;
grant select on public.imputaciones_odoo to authenticated;
create policy lectura_propia on public.imputaciones_odoo for select to authenticated
  using ((select auth.uid()) = usuario_id);
comment on table public.imputaciones_odoo is
  'One future Odoo timesheet line: entries of one task and day logged together. Written only through chambapp_imputaciones and the entry trigger.';

alter table public.partes_horas add column imputacion_odoo_id uuid;
-- The composite key guarantees that an imputation only groups entries of its own task and day.
alter table public.partes_horas add constraint partes_horas_imputacion_odoo_fk
  foreign key(imputacion_odoo_id, usuario_id, tarea_id, jornada_id)
  references public.imputaciones_odoo(id, usuario_id, tarea_id, jornada_id);
create index partes_imputacion_odoo on public.partes_horas(imputacion_odoo_id)
  where imputacion_odoo_id is not null;
comment on column public.partes_horas.imputacion_odoo_id is
  'Odoo imputation this entry belongs to; null means pending.';
comment on column public.partes_horas.imputado_en_odoo is
  'Derived from imputacion_odoo_id (kept for compatibility): true when the entry belongs to an imputation.';

-- Backfill: every marked entry, tombstones included, gets its own imputation, so the
-- historical totals stay exactly as they were. The row triggers are switched off for
-- this statement only: tombstones cannot be updated through validar_fila and versions
-- must not change. Immediate constraints leave no deferred events pending.
set constraints all immediate;
create temporary table imputaciones_migradas on commit drop as
  select h.id as parte_id, gen_random_uuid() as imputacion_id, h.usuario_id, h.tarea_id, h.jornada_id
  from public.partes_horas h where h.imputado_en_odoo;
insert into public.imputaciones_odoo(id, usuario_id, tarea_id, jornada_id)
  select imputacion_id, usuario_id, tarea_id, jornada_id from imputaciones_migradas;
alter table public.partes_horas disable trigger validar_fila, disable trigger validar_arbol;
update public.partes_horas h set imputacion_odoo_id = m.imputacion_id
  from imputaciones_migradas m where h.id = m.parte_id;
alter table public.partes_horas enable trigger validar_fila, enable trigger validar_arbol;
drop table imputaciones_migradas;

alter table public.partes_horas add constraint partes_horas_imputado_coherente
  check (imputado_en_odoo = (imputacion_odoo_id is not null));

-- Keeps imputado_en_odoo and imputacion_odoo_id in step. The legacy commands
-- (crear_parte / editar_parte with imputado_en_odoo) become single-entry imputations.
create function chambapp_private.sincronizar_imputacion_odoo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare nueva uuid;
begin
  -- Explicit assignment (chambapp_imputaciones) wins.
  if (tg_op = 'UPDATE' and new.imputacion_odoo_id is distinct from old.imputacion_odoo_id) or
     (tg_op = 'INSERT' and new.imputacion_odoo_id is not null) then
    new.imputado_en_odoo := new.imputacion_odoo_id is not null;
    return new;
  end if;
  -- Legacy mark switched on.
  if new.imputado_en_odoo and (tg_op = 'INSERT' or not old.imputado_en_odoo) then
    insert into public.imputaciones_odoo(usuario_id, tarea_id, jornada_id)
      values(new.usuario_id, new.tarea_id, new.jornada_id) returning id into nueva;
    new.imputacion_odoo_id := nueva;
    return new;
  end if;
  if tg_op = 'INSERT' then return new; end if;
  -- Legacy mark switched off.
  if not new.imputado_en_odoo and old.imputado_en_odoo then
    new.imputacion_odoo_id := null;
    return new;
  end if;
  -- A marked entry moved to another task or day keeps its mark in a new imputation of its own.
  if new.imputacion_odoo_id is not null and
     (new.tarea_id <> old.tarea_id or new.jornada_id <> old.jornada_id) then
    insert into public.imputaciones_odoo(usuario_id, tarea_id, jornada_id)
      values(new.usuario_id, new.tarea_id, new.jornada_id) returning id into nueva;
    new.imputacion_odoo_id := nueva;
  end if;
  return new;
end $$;
revoke all on function chambapp_private.sincronizar_imputacion_odoo() from public, anon, authenticated;
create trigger sincronizar_imputacion_odoo before insert or update on public.partes_horas
  for each row execute function chambapp_private.sincronizar_imputacion_odoo();

-- Removes an imputation once no entry (active or tombstone) refers to it.
create function chambapp_private.limpiar_imputacion_odoo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.imputacion_odoo_id is not null and
     (tg_op = 'DELETE' or new.imputacion_odoo_id is distinct from old.imputacion_odoo_id) then
    delete from public.imputaciones_odoo i where i.id = old.imputacion_odoo_id
      and not exists(select 1 from public.partes_horas h where h.imputacion_odoo_id = i.id);
  end if;
  return null;
end $$;
revoke all on function chambapp_private.limpiar_imputacion_odoo() from public, anon, authenticated;
-- Not "update of imputacion_odoo_id": the legacy path changes it inside the BEFORE
-- trigger, which column-specific triggers do not see.
create trigger limpiar_imputacion_odoo after update or delete on public.partes_horas
  for each row execute function chambapp_private.limpiar_imputacion_odoo();

-- RPC -------------------------------------------------------------------------
create function chambapp_private.imputaciones(p_accion text, p_datos jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid();
  n integer;
  ids uuid[];
  grupos integer;
  fila public.imputaciones_odoo;
  partes jsonb;
begin
  perform chambapp_private.bloquear_perfil(u);
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then raise exception 'DATOS_INVALIDOS'; end if;

  if p_accion = 'imputar_partes' then
    if jsonb_typeof(p_datos->'partes') is distinct from 'array' then
      raise exception 'IMPUTACION_DATOS_INVALIDOS'; end if;
    n := jsonb_array_length(p_datos->'partes');
    if n < 1 or n > 1000 or exists(
      select 1 from jsonb_array_elements(p_datos->'partes') e
      where jsonb_typeof(e) <> 'object' or not chambapp_private.es_uuid(e->'id') or
        jsonb_typeof(e->'version') is distinct from 'number' or
        (e->>'version') !~ '^[1-9][0-9]{0,17}$') then
      raise exception 'IMPUTACION_DATOS_INVALIDOS'; end if;
    select array_agg(distinct (e->>'id')::uuid) into ids from jsonb_array_elements(p_datos->'partes') e;
    if cardinality(ids) <> n then raise exception 'IMPUTACION_DATOS_INVALIDOS'; end if;

    -- One lock order (by id) for concurrent requests on the same entries.
    perform 1 from public.partes_horas h where h.usuario_id = u and h.id = any(ids) order by h.id for update;
    if (select count(*) from public.partes_horas h
        where h.usuario_id = u and h.id = any(ids) and h.eliminado_en is null) <> n then
      raise exception 'PARTE_NO_DISPONIBLE'; end if;
    if exists(select 1 from jsonb_array_elements(p_datos->'partes') e
        join public.partes_horas h on h.id = (e->>'id')::uuid
        where h.version <> (e->>'version')::bigint) then
      raise exception 'CONFLICTO_VERSION'; end if;
    if exists(select 1 from public.partes_horas h where h.id = any(ids) and h.fin_en is null) then
      raise exception 'PARTE_EN_CURSO'; end if;
    if exists(select 1 from public.partes_horas h where h.id = any(ids) and h.imputacion_odoo_id is not null) then
      raise exception 'PARTE_YA_IMPUTADO'; end if;
    select count(distinct (h.tarea_id, h.jornada_id)) into grupos
      from public.partes_horas h where h.id = any(ids);
    if grupos <> 1 then raise exception 'PARTES_DE_DISTINTO_GRUPO'; end if;

    insert into public.imputaciones_odoo(usuario_id, tarea_id, jornada_id)
      select u, h.tarea_id, h.jornada_id from public.partes_horas h where h.id = ids[1]
      returning * into fila;
    update public.partes_horas set imputacion_odoo_id = fila.id where id = any(ids);
    select jsonb_agg(jsonb_build_object('id', h.id, 'version', h.version,
        'imputacion_odoo_id', h.imputacion_odoo_id, 'imputado_en_odoo', h.imputado_en_odoo)
        order by h.inicio_en, h.id) into partes
      from public.partes_horas h where h.id = any(ids);
    return jsonb_build_object('id', fila.id, 'tarea_id', fila.tarea_id, 'jornada_id', fila.jornada_id,
      'estado', fila.estado, 'partes', partes);
  end if;

  if p_accion = 'deshacer_imputacion' then
    if not chambapp_private.es_uuid(p_datos->'id') then raise exception 'IMPUTACION_DATOS_INVALIDOS'; end if;
    select * into fila from public.imputaciones_odoo
      where id = (p_datos->>'id')::uuid and usuario_id = u for update;
    if not found then raise exception 'IMPUTACION_NO_DISPONIBLE'; end if;
    -- Tombstones keep their reference (they cannot be updated); the cleanup trigger
    -- removes the imputation once nothing refers to it.
    with liberados as (
      update public.partes_horas set imputacion_odoo_id = null
        where usuario_id = u and imputacion_odoo_id = fila.id and eliminado_en is null
        returning id, version, inicio_en, imputacion_odoo_id, imputado_en_odoo)
    select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'version', l.version,
        'imputacion_odoo_id', l.imputacion_odoo_id, 'imputado_en_odoo', l.imputado_en_odoo)
        order by l.inicio_en, l.id), '[]'::jsonb) into partes from liberados l;
    return jsonb_build_object('id', fila.id, 'partes', partes);
  end if;

  raise exception 'ACCION_NO_ADMITIDA';
end;
$$;
revoke all on function chambapp_private.imputaciones(text,jsonb) from public, anon, authenticated;
grant execute on function chambapp_private.imputaciones(text,jsonb) to authenticated;
create function public.chambapp_imputaciones(p_accion text, p_datos jsonb default '{}')
returns jsonb language sql security invoker set search_path = '' as $$
  select chambapp_private.imputaciones(p_accion, p_datos);
$$;
revoke all on function public.chambapp_imputaciones(text,jsonb) from public, anon, authenticated;
grant execute on function public.chambapp_imputaciones(text,jsonb) to authenticated;

-- Detail view: same columns and order as before, imputacion_odoo_id appended at the end.
create or replace view public.partes_detalle with (security_invoker = true) as
select h.id, h.usuario_id, h.jornada_id, h.tarea_id, h.inicio_en, h.fin_en,
  h.intervalo_redondeo_minutos, h.modo_redondeo, h.descripcion, h.eliminado_en,
  h.creado_en, h.actualizado_en, h.version,
  t.proyecto_id, j.fecha, j.zona_horaria,
  h.inicio_en as inicio_imputado_en, h.fin_en as fin_imputado_en,
  extract(epoch from h.fin_en - h.inicio_en) as duracion_real_segundos,
  chambapp_private.redondear_duracion_superior(
    extract(epoch from h.fin_en - h.inicio_en), h.intervalo_redondeo_minutos::integer)
    as duracion_imputada_segundos, t.odoo_id, t.odoo_url, h.imputado_en_odoo,
  h.imputacion_odoo_id
from public.partes_horas h join public.tareas t on t.id = h.tarea_id
join public.jornadas j on j.id = h.jornada_id
where h.eliminado_en is null and t.eliminado_en is null;
comment on column public.partes_detalle.imputacion_odoo_id is
  'Odoo imputation of the entry; entries sharing it are logged together with their summed real time rounded once.';

notify pgrst, 'reload schema';
commit;
