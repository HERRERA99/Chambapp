begin;

create table public.ausencias (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references public.perfiles(id) on delete cascade,
  titulo text not null check (length(btrim(titulo)) between 1 and 200),
  tipo text not null check (tipo in ('festivo','vacaciones')),
  inicio date not null,
  fin date not null check (fin >= inicio),
  fuente text not null default 'manual' check (fuente in ('manual','nager')),
  ambito text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  version bigint not null default 1,
  check (fuente = 'manual' or (tipo = 'festivo' and inicio = fin and ambito is not null)),
  unique (usuario_id, ambito, inicio)
);
create index ausencias_usuario_fechas on public.ausencias(usuario_id, inicio, fin);
alter table public.ausencias enable row level security;
create policy ausencias_propias on public.ausencias to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
revoke all on public.ausencias from public, anon, authenticated;
grant select, insert, update, delete on public.ausencias to authenticated;

create function public.actualizar_version_ausencia() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.id := old.id;
  new.usuario_id := old.usuario_id;
  new.creado_en := old.creado_en;
  new.version := old.version + 1;
  new.actualizado_en := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.actualizar_version_ausencia() from public, anon, authenticated;
create trigger ausencias_version before update on public.ausencias
  for each row execute function public.actualizar_version_ausencia();

create function public.chambapp_calendario(p_accion text, p_datos jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  u uuid := auth.uid();
  fila public.ausencias;
  dato jsonb;
  alcance text;
  anio integer;
  cantidad integer := 0;
begin
  if u is null then raise exception 'SESION_REQUERIDA' using errcode = '42501'; end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then raise exception 'DATOS_INVALIDOS'; end if;
  -- Serializes imports and manual edits for the same account without privileged access.
  perform pg_advisory_xact_lock(hashtextextended(u::text, 0));
  if p_accion = 'guardar_ausencia' then
    if p_datos ? 'version' then
      select * into fila from public.ausencias where id = (p_datos->>'id')::uuid and usuario_id = u for update;
      if not found then raise exception 'Ausencia no disponible'; end if;
      if fila.version is distinct from (p_datos->>'version')::bigint then raise exception 'CONFLICTO_VERSION'; end if;
      update public.ausencias set titulo = btrim(p_datos->>'titulo'), tipo = p_datos->>'tipo',
        inicio = (p_datos->>'inicio')::date, fin = (p_datos->>'fin')::date,
        fuente = 'manual', ambito = null where id = fila.id returning * into fila;
    else
      insert into public.ausencias(id, usuario_id, titulo, tipo, inicio, fin)
      values ((p_datos->>'id')::uuid, u, btrim(p_datos->>'titulo'), p_datos->>'tipo',
        (p_datos->>'inicio')::date, (p_datos->>'fin')::date)
      on conflict (id) do nothing returning * into fila;
      if fila.id is null then
        select * into fila from public.ausencias where id = (p_datos->>'id')::uuid and usuario_id = u;
        if not found or fila.titulo is distinct from btrim(p_datos->>'titulo') or
          fila.tipo is distinct from p_datos->>'tipo' or fila.inicio is distinct from (p_datos->>'inicio')::date or
          fila.fin is distinct from (p_datos->>'fin')::date then raise exception 'OPERACION_ID_REUTILIZADO'; end if;
      end if;
    end if;
    return to_jsonb(fila);
  elsif p_accion = 'eliminar_ausencia' then
    delete from public.ausencias where id = (p_datos->>'id')::uuid and usuario_id = u
      and version = (p_datos->>'version')::bigint returning * into fila;
    if not found then raise exception 'CONFLICTO_VERSION'; end if;
    return to_jsonb(fila);
  elsif p_accion = 'sincronizar_festivos' then
    alcance := p_datos->>'ambito';
    anio := (p_datos->>'anio')::integer;
    if alcance is null or alcance !~ '^[A-Z]{2}(:[A-Z0-9-]{1,12})?$' or anio is null or anio not between 1900 and 2100 or
      jsonb_typeof(p_datos->'festivos') is distinct from 'array' then raise exception 'DATOS_INVALIDOS'; end if;
    if jsonb_array_length(p_datos->'festivos') > 100 then raise exception 'DATOS_INVALIDOS'; end if;
    for dato in select value from jsonb_array_elements(p_datos->'festivos') loop
      if extract(year from (dato->>'fecha')::date) is distinct from anio then raise exception 'DATOS_INVALIDOS'; end if;
      insert into public.ausencias(usuario_id, titulo, tipo, inicio, fin, fuente, ambito)
      values (u, btrim(dato->>'titulo'), 'festivo', (dato->>'fecha')::date, (dato->>'fecha')::date, 'nager', alcance)
      on conflict (usuario_id, ambito, inicio) do update set titulo = excluded.titulo;
      cantidad := cantidad + 1;
    end loop;
    return jsonb_build_object('sincronizados', cantidad);
  end if;
  raise exception 'ACCION_NO_ADMITIDA';
end;
$$;
revoke all on function public.chambapp_calendario(text,jsonb) from public, anon, authenticated;
grant execute on function public.chambapp_calendario(text,jsonb) to authenticated;

-- Preserve original day targets: deleting an absence restores the saved schedule,
-- even for days generated before the holiday was added.
create or replace view public.resumen_jornadas with (security_invoker = true) as
select j.id as jornada_id, j.usuario_id, j.fecha, j.zona_horaria,
  case when exists(select 1 from public.ausencias a where a.usuario_id = j.usuario_id and j.fecha between a.inicio and a.fin)
    then 0 else j.minutos_objetivo end as minutos_objetivo,
  coalesce(sum(d.duracion_real_segundos),0) as segundos_reales,
  coalesce(sum(d.duracion_imputada_segundos),0) as segundos_imputados,
  coalesce(sum(d.duracion_imputada_segundos),0) - (case when exists(
    select 1 from public.ausencias a where a.usuario_id = j.usuario_id and j.fecha between a.inicio and a.fin)
    then 0 else j.minutos_objetivo end) * 60 as saldo_segundos,
  count(d.id) filter(where d.fin_en is null) as partes_en_curso
from public.jornadas j left join public.partes_detalle d on d.jornada_id = j.id group by j.id;

commit;
