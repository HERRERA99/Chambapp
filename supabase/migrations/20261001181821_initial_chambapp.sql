-- Chambapp initial schema: docs v1 -> v2 -> v3 (v3 takes precedence).
-- Apply to a new Supabase PostgreSQL database. No destructive reset of existing data.
begin;

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
create schema chambapp_private;
revoke all on schema chambapp_private from public, anon, authenticated;
grant usage on schema chambapp_private to authenticated;

create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null default 'Usuario' check (length(btrim(nombre)) between 1 and 200),
  zona_horaria text not null default 'Europe/Madrid',
  intervalo_redondeo_minutos smallint not null default 15 check (intervalo_redondeo_minutos in (5,10,15)),
  modo_redondeo text not null default 'superior' check (modo_redondeo = 'superior'),
  creado_en timestamptz not null default clock_timestamp(),
  actualizado_en timestamptz not null default clock_timestamp(),
  version bigint not null default 1 check (version > 0)
);
create table public.proyectos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles(id),
  nombre text not null check (length(btrim(nombre)) between 1 and 200),
  descripcion text,
  archivado_en timestamptz,
  eliminado_en timestamptz,
  creado_en timestamptz not null default clock_timestamp(),
  actualizado_en timestamptz not null default clock_timestamp(),
  version bigint not null default 1 check (version > 0),
  unique(id, usuario_id)
);
create table public.tareas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles(id),
  proyecto_id uuid not null,
  titulo text not null check (length(btrim(titulo)) between 1 and 300),
  descripcion text,
  estado text not null default 'pendiente' check (estado in ('pendiente','en_curso','completada')),
  estimacion_minutos integer check (estimacion_minutos >= 0),
  archivado_en timestamptz,
  eliminado_en timestamptz,
  creado_en timestamptz not null default clock_timestamp(),
  actualizado_en timestamptz not null default clock_timestamp(),
  version bigint not null default 1 check (version > 0),
  unique(id, usuario_id),
  foreign key (proyecto_id, usuario_id) references public.proyectos(id, usuario_id)
);
create table public.configuraciones_semanales (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles(id),
  minutos_semanales integer not null check (minutos_semanales > 0),
  vigente_desde date not null check (extract(isodow from vigente_desde) = 1),
  creado_en timestamptz not null default clock_timestamp(),
  unique(usuario_id, vigente_desde),
  unique(id, usuario_id)
);
create table public.dias_configuracion_semanal (
  configuracion_id uuid not null references public.configuraciones_semanales(id),
  dia_semana smallint not null check (dia_semana between 1 and 7),
  minutos_objetivo integer not null check (minutos_objetivo > 0),
  primary key(configuracion_id, dia_semana)
);
create table public.jornadas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles(id),
  fecha date not null,
  zona_horaria text not null,
  configuracion_id uuid,
  minutos_objetivo integer not null default 0 check (minutos_objetivo >= 0),
  notas text,
  creado_en timestamptz not null default clock_timestamp(),
  actualizado_en timestamptz not null default clock_timestamp(),
  version bigint not null default 1 check (version > 0),
  unique(usuario_id, fecha),
  unique(id, usuario_id),
  foreign key(configuracion_id, usuario_id) references public.configuraciones_semanales(id, usuario_id)
);
create table public.partes_horas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles(id),
  jornada_id uuid not null,
  tarea_id uuid not null,
  inicio_en timestamptz not null check (isfinite(inicio_en)),
  fin_en timestamptz check (isfinite(fin_en) and fin_en > inicio_en),
  intervalo_redondeo_minutos smallint not null check (intervalo_redondeo_minutos in (5,10,15)),
  modo_redondeo text not null default 'superior' check (modo_redondeo = 'superior'),
  descripcion text,
  eliminado_en timestamptz,
  creado_en timestamptz not null default clock_timestamp(),
  actualizado_en timestamptz not null default clock_timestamp(),
  version bigint not null default 1 check (version > 0),
  unique(id, usuario_id),
  foreign key(jornada_id, usuario_id) references public.jornadas(id, usuario_id),
  foreign key(tarea_id, usuario_id) references public.tareas(id, usuario_id),
  exclude using gist (
    usuario_id extensions.gist_uuid_ops with =,
    tstzrange(inicio_en, fin_en, '[)') with &&
  ) where (eliminado_en is null)
);
create unique index un_cronometro_por_usuario on public.partes_horas(usuario_id)
  where fin_en is null and eliminado_en is null;
create table chambapp_private.operaciones_cronometro (
  usuario_id uuid not null references public.perfiles(id),
  id uuid not null,
  tipo text not null check (tipo in ('iniciar','detener')),
  parametros jsonb not null,
  parte_id uuid,
  resultado jsonb not null,
  creado_en timestamptz not null default clock_timestamp(),
  primary key(usuario_id, id),
  foreign key(parte_id, usuario_id) references public.partes_horas(id, usuario_id)
);

create index proyectos_usuario on public.proyectos(usuario_id);
create index tareas_proyecto_usuario on public.tareas(proyecto_id, usuario_id);
create index tareas_usuario on public.tareas(usuario_id);
create index configuraciones_usuario_vigencia on public.configuraciones_semanales(usuario_id, vigente_desde desc);
create index jornadas_configuracion_usuario on public.jornadas(configuracion_id, usuario_id);
create index partes_tarea_usuario on public.partes_horas(tarea_id, usuario_id);
create index partes_jornada_usuario on public.partes_horas(jornada_id, usuario_id);
create index operaciones_parte_usuario on chambapp_private.operaciones_cronometro(parte_id, usuario_id);

-- RLS for reads. Clients write exclusively through the authenticated transactional RPC.
do $$
declare t text;
begin
  foreach t in array array['perfiles','proyectos','tareas','configuraciones_semanales','jornadas','partes_horas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy lectura_propia on public.%I for select to authenticated using ((select auth.uid()) = %I)',
      t, case when t = 'perfiles' then 'id' else 'usuario_id' end);
  end loop;
end $$;
alter table public.dias_configuracion_semanal enable row level security;
revoke all on public.dias_configuracion_semanal from public, anon, authenticated;
grant select on public.dias_configuracion_semanal to authenticated;
create policy lectura_propia on public.dias_configuracion_semanal for select to authenticated using (
  exists(select 1 from public.configuraciones_semanales c
    where c.id = configuracion_id and c.usuario_id = (select auth.uid()))
);
alter table chambapp_private.operaciones_cronometro enable row level security;
revoke all on chambapp_private.operaciones_cronometro from public, anon, authenticated;

-- Guard ownership, versioning, history and timezone validity even for privileged writes.
create function chambapp_private.validar_fila() returns trigger
language plpgsql set search_path = '' as $$
declare u uuid; zona text; padre record;
begin
  if tg_table_name = 'perfiles' then u := new.id; else u := new.usuario_id; end if;
  perform 1 from public.perfiles where id = u for update;
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.creado_en <> old.creado_en then raise exception 'IDENTIDAD_INMUTABLE'; end if;
    if tg_table_name <> 'perfiles' then
      if new.usuario_id <> old.usuario_id then raise exception 'IDENTIDAD_INMUTABLE'; end if;
    end if;
    new.version := old.version + 1;
    new.actualizado_en := clock_timestamp();
    if tg_table_name in ('proyectos','tareas','partes_horas') then
      if old.eliminado_en is not null then raise exception 'REGISTRO_ELIMINADO'; end if;
    end if;
  else
    new.version := 1;
    new.creado_en := clock_timestamp(); new.actualizado_en := new.creado_en;
  end if;
  if tg_table_name in ('perfiles','jornadas') then
    if not exists(select 1 from pg_catalog.pg_timezone_names where name = new.zona_horaria) then
      raise exception 'ZONA_HORARIA_INVALIDA'; end if;
  end if;
  if tg_table_name = 'jornadas' and tg_op = 'UPDATE' then
    if new.fecha <> old.fecha or new.zona_horaria <> old.zona_horaria or
       new.configuracion_id is distinct from old.configuracion_id then
      raise exception 'HISTORIAL_JORNADA_INMUTABLE'; end if;
  end if;
  if tg_table_name = 'tareas' then
    select p.* into padre from public.proyectos p where p.id = new.proyecto_id and p.usuario_id = u;
    if not found then raise exception 'PROYECTO_NO_DISPONIBLE'; end if;
    if new.eliminado_en is null and (padre.eliminado_en is not null or
       (padre.archivado_en is not null and (tg_op = 'INSERT' or new.proyecto_id <> old.proyecto_id))) then
      raise exception 'PROYECTO_NO_DISPONIBLE'; end if;
  end if;
  if tg_table_name = 'partes_horas' then
   if new.eliminado_en is null then
    select t.eliminado_en, t.archivado_en, p.eliminado_en as proyecto_eliminado,
      p.archivado_en as proyecto_archivado into padre from public.tareas t
      join public.proyectos p on p.id = t.proyecto_id
      where t.id = new.tarea_id and t.usuario_id = u;
    if not found then raise exception 'TAREA_NO_DISPONIBLE'; end if;
    if padre.eliminado_en is not null or padre.proyecto_eliminado is not null or
       ((tg_op = 'INSERT' or new.tarea_id <> old.tarea_id) and
       (padre.archivado_en is not null or padre.proyecto_archivado is not null)) then
      raise exception 'TAREA_NO_DISPONIBLE'; end if;
    if new.inicio_en > clock_timestamp() or new.fin_en > clock_timestamp() then
      raise exception 'INTERVALO_REAL_FUTURO'; end if;
    if tg_op = 'UPDATE' and old.fin_en is not null and new.fin_en is null then
      raise exception 'NO_REABRIR_PARTE'; end if;
    select j.zona_horaria into zona from public.jornadas j where j.id = new.jornada_id and j.usuario_id = u;
    if not found then raise exception 'JORNADA_NO_DISPONIBLE'; end if;
   end if;
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['perfiles','proyectos','tareas','jornadas','partes_horas'] loop
    execute format('create trigger validar_fila before insert or update on public.%I for each row execute function chambapp_private.validar_fila()', t);
  end loop;
end $$;

-- Deferred checks allow atomic cascades and atomic weekly configuration creation.
create function chambapp_private.validar_arbol() returns trigger
language plpgsql set search_path = '' as $$
declare u uuid := new.usuario_id;
begin
  if exists(select 1 from public.tareas t join public.proyectos p on p.id = t.proyecto_id
      where t.usuario_id = u and t.eliminado_en is null and p.eliminado_en is not null) or
     exists(select 1 from public.partes_horas h join public.tareas t on t.id = h.tarea_id
       join public.proyectos p on p.id = t.proyecto_id where h.usuario_id = u and h.eliminado_en is null
       and (t.eliminado_en is not null or p.eliminado_en is not null or
        (h.fin_en is null and (t.archivado_en is not null or p.archivado_en is not null)))) then
    raise exception 'HIJOS_ACTIVOS_EN_PADRE_ELIMINADO_O_ARCHIVADO';
  end if;
  return null;
end $$;
do $$ declare t text;
begin
  foreach t in array array['proyectos','tareas','partes_horas'] loop
    execute format('create constraint trigger validar_arbol after insert or update on public.%I deferrable initially deferred for each row execute function chambapp_private.validar_arbol()', t);
  end loop;
end $$;

create function chambapp_private.validar_configuracion() returns trigger
language plpgsql set search_path = '' as $$
declare cid uuid; total integer; suma bigint;
begin
  if tg_table_name = 'configuraciones_semanales' then cid := new.id;
  else cid := coalesce(new.configuracion_id, old.configuracion_id); end if;
  select minutos_semanales into total from public.configuraciones_semanales where id = cid;
  if found then
    select sum(minutos_objetivo) into suma from public.dias_configuracion_semanal where configuracion_id = cid;
    if suma is null or suma <> total then raise exception 'REPARTO_SEMANAL_INVALIDO'; end if;
  end if;
  return null;
end $$;
create constraint trigger validar_configuracion after insert or update on public.configuraciones_semanales
  deferrable initially deferred for each row execute function chambapp_private.validar_configuracion();
create constraint trigger validar_configuracion after insert or update or delete on public.dias_configuracion_semanal
  deferrable initially deferred for each row execute function chambapp_private.validar_configuracion();

create function chambapp_private.configuracion_inmutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Versions are insert-only, including their days once persisted. Creation is transactional.
  raise exception 'CREAR_NUEVA_VERSION_SEMANAL';
end $$;
create trigger configuracion_inmutable before update or delete on public.configuraciones_semanales
  for each row execute function chambapp_private.configuracion_inmutable();
create trigger configuracion_inmutable before update or delete on public.dias_configuracion_semanal
  for each row execute function chambapp_private.configuracion_inmutable();
create function chambapp_private.validar_dia_nuevo() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform 1 from public.configuraciones_semanales where id = new.configuracion_id for update;
  if exists(select 1 from public.jornadas where configuracion_id = new.configuracion_id) then
    raise exception 'CONFIGURACION_YA_UTILIZADA'; end if;
  return new;
end $$;
create trigger validar_dia_nuevo before insert on public.dias_configuracion_semanal
  for each row execute function chambapp_private.validar_dia_nuevo();

-- Auth trigger: system event, not a user RPC. User metadata is display data only.
create function chambapp_private.crear_perfil_auth() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles(id, nombre) values(new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''), 'Usuario'), 200));
  return new;
end $$;
create trigger chambapp_crear_perfil after insert on auth.users
  for each row execute function chambapp_private.crear_perfil_auth();
insert into public.perfiles(id, nombre)
  select id, left(coalesce(nullif(btrim(raw_user_meta_data ->> 'nombre'), ''), 'Usuario'), 200)
  from auth.users on conflict(id) do nothing;

-- Clock-grid ceiling on the UTC timeline, inspecting local boundaries. This handles
-- repeated/skipped DST hours without choosing the wrong occurrence of a local hour.
create function chambapp_private.redondear_superior(p_instante timestamptz, p_intervalo integer, p_zona text)
returns timestamptz language plpgsql stable strict set search_path = '' as $$
declare candidato timestamptz; base timestamptz; local_hora timestamp; i integer;
begin
  if p_intervalo not in (5,10,15) or not isfinite(p_instante) then raise exception 'REDONDEO_INVALIDO'; end if;
  -- Subtract the local seconds: also supports historical UTC offsets with seconds.
  base := p_instante - extract(second from p_instante at time zone p_zona) * interval '1 second';
  for i in 0..180 loop
    candidato := base + i * interval '1 minute';
    local_hora := candidato at time zone p_zona;
    if candidato >= p_instante and extract(second from local_hora) = 0 and
       mod(extract(minute from local_hora)::integer, p_intervalo) = 0 then return candidato; end if;
  end loop;
  raise exception 'LIMITE_HORARIO_NO_ENCONTRADO';
end $$;

create view public.partes_detalle with (security_invoker = true) as
select h.*, t.proyecto_id, j.fecha, j.zona_horaria,
  r.inicio_imputado_en, r.fin_imputado_en,
  extract(epoch from h.fin_en - h.inicio_en) as duracion_real_segundos,
  extract(epoch from r.fin_imputado_en - r.inicio_imputado_en) as duracion_imputada_segundos
from public.partes_horas h join public.tareas t on t.id = h.tarea_id
join public.jornadas j on j.id = h.jornada_id
cross join lateral (select
  chambapp_private.redondear_superior(h.inicio_en, h.intervalo_redondeo_minutos, j.zona_horaria) as inicio_imputado_en,
  chambapp_private.redondear_superior(h.fin_en, h.intervalo_redondeo_minutos, j.zona_horaria) as fin_imputado_en) r
where h.eliminado_en is null and t.eliminado_en is null;
create view public.resumen_jornadas with (security_invoker = true) as
select j.id as jornada_id, j.usuario_id, j.fecha, j.zona_horaria, j.minutos_objetivo,
  coalesce(sum(d.duracion_real_segundos),0) as segundos_reales,
  coalesce(sum(d.duracion_imputada_segundos),0) as segundos_imputados,
  coalesce(sum(d.duracion_imputada_segundos),0) - j.minutos_objetivo * 60 as saldo_segundos,
  count(d.id) filter(where d.fin_en is null) as partes_en_curso
from public.jornadas j left join public.partes_detalle d on d.jornada_id = j.id group by j.id;
create view public.resumen_tareas with (security_invoker = true) as
select t.id as tarea_id, t.usuario_id, t.proyecto_id,
  coalesce(sum(d.duracion_real_segundos),0) as segundos_reales,
  coalesce(sum(d.duracion_imputada_segundos),0) as segundos_imputados
from public.tareas t left join public.partes_detalle d on d.tarea_id = t.id
where t.eliminado_en is null group by t.id;
create view public.resumen_proyectos with (security_invoker = true) as
select p.id as proyecto_id, p.usuario_id,
  coalesce(sum(t.segundos_reales),0) as segundos_reales,
  coalesce(sum(t.segundos_imputados),0) as segundos_imputados
from public.proyectos p left join public.resumen_tareas t on t.proyecto_id = p.id
where p.eliminado_en is null group by p.id;
create view public.resumen_semanas with (security_invoker = true) as
select usuario_id, fecha - (extract(isodow from fecha)::integer - 1) as lunes,
  sum(minutos_objetivo) as minutos_objetivo, sum(segundos_reales) as segundos_reales,
  sum(segundos_imputados) as segundos_imputados, sum(saldo_segundos) as saldo_segundos
from public.resumen_jornadas group by usuario_id, fecha - (extract(isodow from fecha)::integer - 1);
revoke all on public.partes_detalle, public.resumen_jornadas, public.resumen_tareas,
  public.resumen_proyectos, public.resumen_semanas from public, anon, authenticated;
grant select on public.partes_detalle, public.resumen_jornadas, public.resumen_tareas,
  public.resumen_proyectos, public.resumen_semanas to authenticated;

-- Internal helper, callable only by the validated private dispatcher.
create function chambapp_private.obtener_jornada(p_usuario uuid, p_fecha date, p_zona text)
returns public.jornadas language plpgsql set search_path = '' as $$
declare j public.jornadas; cid uuid; objetivo integer;
begin
  select * into j from public.jornadas where usuario_id = p_usuario and fecha = p_fecha;
  if found then return j; end if;
  select id into cid from public.configuraciones_semanales where usuario_id = p_usuario
    and vigente_desde <= p_fecha - (extract(isodow from p_fecha)::integer - 1)
    order by vigente_desde desc limit 1;
  select minutos_objetivo into objetivo from public.dias_configuracion_semanal
    where configuracion_id = cid and dia_semana = extract(isodow from p_fecha);
  insert into public.jornadas(usuario_id, fecha, zona_horaria, configuracion_id, minutos_objetivo)
    values(p_usuario, p_fecha, p_zona, cid, coalesce(objetivo,0)) returning * into j;
  return j;
end $$;

-- Continued below: a single private write boundary with public SECURITY INVOKER wrapper.
create function chambapp_private.operar(p_accion text, p_datos jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid(); perfil public.perfiles; proyecto public.proyectos; tarea public.tareas;
  parte public.partes_horas; jornada public.jornadas; configuracion public.configuraciones_semanales;
  op chambapp_private.operaciones_cronometro; oid uuid; entidad uuid;
  respuesta jsonb; ahora timestamptz; ini timestamptz; fin timestamptz;
  fecha_destino date; zona text; cid uuid; dias integer[]; dia integer; pos integer;
  n integer; minutos integer; objetivo integer; esperado bigint; descartado boolean;
begin
  if u is null then raise exception 'SESION_REQUERIDA' using errcode = '42501'; end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then raise exception 'DATOS_INVALIDOS'; end if;
  -- One lock order for every write. It also blocks deletion/start and stop/edit races.
  select * into perfil from public.perfiles where id = u for update;
  if not found then raise exception 'PERFIL_NO_DISPONIBLE' using errcode = '42501'; end if;

  if p_accion in ('iniciar','detener') then
    oid := (p_datos ->> 'operacion_id')::uuid;
    if oid is null then raise exception 'OPERACION_ID_REQUERIDO'; end if;
    select * into op from chambapp_private.operaciones_cronometro where usuario_id = u and id = oid;
    if found then
      if op.tipo <> p_accion or op.parametros <> p_datos then raise exception 'OPERACION_ID_REUTILIZADO'; end if;
      return op.resultado;
    end if;
  end if;
  ahora := clock_timestamp();

  case p_accion
  when 'editar_perfil' then
    if (p_datos ->> 'version')::bigint is distinct from perfil.version then
      raise exception 'CONFLICTO_VERSION'; end if;
    update public.perfiles set
      nombre = case when p_datos ? 'nombre' then p_datos ->> 'nombre' else nombre end,
      zona_horaria = case when p_datos ? 'zona_horaria' then p_datos ->> 'zona_horaria' else zona_horaria end,
      intervalo_redondeo_minutos = case when p_datos ? 'intervalo_redondeo_minutos'
        then (p_datos ->> 'intervalo_redondeo_minutos')::smallint else intervalo_redondeo_minutos end
      where id = u returning * into perfil;
    return to_jsonb(perfil);

  when 'crear_proyecto' then
    insert into public.proyectos(usuario_id,nombre,descripcion)
      values(u,p_datos ->> 'nombre',p_datos ->> 'descripcion') returning * into proyecto;
    return to_jsonb(proyecto);
  when 'editar_proyecto' then
    select * into proyecto from public.proyectos where id = (p_datos ->> 'id')::uuid and usuario_id = u;
    if not found or proyecto.eliminado_en is not null then raise exception 'PROYECTO_NO_DISPONIBLE'; end if;
    if (p_datos ->> 'version')::bigint is distinct from proyecto.version then raise exception 'CONFLICTO_VERSION'; end if;
    update public.proyectos set
      nombre = case when p_datos ? 'nombre' then p_datos ->> 'nombre' else nombre end,
      descripcion = case when p_datos ? 'descripcion' then p_datos ->> 'descripcion' else descripcion end,
      archivado_en = case when p_datos ? 'archivado' then case when (p_datos ->> 'archivado')::boolean
        then coalesce(archivado_en,ahora) else null end else archivado_en end
      where id = proyecto.id returning * into proyecto;
    return to_jsonb(proyecto);

  when 'crear_tarea' then
    insert into public.tareas(usuario_id,proyecto_id,titulo,descripcion,estado,estimacion_minutos)
      values(u,(p_datos ->> 'proyecto_id')::uuid,p_datos ->> 'titulo',p_datos ->> 'descripcion',
        coalesce(p_datos ->> 'estado','pendiente'),(p_datos ->> 'estimacion_minutos')::integer)
      returning * into tarea;
    return to_jsonb(tarea);
  when 'editar_tarea' then
    select * into tarea from public.tareas where id = (p_datos ->> 'id')::uuid and usuario_id = u;
    if not found or tarea.eliminado_en is not null then raise exception 'TAREA_NO_DISPONIBLE'; end if;
    if (p_datos ->> 'version')::bigint is distinct from tarea.version then raise exception 'CONFLICTO_VERSION'; end if;
    update public.tareas set
      titulo = case when p_datos ? 'titulo' then p_datos ->> 'titulo' else titulo end,
      descripcion = case when p_datos ? 'descripcion' then p_datos ->> 'descripcion' else descripcion end,
      estado = case when p_datos ? 'estado' then p_datos ->> 'estado' else estado end,
      estimacion_minutos = case when p_datos ? 'estimacion_minutos' then (p_datos ->> 'estimacion_minutos')::integer else estimacion_minutos end,
      proyecto_id = case when p_datos ? 'proyecto_id' then (p_datos ->> 'proyecto_id')::uuid else proyecto_id end,
      archivado_en = case when p_datos ? 'archivado' then case when (p_datos ->> 'archivado')::boolean
        then coalesce(archivado_en,ahora) else null end else archivado_en end
      where id = tarea.id returning * into tarea;
    return to_jsonb(tarea);

  when 'crear_configuracion_semanal' then
    minutos := (p_datos ->> 'minutos_semanales')::integer;
    select array_agg(value::integer order by value::integer) into dias
      from jsonb_array_elements_text(p_datos -> 'dias');
    n := coalesce(cardinality(dias),0);
    if n < 1 or n > 7 or exists(select 1 from unnest(dias) d where d not between 1 and 7)
      or (select count(distinct d) from unnest(dias) d) <> n then raise exception 'DIAS_INVALIDOS'; end if;
    if minutos is null or minutos < n then raise exception 'TOTAL_SEMANAL_INVALIDO'; end if;
    insert into public.configuraciones_semanales(usuario_id,minutos_semanales,vigente_desde)
      values(u,minutos,(p_datos ->> 'vigente_desde')::date) returning * into configuracion;
    pos := 0;
    foreach dia in array dias loop
      pos := pos + 1;
      if p_datos ? 'reparto' then
        objetivo := (p_datos -> 'reparto' ->> dia::text)::integer;
      else objetivo := minutos / n + case when pos <= mod(minutos,n) then 1 else 0 end; end if;
      insert into public.dias_configuracion_semanal values(configuracion.id,dia,objetivo);
    end loop;
    -- Immediate validation gives a useful RPC error, independent of deferred constraints.
    if (select sum(minutos_objetivo) from public.dias_configuracion_semanal
        where configuracion_id = configuracion.id) <> minutos then raise exception 'REPARTO_SEMANAL_INVALIDO'; end if;
    return to_jsonb(configuracion);

  when 'generar_semana' then
    fecha_destino := (p_datos ->> 'lunes')::date;
    if fecha_destino is null or extract(isodow from fecha_destino) <> 1 then raise exception 'LUNES_REQUERIDO'; end if;
    select id into cid from public.configuraciones_semanales where usuario_id = u and vigente_desde <= fecha_destino
      order by vigente_desde desc limit 1;
    if cid is null then raise exception 'CONFIGURACION_SEMANAL_REQUERIDA'; end if;
    for dia in select dia_semana from public.dias_configuracion_semanal where configuracion_id = cid loop
      perform chambapp_private.obtener_jornada(u,fecha_destino + dia - 1,perfil.zona_horaria);
    end loop;
    return jsonb_build_object('jornadas', (select jsonb_agg(to_jsonb(j) order by j.fecha) from public.jornadas j
      where j.usuario_id = u and j.fecha between fecha_destino and fecha_destino + 6));

  when 'editar_jornada' then
    select * into jornada from public.jornadas where id = (p_datos ->> 'id')::uuid and usuario_id = u;
    if not found then raise exception 'JORNADA_NO_DISPONIBLE'; end if;
    if (p_datos ->> 'version')::bigint is distinct from jornada.version then raise exception 'CONFLICTO_VERSION'; end if;
    update public.jornadas set
      minutos_objetivo = case when p_datos ? 'minutos_objetivo' then (p_datos ->> 'minutos_objetivo')::integer else minutos_objetivo end,
      notas = case when p_datos ? 'notas' then p_datos ->> 'notas' else notas end
      where id = jornada.id returning * into jornada;
    return to_jsonb(jornada);

  when 'iniciar' then
    select * into parte from public.partes_horas where usuario_id = u and fin_en is null and eliminado_en is null;
    if found then
      respuesta := jsonb_build_object('ok',false,'codigo','CRONOMETRO_ACTIVO','parte',to_jsonb(parte));
    else
      jornada := chambapp_private.obtener_jornada(u,(ahora at time zone perfil.zona_horaria)::date,perfil.zona_horaria);
      insert into public.partes_horas(usuario_id,jornada_id,tarea_id,inicio_en,intervalo_redondeo_minutos,descripcion)
        values(u,jornada.id,(p_datos ->> 'tarea_id')::uuid,ahora,perfil.intervalo_redondeo_minutos,p_datos ->> 'descripcion')
        returning * into parte;
      respuesta := jsonb_build_object('ok',true,'parte',to_jsonb(parte),'hora_servidor',ahora);
    end if;

  when 'detener' then
    select * into parte from public.partes_horas where id = (p_datos ->> 'parte_id')::uuid and usuario_id = u;
    if not found then raise exception 'PARTE_NO_DISPONIBLE'; end if;
    if parte.eliminado_en is not null then
      respuesta := jsonb_build_object('ok',false,'codigo','PARTE_ELIMINADO','parte',to_jsonb(parte));
    else
      if parte.fin_en is null then
        update public.partes_horas set fin_en = greatest(ahora,inicio_en + interval '1 microsecond')
          where id = parte.id returning * into parte;
      end if;
      respuesta := jsonb_build_object('ok',true,'parte',to_jsonb(parte),'hora_servidor',ahora);
    end if;

  when 'crear_parte' then
    ini := (p_datos ->> 'inicio_en')::timestamptz; fin := (p_datos ->> 'fin_en')::timestamptz;
    if ini is null or fin is null then raise exception 'INTERVALO_COMPLETO_REQUERIDO'; end if;
    jornada := chambapp_private.obtener_jornada(u,(ini at time zone perfil.zona_horaria)::date,perfil.zona_horaria);
    insert into public.partes_horas(usuario_id,jornada_id,tarea_id,inicio_en,fin_en,intervalo_redondeo_minutos,descripcion)
      values(u,jornada.id,(p_datos ->> 'tarea_id')::uuid,ini,fin,perfil.intervalo_redondeo_minutos,p_datos ->> 'descripcion')
      returning * into parte;
    return to_jsonb(parte);

  when 'editar_parte' then
    select * into parte from public.partes_horas where id = (p_datos ->> 'id')::uuid and usuario_id = u;
    if not found or parte.eliminado_en is not null then raise exception 'PARTE_NO_DISPONIBLE'; end if;
    if (p_datos ->> 'version')::bigint is distinct from parte.version then raise exception 'CONFLICTO_VERSION'; end if;
    ini := case when p_datos ? 'inicio_en' then (p_datos ->> 'inicio_en')::timestamptz else parte.inicio_en end;
    fin := case when p_datos ? 'fin_en' then (p_datos ->> 'fin_en')::timestamptz else parte.fin_en end;
    select * into jornada from public.jornadas where id = parte.jornada_id;
    zona := jornada.zona_horaria;
    fecha_destino := (ini at time zone zona)::date;
    if fecha_destino <> jornada.fecha then
      jornada := chambapp_private.obtener_jornada(u,fecha_destino,zona);
      if jornada.zona_horaria <> zona and coalesce(p_datos ->> 'confirmar_zona','') <> jornada.zona_horaria then
        raise exception 'CONFIRMAR_CAMBIO_ZONA:%', jornada.zona_horaria; end if;
    end if;
    update public.partes_horas set inicio_en = ini, fin_en = fin, jornada_id = jornada.id,
      tarea_id = case when p_datos ? 'tarea_id' then (p_datos ->> 'tarea_id')::uuid else tarea_id end,
      descripcion = case when p_datos ? 'descripcion' then p_datos ->> 'descripcion' else descripcion end
      where id = parte.id returning * into parte;
    return to_jsonb(parte);

  when 'eliminar_proyecto', 'eliminar_tarea', 'eliminar_parte' then
    entidad := (p_datos ->> 'id')::uuid; esperado := (p_datos ->> 'version')::bigint;
    descartado := coalesce((p_datos ->> 'descartar_activo')::boolean,false);
    if p_accion = 'eliminar_proyecto' then
      select * into proyecto from public.proyectos where id = entidad and usuario_id = u;
      if not found then raise exception 'PROYECTO_NO_DISPONIBLE'; end if;
      if proyecto.eliminado_en is not null then return to_jsonb(proyecto); end if;
      if esperado is distinct from proyecto.version then raise exception 'CONFLICTO_VERSION'; end if;
    elsif p_accion = 'eliminar_tarea' then
      select * into tarea from public.tareas where id = entidad and usuario_id = u;
      if not found then raise exception 'TAREA_NO_DISPONIBLE'; end if;
      if tarea.eliminado_en is not null then return to_jsonb(tarea); end if;
      if esperado is distinct from tarea.version then raise exception 'CONFLICTO_VERSION'; end if;
    else
      select * into parte from public.partes_horas where id = entidad and usuario_id = u;
      if not found then raise exception 'PARTE_NO_DISPONIBLE'; end if;
      if parte.eliminado_en is not null then return to_jsonb(parte); end if;
      if esperado is distinct from parte.version then raise exception 'CONFLICTO_VERSION'; end if;
    end if;
    if p_accion <> 'eliminar_parte' and not coalesce((p_datos ->> 'confirmar_cascada')::boolean,false) then
      raise exception 'CONFIRMACION_CASCADA_REQUERIDA'; end if;
    if not descartado and exists(select 1 from public.partes_horas h join public.tareas t on t.id = h.tarea_id
      where h.usuario_id = u and h.fin_en is null and h.eliminado_en is null and
      ((p_accion = 'eliminar_parte' and h.id = entidad) or (p_accion = 'eliminar_tarea' and t.id = entidad) or
       (p_accion = 'eliminar_proyecto' and t.proyecto_id = entidad))) then raise exception 'DETENER_O_DESCARTAR_ACTIVO'; end if;
    update public.partes_horas h set eliminado_en = ahora where h.usuario_id = u and h.eliminado_en is null and
      ((p_accion = 'eliminar_parte' and h.id = entidad) or (p_accion = 'eliminar_tarea' and h.tarea_id = entidad) or
       (p_accion = 'eliminar_proyecto' and h.tarea_id in (select id from public.tareas where proyecto_id = entidad and usuario_id = u)));
    if p_accion = 'eliminar_parte' then
      select * into parte from public.partes_horas where id = entidad; return to_jsonb(parte);
    end if;
    update public.tareas set eliminado_en = ahora where usuario_id = u and eliminado_en is null and
      ((p_accion = 'eliminar_tarea' and id = entidad) or (p_accion = 'eliminar_proyecto' and proyecto_id = entidad));
    if p_accion = 'eliminar_tarea' then
      select * into tarea from public.tareas where id = entidad; return to_jsonb(tarea);
    end if;
    update public.proyectos set eliminado_en = ahora where id = entidad returning * into proyecto;
    return to_jsonb(proyecto);

  when 'consultar_operacion' then
    select * into op from chambapp_private.operaciones_cronometro
      where usuario_id = u and id = (p_datos ->> 'operacion_id')::uuid;
    if not found then return jsonb_build_object('encontrada',false,'hora_servidor',ahora); end if;
    select * into parte from public.partes_horas where id = op.parte_id and usuario_id = u;
    return jsonb_build_object('encontrada',true,'resultado',op.resultado,'parte_actual',to_jsonb(parte),'hora_servidor',ahora);
  when 'consultar_cronometro' then
    select * into parte from public.partes_horas where usuario_id = u and fin_en is null and eliminado_en is null;
    return jsonb_build_object('parte',case when found then to_jsonb(parte) else null end,'hora_servidor',ahora);
  else raise exception 'ACCION_NO_ADMITIDA';
  end case;

  insert into chambapp_private.operaciones_cronometro(usuario_id,id,tipo,parametros,parte_id,resultado)
    values(u,oid,p_accion,p_datos,parte.id,respuesta);
  return respuesta;
end $$;

-- Public RPC is invoker-only. The private write boundary explicitly authenticates,
-- derives ownership server-side and permits only the actions above; no dynamic SQL.
create function public.chambapp_operar(p_accion text, p_datos jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select chambapp_private.operar(p_accion,p_datos);
$$;
revoke execute on all functions in schema chambapp_private from public, anon, authenticated;
grant execute on function chambapp_private.operar(text,jsonb) to authenticated;
grant execute on function chambapp_private.redondear_superior(timestamptz,integer,text) to authenticated;
revoke execute on function public.chambapp_operar(text,jsonb) from public, anon, authenticated;
grant execute on function public.chambapp_operar(text,jsonb) to authenticated;

comment on function public.chambapp_operar(text,jsonb) is
  'Authenticated transactional write API. See docs/base-de-datos.md for action payloads and retry rules.';
comment on schema chambapp_private is
  'Internal implementation. Keep this schema out of the Supabase Data API exposed schemas.';
notify pgrst, 'reload schema';
commit;
