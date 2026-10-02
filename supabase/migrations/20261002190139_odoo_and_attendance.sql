-- Optional Odoo references and independent attendance sessions.
-- Preserve the existing task timer API, ownership checks and historic time data.
begin;

-- Accept canonical HTTP(S) browser URLs. Validate numeric ports and IP literals;
-- a mere scheme regex would admit links the browser cannot open.
create function chambapp_private.odoo_url_valida(p_url text) returns boolean
language plpgsql immutable strict set search_path = '' as $$
declare autoridad text; host text; puerto text;
begin
  if length(p_url) > 2048 or p_url !~* '^https?://' or p_url ~ '[[:space:][:cntrl:]]' or
     position(chr(92) in p_url) > 0 then return false; end if;
  autoridad := substring(regexp_replace(p_url,'^https?://','','i') from '^[^/?#]+');
  if autoridad is null or position('@' in autoridad) > 0 then return false; end if;
  if left(autoridad,1) = '[' then
    if autoridad !~ '^\[[a-fA-F0-9:.]+\](:[0-9]{1,5})?$' then return false; end if;
    host := substring(autoridad from '^\[([^]]+)\]');
    if family(host::inet) <> 6 then return false; end if;
    puerto := substring(autoridad from '\]:([0-9]+)$');
  else
    if autoridad !~ '^[a-zA-Z0-9._-]+(:[0-9]{1,5})?$' then return false; end if;
    host := split_part(autoridad,':',1);
    puerto := nullif(split_part(autoridad,':',2),'');
    -- Browsers interpret numeric final labels as IPv4, not DNS hostnames.
    if rtrim(host,'.') ~ '(^|\.)([0-9]+|0[xX][a-fA-F0-9]+)$' then
      if host !~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$' or host ~ '(^|\.)0[0-9]' or
         family(host::inet) <> 4 then return false; end if;
    end if;
  end if;
  return puerto is null or puerto::integer <= 65535;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $$;
revoke execute on function chambapp_private.odoo_url_valida(text) from public, anon, authenticated;

alter table public.tareas
  add column odoo_id text constraint tareas_odoo_id_formato
    check (odoo_id is null or (length(odoo_id) <= 64 and odoo_id ~ '^T[0-9]+$')),
  add column odoo_url text constraint tareas_odoo_url_formato
    check (odoo_url is null or chambapp_private.odoo_url_valida(odoo_url));

create table public.fichajes (
  id uuid primary key,
  usuario_id uuid not null references public.perfiles(id),
  jornada_id uuid not null,
  inicio_en timestamptz not null check (isfinite(inicio_en)),
  fin_en timestamptz constraint fichajes_intervalo_valido check (isfinite(fin_en) and fin_en > inicio_en),
  eliminado_en timestamptz,
  creado_en timestamptz not null default clock_timestamp(),
  actualizado_en timestamptz not null default clock_timestamp(),
  version bigint not null default 1 check (version > 0),
  unique (id, usuario_id),
  foreign key (jornada_id, usuario_id) references public.jornadas(id, usuario_id),
  exclude using gist (
    usuario_id extensions.gist_uuid_ops with =,
    tstzrange(inicio_en, fin_en, '[)') with &&
  ) where (eliminado_en is null)
);
create unique index un_fichaje_abierto_por_usuario on public.fichajes(usuario_id)
  where fin_en is null and eliminado_en is null;
create index fichajes_jornada_usuario on public.fichajes(jornada_id, usuario_id);

-- Separate from the task timer ledger. Record versions identify mutation intents;
-- creation has version 0. Replaying a committed command returns its original result.
create table chambapp_private.operaciones_fichajes (
  usuario_id uuid not null references public.perfiles(id),
  fichaje_id uuid not null,
  tipo text not null check (tipo in ('fichar_entrada','fichar_salida','crear_fichaje','editar_fichaje','eliminar_fichaje')),
  version_solicitada bigint not null check (version_solicitada >= 0),
  parametros jsonb not null,
  resultado jsonb not null,
  creado_en timestamptz not null default clock_timestamp(),
  primary key (usuario_id, fichaje_id, tipo, version_solicitada),
  foreign key (fichaje_id, usuario_id) references public.fichajes(id, usuario_id)
);
create index operaciones_fichajes_fichaje_usuario
  on chambapp_private.operaciones_fichajes(fichaje_id, usuario_id);

alter table public.fichajes enable row level security;
revoke all on public.fichajes from public, anon, authenticated;
grant select on public.fichajes to authenticated;
create policy lectura_propia on public.fichajes for select to authenticated
  using ((select auth.uid()) = usuario_id);
alter table chambapp_private.operaciones_fichajes enable row level security;
revoke all on chambapp_private.operaciones_fichajes from public, anon, authenticated;

create function chambapp_private.validar_fichaje() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Use the same first lock as task timers, edits and cascades.
  perform 1 from public.perfiles where id = new.usuario_id for update;
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.usuario_id <> old.usuario_id or new.creado_en <> old.creado_en then
      raise exception 'IDENTIDAD_INMUTABLE'; end if;
    if old.eliminado_en is not null then raise exception 'REGISTRO_ELIMINADO'; end if;
    new.version := old.version + 1;
    new.actualizado_en := clock_timestamp();
  else
    new.version := 1;
    new.creado_en := clock_timestamp(); new.actualizado_en := new.creado_en;
  end if;
  if new.eliminado_en is null and (new.inicio_en > clock_timestamp() or new.fin_en > clock_timestamp()) then
    raise exception 'INTERVALO_REAL_FUTURO'; end if;
  return new;
end $$;
create trigger validar_fichaje before insert or update on public.fichajes
  for each row execute function chambapp_private.validar_fichaje();
revoke execute on function chambapp_private.validar_fichaje() from public, anon, authenticated;

-- Require an explicit UTC offset so parsing never depends on the DB session zone.
create function chambapp_private.instante_fichaje(p_texto text) returns timestamptz
language plpgsql immutable strict set search_path = '' as $$
begin
  if p_texto !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]+)?)?([Zz]|[+-][0-9]{2}:[0-9]{2})$' then
    raise exception 'ZONA_HORARIA_REQUERIDA'; end if;
  return p_texto::timestamptz;
end $$;
revoke execute on function chambapp_private.instante_fichaje(text) from public, anon, authenticated;

create view public.fichajes_detalle with (security_invoker = true) as
select f.*, j.fecha, j.zona_horaria,
  extract(epoch from f.fin_en - f.inicio_en) as duracion_segundos
from public.fichajes f join public.jornadas j on j.id = f.jornada_id
where f.eliminado_en is null;
revoke all on public.fichajes_detalle from public, anon, authenticated;
grant select on public.fichajes_detalle to authenticated;

-- Existing columns remain in exactly the same order/type; metadata is appended.
create or replace view public.partes_detalle with (security_invoker = true) as
select h.*, t.proyecto_id, j.fecha, j.zona_horaria,
  h.inicio_en as inicio_imputado_en, h.fin_en as fin_imputado_en,
  extract(epoch from h.fin_en - h.inicio_en) as duracion_real_segundos,
  chambapp_private.redondear_duracion_superior(
    extract(epoch from h.fin_en - h.inicio_en), h.intervalo_redondeo_minutos::integer)
    as duracion_imputada_segundos, t.odoo_id, t.odoo_url
from public.partes_horas h join public.tareas t on t.id = h.tarea_id
join public.jornadas j on j.id = h.jornada_id
where h.eliminado_en is null and t.eliminado_en is null;

-- Keep the legacy implementation intact behind the same validated dispatcher.
alter function chambapp_private.operar(text,jsonb) rename to operar_legacy;
revoke execute on function chambapp_private.operar_legacy(text,jsonb) from public, anon, authenticated;

create function chambapp_private.operar(p_accion text, p_datos jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  u uuid := auth.uid(); perfil public.perfiles; tarea public.tareas;
  fichaje public.fichajes; jornada public.jornadas;
  op chambapp_private.operaciones_fichajes;
  entidad uuid; esperado bigint; ahora timestamptz; ini timestamptz; fin timestamptz;
  zona text; fecha_destino date; respuesta jsonb;
begin
  if u is null then raise exception 'SESION_REQUERIDA' using errcode = '42501'; end if;
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then raise exception 'DATOS_INVALIDOS'; end if;
  select * into perfil from public.perfiles where id = u for update;
  if not found then raise exception 'PERFIL_NO_DISPONIBLE' using errcode = '42501'; end if;
  ahora := clock_timestamp();

  if p_accion in ('fichar_entrada','fichar_salida','crear_fichaje','editar_fichaje','eliminar_fichaje') then
    entidad := (p_datos ->> 'id')::uuid;
    if entidad is null then raise exception 'FICHAJE_ID_REQUERIDO'; end if;
    if p_accion in ('fichar_entrada','crear_fichaje') then esperado := 0;
    else
      esperado := (p_datos ->> 'version')::bigint;
      if esperado is null or esperado < 1 then raise exception 'CONFLICTO_VERSION'; end if;
    end if;
    select * into op from chambapp_private.operaciones_fichajes
      where usuario_id = u and fichaje_id = entidad and tipo = p_accion and version_solicitada = esperado;
    if found then
      if op.parametros <> p_datos then
        if esperado = 0 then raise exception 'FICHAJE_ID_REUTILIZADO'; end if;
        raise exception 'CONFLICTO_VERSION';
      end if;
      return op.resultado;
    end if;

    if p_accion in ('fichar_entrada','crear_fichaje') then
      if exists(select 1 from public.fichajes where id = entidad) then
        raise exception 'FICHAJE_ID_REUTILIZADO'; end if;
      if p_accion = 'fichar_entrada' then ini := ahora; fin := null;
      else
        ini := chambapp_private.instante_fichaje(p_datos ->> 'inicio_en');
        fin := chambapp_private.instante_fichaje(p_datos ->> 'fin_en');
        if ini is null then raise exception 'ENTRADA_REQUERIDA'; end if;
      end if;
      jornada := chambapp_private.obtener_jornada(u,(ini at time zone perfil.zona_horaria)::date,perfil.zona_horaria);
      insert into public.fichajes(id,usuario_id,jornada_id,inicio_en,fin_en)
        values(entidad,u,jornada.id,ini,fin) returning * into fichaje;
    else
      select * into fichaje from public.fichajes where id = entidad and usuario_id = u;
      if not found then raise exception 'FICHAJE_NO_DISPONIBLE'; end if;
      if fichaje.eliminado_en is not null then
        if p_accion = 'eliminar_fichaje' then return to_jsonb(fichaje); end if;
        raise exception 'FICHAJE_NO_DISPONIBLE'; end if;
      if esperado is distinct from fichaje.version then raise exception 'CONFLICTO_VERSION'; end if;
      if p_accion = 'fichar_salida' then
        if fichaje.fin_en is null then
          update public.fichajes set fin_en = greatest(ahora,inicio_en + interval '1 microsecond')
            where id = entidad returning * into fichaje;
        end if;
      elsif p_accion = 'eliminar_fichaje' then
        update public.fichajes set eliminado_en = ahora where id = entidad returning * into fichaje;
      else
        ini := case when p_datos ? 'inicio_en' then chambapp_private.instante_fichaje(p_datos ->> 'inicio_en') else fichaje.inicio_en end;
        fin := case when p_datos ? 'fin_en' then chambapp_private.instante_fichaje(p_datos ->> 'fin_en') else fichaje.fin_en end;
        if ini is null then raise exception 'ENTRADA_REQUERIDA'; end if;
        select * into jornada from public.jornadas where id = fichaje.jornada_id and usuario_id = u;
        zona := jornada.zona_horaria; fecha_destino := (ini at time zone zona)::date;
        if fecha_destino <> jornada.fecha then
          jornada := chambapp_private.obtener_jornada(u,fecha_destino,zona);
          if jornada.zona_horaria <> zona and coalesce(p_datos ->> 'confirmar_zona','') <> jornada.zona_horaria then
            raise exception 'CONFIRMAR_CAMBIO_ZONA:%', jornada.zona_horaria; end if;
        end if;
        update public.fichajes set inicio_en = ini, fin_en = fin, jornada_id = jornada.id
          where id = entidad returning * into fichaje;
      end if;
    end if;
    respuesta := to_jsonb(fichaje);
    insert into chambapp_private.operaciones_fichajes(usuario_id,fichaje_id,tipo,version_solicitada,parametros,resultado)
      values(u,entidad,p_accion,esperado,p_datos,respuesta);
    return respuesta;
  end if;

  case p_accion
  when 'crear_tarea' then
    insert into public.tareas(usuario_id,proyecto_id,titulo,descripcion,estado,estimacion_minutos,odoo_id,odoo_url)
      values(u,(p_datos ->> 'proyecto_id')::uuid,p_datos ->> 'titulo',p_datos ->> 'descripcion',
        coalesce(p_datos ->> 'estado','pendiente'),(p_datos ->> 'estimacion_minutos')::integer,
        p_datos ->> 'odoo_id',p_datos ->> 'odoo_url') returning * into tarea;
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
      odoo_id = case when p_datos ? 'odoo_id' then p_datos ->> 'odoo_id' else odoo_id end,
      odoo_url = case when p_datos ? 'odoo_url' then p_datos ->> 'odoo_url' else odoo_url end,
      archivado_en = case when p_datos ? 'archivado' then case when (p_datos ->> 'archivado')::boolean
        then coalesce(archivado_en,ahora) else null end else archivado_en end
      where id = tarea.id returning * into tarea;
    return to_jsonb(tarea);
  else return chambapp_private.operar_legacy(p_accion,p_datos);
  end case;
end $$;
revoke execute on function chambapp_private.operar(text,jsonb) from public, anon, authenticated;
grant execute on function chambapp_private.operar(text,jsonb) to authenticated;

-- Rebind the public SQL wrapper after renaming the existing implementation.
create or replace function public.chambapp_operar(p_accion text, p_datos jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select chambapp_private.operar(p_accion,p_datos);
$$;
revoke execute on function public.chambapp_operar(text,jsonb) from public, anon, authenticated;
grant execute on function public.chambapp_operar(text,jsonb) to authenticated;

comment on table public.fichajes is 'Actual attendance, independent from task time entries; intervals may cross midnight and are not rounded.';
comment on table chambapp_private.operaciones_fichajes is 'Idempotent attendance commands keyed by user, session, action and requested version; no direct client access.';
comment on column public.tareas.odoo_id is 'Optional Odoo task reference: uppercase T followed by digits.';
comment on column public.tareas.odoo_url is 'Optional HTTP(S) URL for direct navigation to the Odoo task.';
notify pgrst, 'reload schema';
commit;
