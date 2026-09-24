-- Keep extension objects out of the API-exposed public schema.
alter extension btree_gist set schema extensions;

alter function private.touch_updated_at() set search_path = '';
alter function private.normalize_task_link() set search_path = '';
alter function private.validate_schedule_days() set search_path = '';
alter function private.validate_timezone() set search_path = '';
alter function private.prepare_period() set search_path = '';
alter function private.prepare_entry() set search_path = '';
alter function private.mark_review_dirty() set search_path = '';
alter function private.event_dirty() set search_path = '';
alter function private.refresh_after_schedule_change() set search_path = '';
alter function private.guard_review() set search_path = '';
alter function private.round_entry_seconds(timestamptz,timestamptz,integer) set search_path = '';

create index if not exists entries_activity_type_idx on public.time_entries(user_id, activity_type_id);
create index if not exists entries_project_idx on public.time_entries(user_id, project_id);
create index if not exists work_days_schedule_idx on public.work_days(user_id, schedule_id);
create index if not exists schedule_days_owner_idx on public.work_schedule_days(user_id, schedule_id);
