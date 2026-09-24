create extension if not exists btree_gist;
create schema if not exists private;

create function private.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Europe/Madrid',
  next_task_number bigint not null default 1 check (next_task_number > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.time_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rounding_increment_minutes integer not null default 5 check (rounding_increment_minutes in (0,5,10,15,30,60)),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create function private.on_auth_user_created() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id, display_name) values (new.id, nullif(new.raw_user_meta_data ->> 'display_name',''));
  insert into public.time_preferences(user_id) values (new.id);
  return new;
end $$;
create trigger auth_user_created after insert on auth.users for each row execute function private.on_auth_user_created();
insert into public.profiles(user_id,display_name)
select id, nullif(raw_user_meta_data ->> 'display_name','') from auth.users on conflict (user_id) do nothing;
insert into public.time_preferences(user_id)
select id from auth.users on conflict (user_id) do nothing;

create table public.projects (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0), description text, color text,
  status text not null default 'active' check (status in ('active','paused','completed')),
  archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,id)
);
create unique index projects_active_name_unique on public.projects(user_id, lower(btrim(name))) where archived_at is null;

create table public.tasks (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null, task_number bigint not null check (task_number > 0),
  project_id uuid not null, title text not null check (length(btrim(title)) > 0),
  normalized_title text not null, description text,
  status text not null default 'todo' check (status in ('todo','in_progress','blocked','done','cancelled')),
  priority text check (priority in ('low','medium','high','urgent')),
  estimate_minutes integer check (estimate_minutes >= 0), due_date date, completed_at timestamptz, archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(user_id,id), unique(user_id,task_number), unique(user_id,normalized_title),
  foreign key(user_id,project_id) references public.projects(user_id,id) on delete restrict,
  check (id ~ '^T[1-9][0-9]*$')
);
create function private.prepare_task() returns trigger language plpgsql security definer set search_path = '' as $$
declare n bigint;
begin
  if new.user_id is distinct from auth.uid() then raise exception 'Usuario no autorizado'; end if;
  new.title := btrim(regexp_replace(new.title, '\s+', ' ', 'g'));
  new.normalized_title := lower(new.title);
  if tg_op = 'INSERT' then
    update public.profiles set next_task_number = next_task_number + 1 where user_id = new.user_id
      returning next_task_number - 1 into n;
    if n is null then raise exception 'Perfil no encontrado'; end if;
    new.task_number := n; new.id := 'T' || n;
  elsif new.id is distinct from old.id or new.task_number is distinct from old.task_number or new.user_id is distinct from old.user_id then
    raise exception 'El identificador de tarea es inmutable';
  end if;
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then new.completed_at := now(); end if;
  if tg_op = 'UPDATE' and new.status <> 'done' then new.completed_at := null; end if;
  return new;
end $$;
create trigger tasks_prepare before insert or update on public.tasks for each row execute function private.prepare_task();

create table public.task_notes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), task_id text not null,
  body text not null check (length(btrim(body)) > 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(user_id,task_id) references public.tasks(user_id,id) on delete cascade
);
create table public.task_links (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), task_id text not null,
  url text not null check (url ~* '^https?://'), normalized_url text not null, label text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,normalized_url), foreign key(user_id,task_id) references public.tasks(user_id,id) on delete cascade
);
create function private.normalize_task_link() returns trigger language plpgsql as $$
begin new.url := btrim(new.url); new.normalized_url := lower(regexp_replace(new.url, '/+$', '')); return new; end $$;
create trigger task_link_normalize before insert or update on public.task_links for each row execute function private.normalize_task_link();

create table public.work_schedules (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  effective_from date not null, effective_to date, weekly_target_minutes integer not null check (weekly_target_minutes >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,id), unique(user_id,effective_from), check (effective_to is null or effective_to > effective_from),
  exclude using gist (user_id with =, daterange(effective_from,effective_to,'[)') with &&)
);
create table public.work_schedule_days (
  user_id uuid not null default auth.uid(), schedule_id uuid not null, weekday smallint not null check (weekday between 1 and 7),
  primary key(schedule_id,weekday), foreign key(user_id,schedule_id) references public.work_schedules(user_id,id) on delete cascade
);
create function private.validate_schedule_days() returns trigger language plpgsql as $$
declare schedule_key uuid;
begin
  if tg_table_name = 'work_schedules' then
    schedule_key := new.id;
  elsif tg_op = 'DELETE' then schedule_key := old.schedule_id;
  else schedule_key := new.schedule_id; end if;
  if exists(select 1 from public.work_schedules s where s.id = schedule_key and s.weekly_target_minutes > 0
    and not exists(select 1 from public.work_schedule_days d where d.schedule_id = s.id)) then
    raise exception 'Un horario con objetivo semanal necesita al menos un día laborable';
  end if;
  return null;
end $$;
create constraint trigger schedule_has_days after insert or update on public.work_schedules
  deferrable initially deferred for each row execute function private.validate_schedule_days();
create constraint trigger schedule_days_valid after insert or update or delete on public.work_schedule_days
  deferrable initially deferred for each row execute function private.validate_schedule_days();
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('holiday','event')), title text not null check (length(btrim(title)) > 0), description text,
  all_day boolean not null default true, starts_on date, ends_on date, starts_at timestamptz, ends_at timestamptz,
  timezone text not null default 'Europe/Madrid', affects_work_target boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((all_day and starts_on is not null and ends_on > starts_on and starts_at is null and ends_at is null)
      or (not all_day and starts_at is not null and ends_at > starts_at and starts_on is null and ends_on is null)),
  check (kind = 'holiday' or not affects_work_target), check (kind <> 'holiday' or all_day)
);
create table public.work_days (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  work_date date not null, timezone text not null, schedule_id uuid,
  target_minutes integer not null default 0 check (target_minutes >= 0),
  target_source text not null default 'manual' check (target_source in ('schedule','holiday','manual')),
  note text, reviewed_at timestamptz, review_dirty_at timestamptz, review_note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,id), unique(user_id,work_date), foreign key(user_id,schedule_id) references public.work_schedules(user_id,id) on delete restrict
);
create table public.work_periods (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), work_day_id uuid not null,
  started_at timestamptz not null, ended_at timestamptz, note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,id), foreign key(user_id,work_day_id) references public.work_days(user_id,id) on delete restrict,
  check (ended_at is null or ended_at > started_at),
  exclude using gist (user_id with =, tstzrange(started_at,ended_at,'[)') with &&)
);
create table public.activity_types (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0), color text, default_counts_as_work boolean not null default true,
  archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,id)
);
create unique index activity_types_active_name_unique on public.activity_types(user_id,lower(btrim(name))) where archived_at is null;
create table public.time_entries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid(), work_period_id uuid not null,
  kind text not null check (kind in ('task','break','meal','custom')), task_id text, activity_type_id uuid, project_id uuid,
  counts_as_work boolean not null, started_at timestamptz not null, ended_at timestamptz,
  rounded_seconds integer check (rounded_seconds >= 0), rounding_increment_applied integer check (rounding_increment_applied in (0,5,10,15,30,60)),
  note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,id), foreign key(user_id,work_period_id) references public.work_periods(user_id,id) on delete restrict,
  foreign key(user_id,task_id) references public.tasks(user_id,id) on delete restrict,
  foreign key(user_id,activity_type_id) references public.activity_types(user_id,id) on delete restrict,
  foreign key(user_id,project_id) references public.projects(user_id,id) on delete restrict,
  check (ended_at is null or ended_at > started_at),
  check ((kind = 'task' and task_id is not null and activity_type_id is null and counts_as_work)
      or (kind in ('break','meal') and task_id is null and activity_type_id is null and not counts_as_work)
      or (kind = 'custom' and task_id is null and activity_type_id is not null)),
  check ((kind = 'task' and ((ended_at is null and rounded_seconds is null and rounding_increment_applied is null)
    or (ended_at is not null and rounded_seconds is not null and rounding_increment_applied is not null)))
    or (kind <> 'task' and rounded_seconds is null and rounding_increment_applied is null)),
  exclude using gist (user_id with =, tstzrange(started_at,ended_at,'[)') with &&)
);
create table public.time_entry_revisions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, time_entry_id uuid not null,
  changed_at timestamptz not null default now(), changed_by uuid not null,
  before_values jsonb not null, after_values jsonb not null, reason text,
  foreign key(user_id,time_entry_id) references public.time_entries(user_id,id) on delete restrict
);
create function private.validate_timezone() returns trigger language plpgsql as $$
begin
  if not exists(select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Zona horaria IANA no válida: %', new.timezone;
  end if;
  return new;
end $$;
create trigger profile_timezone before insert or update on public.profiles for each row execute function private.validate_timezone();
create trigger work_day_timezone before insert or update on public.work_days for each row execute function private.validate_timezone();
create trigger event_timezone before insert or update on public.calendar_events for each row execute function private.validate_timezone();

create function private.round_entry_seconds(p_start timestamptz, p_end timestamptz, p_increment integer)
returns integer language sql immutable as $$
  select case when p_increment = 0 then ceil(extract(epoch from p_end - p_start))::integer
  else (ceil(extract(epoch from p_end - p_start) / (p_increment * 60)) * p_increment * 60)::integer end
$$;
create function private.prepare_period() returns trigger language plpgsql as $$
declare d public.work_days; 
begin
  select * into d from public.work_days where id = new.work_day_id and user_id = new.user_id;
  if not found or (new.started_at at time zone d.timezone)::date <> d.work_date then raise exception 'El tramo debe comenzar en su jornada local'; end if;
  if tg_op = 'UPDATE' and exists (select 1 from public.time_entries e where e.work_period_id = new.id and e.user_id = new.user_id
    and (e.started_at < new.started_at or (new.ended_at is not null and (e.ended_at is null or e.ended_at > new.ended_at)))) then
    raise exception 'El tramo no puede dejar partes fuera de sus límites';
  end if;
  return new;
end $$;
create trigger period_validate before insert or update on public.work_periods for each row execute function private.prepare_period();
create function private.prepare_entry() returns trigger language plpgsql as $$
declare p public.work_periods; inc integer;
begin
  select * into p from public.work_periods where id = new.work_period_id and user_id = new.user_id;
  if not found or new.started_at < p.started_at or (p.ended_at is not null and (new.ended_at is null or new.ended_at > p.ended_at)) then
    raise exception 'El parte debe quedar dentro de un tramo de presencia';
  end if;
  if new.kind = 'task' then
    if tg_op = 'INSERT' then select project_id into new.project_id from public.tasks where user_id = new.user_id and id = new.task_id; end if;
    if new.ended_at is not null then
      if tg_op = 'INSERT' or old.ended_at is null then
        select rounding_increment_minutes into inc from public.time_preferences where user_id = new.user_id;
        new.rounding_increment_applied := inc;
      else inc := old.rounding_increment_applied; new.rounding_increment_applied := inc; end if;
      new.rounded_seconds := private.round_entry_seconds(new.started_at,new.ended_at,inc);
    end if;
  else new.rounded_seconds := null; new.rounding_increment_applied := null; end if;
  return new;
end $$;
create trigger entry_validate before insert or update on public.time_entries for each row execute function private.prepare_entry();
create function private.audit_entry() returns trigger language plpgsql security definer set search_path = '' as $$
declare before_data jsonb; after_data jsonb;
begin
  if new.user_id is distinct from auth.uid() then raise exception 'Usuario no autorizado'; end if;
  before_data := to_jsonb(old) - 'created_at' - 'updated_at';
  after_data := to_jsonb(new) - 'created_at' - 'updated_at';
  if before_data is distinct from after_data then
    insert into public.time_entry_revisions(user_id,time_entry_id,changed_by,before_values,after_values,reason)
    values(new.user_id,new.id,coalesce(auth.uid(),new.user_id),before_data,after_data,nullif(current_setting('app.revision_reason',true),''));
  end if;
  return null;
end $$;
create trigger entry_audit after update on public.time_entries for each row execute function private.audit_entry();
create function private.mark_review_dirty() returns trigger language plpgsql as $$
declare old_day uuid; new_day uuid;
begin
  if tg_table_name = 'work_periods' then
    if tg_op <> 'INSERT' then old_day := old.work_day_id; end if;
    if tg_op <> 'DELETE' then new_day := new.work_day_id; end if;
  else
    if tg_op <> 'INSERT' then select work_day_id into old_day from public.work_periods where id = old.work_period_id; end if;
    if tg_op <> 'DELETE' then select work_day_id into new_day from public.work_periods where id = new.work_period_id; end if;
  end if;
  update public.work_days set review_dirty_at = clock_timestamp() where id in (old_day,new_day);
  return null;
end $$;
create trigger period_dirty after insert or update or delete on public.work_periods for each row execute function private.mark_review_dirty();
create trigger entry_dirty after insert or update or delete on public.time_entries for each row execute function private.mark_review_dirty();
create function private.event_dirty() returns trigger language plpgsql as $$
declare lower_day date; upper_day date; uid uuid;
begin
  if tg_op = 'INSERT' then
    uid := new.user_id;
    lower_day := coalesce(new.starts_on,(new.starts_at at time zone new.timezone)::date);
    upper_day := coalesce(new.ends_on,(new.ends_at at time zone new.timezone)::date + 1);
  elsif tg_op = 'DELETE' then
    uid := old.user_id;
    lower_day := coalesce(old.starts_on,(old.starts_at at time zone old.timezone)::date);
    upper_day := coalesce(old.ends_on,(old.ends_at at time zone old.timezone)::date + 1);
  else
    uid := new.user_id;
    lower_day := least(coalesce(new.starts_on,(new.starts_at at time zone new.timezone)::date),coalesce(old.starts_on,(old.starts_at at time zone old.timezone)::date));
    upper_day := greatest(coalesce(new.ends_on,(new.ends_at at time zone new.timezone)::date + 1),coalesce(old.ends_on,(old.ends_at at time zone old.timezone)::date + 1));
  end if;
  update public.work_days set review_dirty_at = clock_timestamp() where user_id = uid and work_date >= lower_day and work_date < upper_day;
  return null;
end $$;
create trigger event_dirty after insert or update or delete on public.calendar_events for each row execute function private.event_dirty();

create function public.ensure_work_day(p_date date) returns public.work_days language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid(); result public.work_days; s public.work_schedules; target integer := 0; source text := 'schedule'; days integer[]; day_position integer; holiday boolean;
begin
  if uid is null then raise exception 'Inicia sesión'; end if;
  select * into result from public.work_days where user_id = uid and work_date = p_date;
  if found then return result; end if;
  select * into s from public.work_schedules where user_id = uid and effective_from <= p_date and (effective_to is null or p_date < effective_to) order by effective_from desc limit 1;
  if found then
    select array_agg(weekday order by weekday) into days from public.work_schedule_days where user_id = uid and schedule_id = s.id;
    if s.weekly_target_minutes > 0 and coalesce(array_length(days,1),0) = 0 then raise exception 'Configura los días laborables del horario'; end if;
    select array_position(days,extract(isodow from p_date)::integer) into day_position;
    if day_position is not null then target := s.weekly_target_minutes / array_length(days,1) + case when day_position <= s.weekly_target_minutes % array_length(days,1) then 1 else 0 end; end if;
  end if;
  select exists(select 1 from public.calendar_events where user_id = uid and kind = 'holiday' and affects_work_target and p_date >= starts_on and p_date < ends_on) into holiday;
  if holiday then target := 0; source := 'holiday'; end if;
  insert into public.work_days(user_id,work_date,timezone,schedule_id,target_minutes,target_source)
  select uid,p_date,timezone,s.id,target,source from public.profiles where user_id = uid
  on conflict (user_id,work_date) do nothing;
  select * into result from public.work_days where user_id = uid and work_date = p_date;
  return result;
end $$;
create function private.refresh_future_work_days(p_user_id uuid) returns void language plpgsql security invoker set search_path = '' as $$
declare d public.work_days; s public.work_schedules; weekdays integer[]; day_position integer; target integer; source text; holiday boolean;
begin
  for d in select * from public.work_days where user_id = p_user_id and work_date > (now() at time zone timezone)::date
    and target_source <> 'manual' and not exists (select 1 from public.work_periods p where p.work_day_id = work_days.id) loop
    target := 0; source := 'schedule';
    select * into s from public.work_schedules where user_id = p_user_id and effective_from <= d.work_date
      and (effective_to is null or d.work_date < effective_to) order by effective_from desc limit 1;
    if s.id is not null then
      select array_agg(weekday order by weekday) into weekdays from public.work_schedule_days where user_id = p_user_id and schedule_id = s.id;
      day_position := array_position(weekdays,extract(isodow from d.work_date)::integer);
      if day_position is not null then target := s.weekly_target_minutes / array_length(weekdays,1)
        + case when day_position <= s.weekly_target_minutes % array_length(weekdays,1) then 1 else 0 end; end if;
    end if;
    select exists(select 1 from public.calendar_events where user_id = p_user_id and kind = 'holiday' and affects_work_target
      and d.work_date >= starts_on and d.work_date < ends_on) into holiday;
    if holiday then target := 0; source := 'holiday'; end if;
    update public.work_days set schedule_id = s.id, target_minutes = target, target_source = source where id = d.id;
  end loop;
end $$;
create function private.refresh_after_schedule_change() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then perform private.refresh_future_work_days(old.user_id);
  else perform private.refresh_future_work_days(new.user_id); end if;
  return null;
end $$;
create trigger schedule_refresh after insert or update or delete on public.work_schedules
  for each row execute function private.refresh_after_schedule_change();
create trigger schedule_days_refresh after insert or update or delete on public.work_schedule_days
  for each row execute function private.refresh_after_schedule_change();
create trigger holiday_refresh after insert or update or delete on public.calendar_events
  for each row execute function private.refresh_after_schedule_change();
create function public.start_period(p_date date default null) returns public.work_periods language plpgsql security invoker set search_path = '' as $$
declare d public.work_days; result public.work_periods; instant timestamptz := clock_timestamp(); uid uuid := auth.uid();
begin
  if exists(select 1 from public.work_periods where user_id = uid and ended_at is null) then raise exception 'Ya hay una jornada abierta'; end if;
  if p_date is null then select (instant at time zone timezone)::date into p_date from public.profiles where user_id = uid; end if;
  d := public.ensure_work_day(p_date);
  insert into public.work_periods(user_id,work_day_id,started_at) values(uid,d.id,instant) returning * into result;
  return result;
end $$;
create function public.stop_period(p_id uuid) returns public.work_periods language plpgsql security invoker set search_path = '' as $$
declare result public.work_periods; instant timestamptz := clock_timestamp();
begin
  if exists(select 1 from public.time_entries where user_id = auth.uid() and work_period_id = p_id and ended_at is null) then raise exception 'Detén primero el cronómetro activo'; end if;
  update public.work_periods set ended_at = instant where id = p_id and user_id = auth.uid() and ended_at is null returning * into result;
  if result.id is null then raise exception 'Tramo abierto no encontrado'; end if;
  return result;
end $$;
create function public.start_entry(p_period_id uuid,p_kind text,p_task_id text default null,p_activity_type_id uuid default null,p_note text default null)
returns public.time_entries language plpgsql security invoker set search_path = '' as $$
declare result public.time_entries; working boolean; project uuid;
begin
  if p_kind = 'task' then select project_id into project from public.tasks where user_id = auth.uid() and id = p_task_id; working := true;
  elsif p_kind = 'custom' then select default_counts_as_work into working from public.activity_types where user_id = auth.uid() and id = p_activity_type_id;
  else working := false; end if;
  if working is null then raise exception 'Tarea o tipo no encontrado'; end if;
  insert into public.time_entries(user_id,work_period_id,kind,task_id,activity_type_id,project_id,counts_as_work,started_at,note)
  values(auth.uid(),p_period_id,p_kind,p_task_id,p_activity_type_id,project,working,clock_timestamp(),p_note) returning * into result;
  return result;
end $$;
create function public.stop_entry(p_id uuid) returns public.time_entries language plpgsql security invoker set search_path = '' as $$
declare result public.time_entries;
begin
  update public.time_entries set ended_at = clock_timestamp() where id = p_id and user_id = auth.uid() and ended_at is null returning * into result;
  if result.id is null then raise exception 'Cronómetro activo no encontrado'; end if;
  return result;
end $$;
create function public.correct_time_entry(
  p_id uuid, p_period_id uuid, p_kind text, p_task_id text, p_activity_type_id uuid,
  p_project_id uuid, p_counts_as_work boolean, p_started_at timestamptz, p_ended_at timestamptz,
  p_note text, p_reason text default null
) returns public.time_entries language plpgsql security invoker set search_path = '' as $$
declare result public.time_entries;
begin
  perform set_config('app.revision_reason',coalesce(p_reason,''),true);
  update public.time_entries set work_period_id = p_period_id, kind = p_kind, task_id = p_task_id,
    activity_type_id = p_activity_type_id, project_id = p_project_id, counts_as_work = p_counts_as_work,
    started_at = p_started_at, ended_at = p_ended_at, note = p_note
  where id = p_id and user_id = auth.uid() returning * into result;
  perform set_config('app.revision_reason','',true);
  if result.id is null then raise exception 'Parte no encontrado'; end if;
  return result;
end $$;
create function public.review_work_day(p_id uuid,p_note text default null) returns public.work_days language plpgsql security invoker set search_path = '' as $$
declare result public.work_days;
begin
  if exists(select 1 from public.work_periods p where p.work_day_id = p_id and p.user_id = auth.uid() and p.ended_at is null)
    or exists(select 1 from public.time_entries e join public.work_periods p on p.id = e.work_period_id where p.work_day_id = p_id and e.user_id = auth.uid() and e.ended_at is null) then
    raise exception 'Cierra los cronómetros antes de revisar';
  end if;
  perform set_config('app.review_operation','true',true);
  update public.work_days set reviewed_at = clock_timestamp(), review_note = p_note where id = p_id and user_id = auth.uid() returning * into result;
  perform set_config('app.review_operation','',true);
  if result.id is null then raise exception 'Jornada no encontrada'; end if;
  return result;
end $$;
create function private.guard_review() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.reviewed_at := null; new.review_note := null;
  elsif new.user_id is distinct from old.user_id or new.work_date is distinct from old.work_date
    or new.timezone is distinct from old.timezone then
    raise exception 'La identidad y fecha de una jornada no se pueden cambiar';
  elsif (new.reviewed_at is distinct from old.reviewed_at or new.review_note is distinct from old.review_note)
    and current_setting('app.review_operation',true) is distinct from 'true' then
    raise exception 'La revisión debe confirmarse desde la operación de cierre';
  end if;
  if tg_op = 'UPDATE' and (new.target_minutes is distinct from old.target_minutes
    or new.target_source is distinct from old.target_source) then
    new.review_dirty_at := clock_timestamp();
  end if;
  return new;
end $$;
create trigger work_day_review_guard before insert or update on public.work_days for each row execute function private.guard_review();
create function public.create_work_schedule(p_effective_from date,p_weekly_target_minutes integer,p_weekdays integer[])
returns public.work_schedules language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid(); result public.work_schedules; prior public.work_schedules; day_number integer;
begin
  if uid is null then raise exception 'Inicia sesión'; end if;
  if p_effective_from <= current_date then raise exception 'El nuevo horario debe empezar en el futuro'; end if;
  if p_weekly_target_minutes < 0 or (p_weekly_target_minutes > 0 and coalesce(array_length(p_weekdays,1),0) = 0) then
    raise exception 'Objetivo o días laborables no válidos';
  end if;
  if exists(select 1 from unnest(p_weekdays) n where n not between 1 and 7) then raise exception 'Día laborable no válido'; end if;
  select * into prior from public.work_schedules where user_id = uid and effective_from < p_effective_from
    and (effective_to is null or effective_to > p_effective_from) order by effective_from desc limit 1 for update;
  if prior.id is not null then update public.work_schedules set effective_to = p_effective_from where id = prior.id and user_id = uid; end if;
  insert into public.work_schedules(user_id,effective_from,weekly_target_minutes)
    values(uid,p_effective_from,p_weekly_target_minutes) returning * into result;
  foreach day_number in array p_weekdays loop
    insert into public.work_schedule_days(user_id,schedule_id,weekday) values(uid,result.id,day_number) on conflict do nothing;
  end loop;
  return result;
end $$;

do $$ declare t text; begin
  foreach t in array array['profiles','time_preferences','projects','tasks','task_notes','task_links','work_schedules','work_schedule_days','calendar_events','work_days','work_periods','activity_types','time_entries','time_entry_revisions'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)',t || '_read',t);
    if t not in ('time_entry_revisions','profiles','time_preferences') then
      execute format('grant insert, update, delete on public.%I to authenticated',t);
      execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',t || '_insert',t);
      execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t || '_update',t);
      execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',t || '_delete',t);
    end if;
  end loop;
end $$;
grant update(display_name,timezone) on public.profiles to authenticated;
create policy profiles_update on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant update(rounding_increment_minutes) on public.time_preferences to authenticated;
create policy preferences_update on public.time_preferences for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on function public.ensure_work_day(date), public.start_period(date), public.stop_period(uuid), public.start_entry(uuid,text,text,uuid,text), public.stop_entry(uuid), public.correct_time_entry(uuid,uuid,text,text,uuid,uuid,boolean,timestamptz,timestamptz,text,text), public.review_work_day(uuid,text), public.create_work_schedule(date,integer,integer[]) from public, anon;
grant execute on function public.ensure_work_day(date), public.start_period(date), public.stop_period(uuid), public.start_entry(uuid,text,text,uuid,text), public.stop_entry(uuid), public.correct_time_entry(uuid,uuid,text,text,uuid,uuid,boolean,timestamptz,timestamptz,text,text), public.review_work_day(uuid,text), public.create_work_schedule(date,integer,integer[]) to authenticated;
grant usage on schema private to authenticated;
grant execute on function private.round_entry_seconds(timestamptz,timestamptz,integer) to authenticated;

create index tasks_project_idx on public.tasks(user_id,project_id);
create index tasks_status_idx on public.tasks(user_id,status);
create index tasks_due_idx on public.tasks(user_id,due_date);
create index notes_task_idx on public.task_notes(user_id,task_id,created_at);
create index links_task_idx on public.task_links(user_id,task_id);
create index periods_day_idx on public.work_periods(user_id,work_day_id,started_at);
create index entries_period_idx on public.time_entries(user_id,work_period_id,started_at);
create index entries_task_idx on public.time_entries(user_id,task_id,started_at);
create index revisions_entry_idx on public.time_entry_revisions(user_id,time_entry_id,changed_at);
create index events_dates_idx on public.calendar_events(user_id,starts_on,ends_on);
create index tasks_search_idx on public.tasks using gin(to_tsvector('simple',coalesce(title,'') || ' ' || coalesce(description,'')));
create index notes_search_idx on public.task_notes using gin(to_tsvector('simple',body));

do $$ declare t text; begin
  foreach t in array array['profiles','time_preferences','projects','tasks','task_notes','task_links','work_schedules','calendar_events','work_days','work_periods','activity_types','time_entries'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.touch_updated_at()',t || '_touch',t);
  end loop;
end $$;
