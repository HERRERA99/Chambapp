-- Chambapp local edition: the minimum of Supabase that the cloud migrations expect.
-- There is a single fixed user and no login: auth.uid() always returns that user.
-- PostgREST runs every request as the "authenticated" role (no JWT).
begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp()
);
revoke all on auth.users from public, anon, authenticated;

-- Keep in sync with LOCAL_USER_ID in src/lib/edition.ts.
create or replace function auth.uid() returns uuid
language sql stable set search_path = '' as
$$ select '00000000-0000-4000-8000-000000000001'::uuid $$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;

commit;
