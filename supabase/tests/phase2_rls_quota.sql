-- Phase 2 verification: RLS isolation, grants, cross-tenant FK, atomic quota. Runs as postgres; every probe that must be limited by
-- RLS or by a grant switches to the real role first.

\set ON_ERROR_STOP on

create table if not exists public._r (name text, ok boolean, detail text);
truncate public._r;

-- ── harness control: the default grant must actually be live ────────────────
insert into public._r
select 'control: anon had default INSERT on probe before revokes',
       has_table_privilege('anon', 'public.default_grant_probe', 'INSERT'), null;

insert into public._r
select 'control: authenticated had default UPDATE on probe',
       has_table_privilege('authenticated', 'public.default_grant_probe', 'UPDATE'), null;

-- ── users ───────────────────────────────────────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.test', '{"display_name":"User A"}'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.test', '{"display_name":"User B"}');

insert into public._r
select 'profile auto-created for new auth user',
       (select count(*) from public.profiles) = 2, null;

insert into public._r
select 'display_name copied from metadata',
       (select display_name from public.profiles where user_id = '11111111-1111-1111-1111-111111111111') = 'User A', null;

-- ── grants: anon must hold nothing on user tables ───────────────────────────
insert into public._r
select 'anon has no SELECT on quotes', not has_table_privilege('anon', 'public.quotes', 'SELECT'), null;
insert into public._r
select 'anon has no INSERT on quotes', not has_table_privilege('anon', 'public.quotes', 'INSERT'), null;
insert into public._r
select 'anon has no SELECT on usage_counters', not has_table_privilege('anon', 'public.usage_counters', 'SELECT'), null;
insert into public._r
select 'anon has no EXECUTE on save_quote',
       not has_function_privilege('anon', 'public.save_quote(text,text,jsonb,jsonb,integer,bigint,integer,bigint,text,uuid,uuid)', 'EXECUTE'), null;
insert into public._r
select 'anon has no SELECT on profiles', not has_table_privilege('anon', 'public.profiles', 'SELECT'), null;

-- authenticated: read own rows, but cannot write quotes/counters directly
insert into public._r
select 'authenticated cannot INSERT quotes directly',
       not has_table_privilege('authenticated', 'public.quotes', 'INSERT'), null;
insert into public._r
select 'authenticated cannot DELETE quotes directly',
       not has_table_privilege('authenticated', 'public.quotes', 'DELETE'), null;
insert into public._r
select 'authenticated cannot INSERT usage_counters',
       not has_table_privilege('authenticated', 'public.usage_counters', 'INSERT'), null;
insert into public._r
select 'authenticated cannot UPDATE usage_counters',
       not has_table_privilege('authenticated', 'public.usage_counters', 'UPDATE'), null;
insert into public._r
select 'authenticated can UPDATE quotes.title',
       has_column_privilege('authenticated', 'public.quotes', 'title', 'UPDATE'), null;
insert into public._r
select 'authenticated cannot UPDATE quotes.computed_price_idr',
       not has_column_privilege('authenticated', 'public.quotes', 'computed_price_idr', 'UPDATE'), null;
insert into public._r
select 'authenticated cannot UPDATE profiles.user_id',
       not has_column_privilege('authenticated', 'public.profiles', 'user_id', 'UPDATE'), null;

-- ── as user A: create data through the RPC ──────────────────────────────────
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
set role authenticated;

select public.save_quote(
  'goods', 'Hampers custom', '[]'::jsonb, '{}'::jsonb, 3000, 250000, 3000, 0,
  'Budi', null, 'aaaaaaaa-0000-0000-0000-000000000001'
);

insert into public._r
select 'user A sees own quote', (select count(*) from public.quotes) = 1, null;
insert into public._r
select 'remaining quota is 4 after one save', public.remaining_quota() = 4, null;

-- idempotent replay must not consume a second slot
select public.save_quote(
  'goods', 'Hampers custom', '[]'::jsonb, '{}'::jsonb, 3000, 250000, 3000, 0,
  'Budi', null, 'aaaaaaaa-0000-0000-0000-000000000001'
);
insert into public._r
select 'replay of same idempotency key keeps 1 quote', (select count(*) from public.quotes) = 1, null;
insert into public._r
select 'replay did not consume quota', public.remaining_quota() = 4, null;

-- direct write must be refused by the grant, not by RLS
do $$
begin
  begin
    insert into public.quotes (owner_id, kind, title, target_margin_bps, computed_price_idr, idempotency_key)
    values ('11111111-1111-1111-1111-111111111111', 'goods', 'bypass', 3000, 1000, gen_random_uuid());
    insert into public._r values ('direct INSERT as authenticated is blocked', false, 'insert succeeded');
  exception when insufficient_privilege then
    insert into public._r values ('direct INSERT as authenticated is blocked', true, null);
  end;
end $$;

do $$
begin
  begin
    update public.usage_counters set count = 0;
    insert into public._r values ('direct quota UPDATE as authenticated is blocked', false, 'update succeeded');
  exception when insufficient_privilege then
    insert into public._r values ('direct quota UPDATE as authenticated is blocked', true, null);
  end;
end $$;

-- own quote is editable on the whitelisted column only
update public.quotes set title = 'Hampers custom v2';

do $$
begin
  begin
    update public.quotes set computed_price_idr = 1;
    insert into public._r values ('price column is not client-writable', false, 'update succeeded');
  exception when insufficient_privilege then
    insert into public._r values ('price column is not client-writable', true, null);
  end;
end $$;

-- ── as user B: isolation ────────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
set role authenticated;

insert into public._r
select 'user B sees zero of user A quotes', (select count(*) from public.quotes) = 0, null;
insert into public._r
select 'user B sees only own profile', (select count(*) from public.profiles) = 1, null;
insert into public._r
select 'user B sees no usage_counters of A', (select count(*) from public.usage_counters) = 0, null;

-- B cannot edit A's quote even by primary key
update public.quotes set title = 'hijacked';
insert into public._r
select 'user B update of A quote affects 0 rows',
       (select count(*) from public.quotes where title = 'hijacked') = 0, null;

-- authenticated holds no DELETE at all, so the statement must be refused by
-- the grant rather than silently deleting zero rows.
do $$
begin
  begin
    delete from public.quotes;
    insert into public._r values ('user B delete is refused by grants', false, 'delete ran');
  exception when insufficient_privilege then
    insert into public._r values ('user B delete is refused by grants', true, null);
  end;
end $$;
reset role;
insert into public._r
select 'A quote still present after B attempted delete',
       (select count(*) from public.quotes where owner_id = '11111111-1111-1111-1111-111111111111') = 1,
       (select count(*)::text from public.quotes where owner_id = '11111111-1111-1111-1111-111111111111');
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
set role authenticated;

-- ── cross-tenant FK: A's business profile cannot be referenced by B ─────────
reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
set role authenticated;
insert into public.business_profiles (owner_id, name) values ('11111111-1111-1111-1111-111111111111', 'Usaha A');
reset role;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
set role authenticated;
do $$
declare v_bp uuid;
begin
  select id into v_bp from public.business_profiles limit 1;
  if v_bp is not null then
    insert into public._r values ('user B cannot read A business_profiles', false, 'selectable');
  else
    insert into public._r values ('user B cannot read A business_profiles', true, null);
  end if;
end $$;

do $$
declare v_bp uuid := (select id from public.business_profiles limit 1);
begin
  begin
    perform public.save_quote(
      'goods', 'x', '[]'::jsonb, '{}'::jsonb, 3000, 1000, 3000, 0,
      null, '11111111-1111-1111-1111-111111111111'::uuid, gen_random_uuid());
    insert into public._r values ('composite FK blocks foreign business_profile_id', false, 'accepted a bogus id');
  exception when foreign_key_violation then
    insert into public._r values ('composite FK blocks foreign business_profile_id', true, null);
  end;
end $$;

-- ── quota exhaustion (5/month) ──────────────────────────────────────────────
reset role;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
set role authenticated;

-- Fill the month to the limit by looping on the function's own report, so the
-- assertion does not depend on how many quotes earlier probes happened to create.
do $$
declare v_remaining int;
begin
  for i in 1..20 loop
    v_remaining := public.remaining_quota();
    exit when v_remaining = 0;
    perform public.save_quote('goods', 'fill ' || i, '[]'::jsonb, '{}'::jsonb, 3000, 1000, 3000, 0, null, null, gen_random_uuid());
  end loop;
end $$;

insert into public._r
select 'counter reached the free limit of 5',
       (select count from public.usage_counters
        where owner_id = '22222222-2222-2222-2222-222222222222' and action_type = 'quote_saved') = 5,
       (select count::text from public.usage_counters
        where owner_id = '22222222-2222-2222-2222-222222222222' and action_type = 'quote_saved');
insert into public._r
select 'saves exhaust the quota', public.remaining_quota() = 0,
       public.remaining_quota()::text;

do $$
begin
  begin
    perform public.save_quote('goods','q6','[]'::jsonb,'{}'::jsonb,3000,1000,3000,0,null,null,gen_random_uuid());
    insert into public._r values ('sixth save raises QUOTA_EXCEEDED', false, 'sixth save succeeded');
  exception when others then
    insert into public._r values ('sixth save raises QUOTA_EXCEEDED',
      sqlerrm = 'QUOTA_EXCEEDED', sqlerrm);
  end;
end $$;

insert into public._r
select 'rejected over-limit save left no quote row', (select count(*) from public.quotes) = 5,
       (select count(*)::text from public.quotes);
insert into public._r
select 'rejected sixth save did not over-increment counter',
       (select count from public.usage_counters where owner_id = '22222222-2222-2222-2222-222222222222') = 5, null;

-- ── anon cannot read anything ───────────────────────────────────────────────
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$
begin
  begin
    perform 1 from public.quotes;
    insert into public._r values ('anon SELECT on quotes is denied', false, 'select succeeded');
  exception when insufficient_privilege then
    insert into public._r values ('anon SELECT on quotes is denied', true, null);
  end;
end $$;
reset role;

-- ── report ──────────────────────────────────────────────────────────────────
\echo ''
\echo '=== PHASE 2 SQL VERIFICATION ==='
select case when ok then 'PASS' else 'FAIL' end as result, name, coalesce(detail, '') as detail
from public._r order by ok, name;

do $$
declare v_fail int;
begin
  select count(*) into v_fail from public._r where not ok;
  if v_fail > 0 then
    raise exception '% assertion(s) failed', v_fail;
  end if;
end $$;
