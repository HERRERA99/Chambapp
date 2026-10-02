-- Manual Odoo imputation status belongs to each time entry, independent of task links.
-- Existing time entries remain pending; no external synchronization is performed.
begin;

alter table public.partes_horas
  add column imputado_en_odoo boolean not null default false;
comment on column public.partes_horas.imputado_en_odoo is
  'Manual confirmation that this time entry was imputed in Odoo; false means pending.';

-- List the original columns explicitly: h.* would insert the new table column
-- before existing view columns and break their public order/type contract.
create or replace view public.partes_detalle with (security_invoker = true) as
select h.id, h.usuario_id, h.jornada_id, h.tarea_id, h.inicio_en, h.fin_en,
  h.intervalo_redondeo_minutos, h.modo_redondeo, h.descripcion, h.eliminado_en,
  h.creado_en, h.actualizado_en, h.version,
  t.proyecto_id, j.fecha, j.zona_horaria,
  h.inicio_en as inicio_imputado_en, h.fin_en as fin_imputado_en,
  extract(epoch from h.fin_en - h.inicio_en) as duracion_real_segundos,
  chambapp_private.redondear_duracion_superior(
    extract(epoch from h.fin_en - h.inicio_en), h.intervalo_redondeo_minutos::integer)
    as duracion_imputada_segundos, t.odoo_id, t.odoo_url, h.imputado_en_odoo
from public.partes_horas h join public.tareas t on t.id = h.tarea_id
join public.jornadas j on j.id = h.jornada_id
where h.eliminado_en is null and t.eliminado_en is null;

-- The legacy dispatcher below retains all existing command behavior and grants;
-- only creating/editing a time entry accepts the optional manual boolean.

create or replace function chambapp_private.operar_legacy(p_accion text, p_datos jsonb default '{}'::jsonb)
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
  if p_accion in ('crear_parte','editar_parte') and p_datos ? 'imputado_en_odoo' and
     jsonb_typeof(p_datos -> 'imputado_en_odoo') <> 'boolean' then
    raise exception 'IMPUTACION_ODOO_INVALIDA'; end if;

  case p_accion
  when 'editar_perfil' then
    if (p_datos ->> 'version')::bigint is distinct from perfil.version then
      raise exception 'CONFLICTO_VERSION'; end if;
    update public.perfiles set
      nombre = case when p_datos ? 'nombre' then p_datos ->> 'nombre' else nombre end,
      zona_horaria = case when p_datos ? 'zona_horaria' then p_datos ->> 'zona_horaria' else zona_horaria end,
      intervalo_redondeo_minutos = case when p_datos ? 'intervalo_redondeo_minutos'
        then (p_datos ->> 'intervalo_redondeo_minutos')::smallint else intervalo_redondeo_minutos end,
      onboarding_completado = case when p_datos ? 'onboarding_completado'
        then (p_datos ->> 'onboarding_completado')::boolean else onboarding_completado end,
      preferencias = case when p_datos ? 'preferencias' then p_datos -> 'preferencias' else preferencias end
      where id = u returning * into perfil;
    return to_jsonb(perfil);

  when 'crear_proyecto' then
    insert into public.proyectos(usuario_id,nombre,descripcion,cliente,presupuesto_minutos)
      values(u,p_datos ->> 'nombre',p_datos ->> 'descripcion',p_datos ->> 'cliente',
        (p_datos ->> 'presupuesto_minutos')::integer) returning * into proyecto;
    return to_jsonb(proyecto);
  when 'editar_proyecto' then
    select * into proyecto from public.proyectos where id = (p_datos ->> 'id')::uuid and usuario_id = u;
    if not found or proyecto.eliminado_en is not null then raise exception 'PROYECTO_NO_DISPONIBLE'; end if;
    if (p_datos ->> 'version')::bigint is distinct from proyecto.version then raise exception 'CONFLICTO_VERSION'; end if;
    update public.proyectos set
      nombre = case when p_datos ? 'nombre' then p_datos ->> 'nombre' else nombre end,
      descripcion = case when p_datos ? 'descripcion' then p_datos ->> 'descripcion' else descripcion end,
      cliente = case when p_datos ? 'cliente' then p_datos ->> 'cliente' else cliente end,
      presupuesto_minutos = case when p_datos ? 'presupuesto_minutos'
        then (p_datos ->> 'presupuesto_minutos')::integer else presupuesto_minutos end,
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
    insert into public.partes_horas(usuario_id,jornada_id,tarea_id,inicio_en,fin_en,intervalo_redondeo_minutos,descripcion,imputado_en_odoo)
      values(u,jornada.id,(p_datos ->> 'tarea_id')::uuid,ini,fin,perfil.intervalo_redondeo_minutos,p_datos ->> 'descripcion',
        coalesce((p_datos ->> 'imputado_en_odoo')::boolean,false))
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
      imputado_en_odoo = case when p_datos ? 'imputado_en_odoo' then (p_datos ->> 'imputado_en_odoo')::boolean else imputado_en_odoo end,
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



revoke execute on function chambapp_private.operar_legacy(text,jsonb) from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
