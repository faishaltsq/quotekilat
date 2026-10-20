-- Test-harness shim (used only by scripts/verify-supabase.sh): Supabase-shaped environment on plain postgres:16-alpine.
-- Not a migration; never applied to a real project. Extends the bundled template with auth.users (the migration
-- trigger and FKs reference it) and with Supabase's default privileges, so the
-- revoke assertions below are not vacuous.

create schema if not exists auth;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text not null, public boolean not null default false);
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid);

do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema storage to anon, authenticated;
grant all on storage.buckets, storage.objects to anon, authenticated;

-- Supabase grants anon/authenticated full access to new public tables by
-- default. Arm that here BEFORE the migration runs, otherwise every revoke
-- assertion passes because the role never had the privilege to begin with.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
grant usage on schema public to anon, authenticated;

create table public.default_grant_probe (id int);
alter table public.default_grant_probe enable row level security;
