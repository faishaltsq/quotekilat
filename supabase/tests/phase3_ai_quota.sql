-- Phase 3 verification: AI parse quota is charged atomically, replays do not
-- double-charge, per-IP ceiling fires, and neither counter table is reachable
-- from a browser session. Runs as postgres; every probe switches to the real
-- role first so grants and RLS are actually exercised.

\set ON_ERROR_STOP on

create table if not exists public._r (name text, ok boolean, detail text);
truncate public._r;

insert into auth.users (id, email, raw_user_meta_data) values
  ('33333333-3333-3333-3333-333333333333', 'c@example.test', '{"display_name":"User C"}'),
  ('44444444-4444-4444-4444-444444444444', 'd@example.test', '{"display_name":"User D"}')
on conflict (id) do nothing;

-- ── harness control ─────────────────────────────────────────────────────────
-- Sentinels created now, after the shim armed Supabase's default privileges and
-- after the migration revoked the real objects. They must still be permissive,
-- otherwise the revoke assertions below would pass vacuously.
create table if not exists public.p3_table_probe (id int);
create or replace function public.p3_fn_probe() returns int language sql as 'select 1';

insert into public._r
select 'control: default grants still reach a table created after the shim',
       has_table_privilege('authenticated', 'public.p3_table_probe', 'INSERT'), null;

insert into public._r
select 'control: default grants still reach a function created after the shim',
       has_function_privilege('anon', 'public.p3_fn_probe()', 'EXECUTE'), null;

-- ── grants ──────────────────────────────────────────────────────────────────
insert into public._r
select 'anon cannot execute begin_ai_parse',
       not has_function_privilege('anon', 'public.begin_ai_parse(uuid,text)', 'EXECUTE'), null;
insert into public._r
select 'anon cannot execute ai_parse_limit',
       not has_function_privilege('anon', 'public.ai_parse_limit()', 'EXECUTE'), null;
insert into public._r
select 'anon cannot execute ai_parse_remaining',
       not has_function_privilege('anon', 'public.ai_parse_remaining()', 'EXECUTE'), null;
insert into public._r
select 'authenticated may execute begin_ai_parse',
       has_function_privilege('authenticated', 'public.begin_ai_parse(uuid,text)', 'EXECUTE'), null;

insert into public._r
select 'authenticated has no SELECT on ai_parse_log',
       not has_table_privilege('authenticated', 'public.ai_parse_log', 'SELECT'), null;
insert into public._r
select 'authenticated has no INSERT on ai_parse_log',
       not has_table_privilege('authenticated', 'public.ai_parse_log', 'INSERT'), null;
insert into public._r
select 'authenticated has no SELECT on ai_ip_throttle',
       not has_table_privilege('authenticated', 'public.ai_ip_throttle', 'SELECT'), null;

-- ── free allowance: first two allowed, third refused ────────────────────────
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
set role authenticated;
create temp table _ai1 as select * from public.begin_ai_parse('aaaaaaaa-0000-0000-0000-000000000001', 'ip-c');
create temp table _ai2 as select * from public.begin_ai_parse('aaaaaaaa-0000-0000-0000-000000000002', 'ip-c');
create temp table _ai3 as select * from public.begin_ai_parse('aaaaaaaa-0000-0000-0000-000000000003', 'ip-c');
create temp table _rem_c as select public.ai_parse_remaining() as remaining;
reset role;

insert into public._r
select 'first AI parse is allowed', (select allowed from _ai1), null;
insert into public._r
select 'first AI parse leaves 1', (select remaining from _ai1) = 1, (select remaining::text from _ai1);
insert into public._r
select 'second AI parse is allowed', (select allowed from _ai2), null;
insert into public._r
select 'second AI parse leaves 0', (select remaining from _ai2) = 0, (select remaining::text from _ai2);
insert into public._r
select 'third AI parse is refused', (select not allowed from _ai3), null;
insert into public._r
select 'refusal names the quota, not the network', (select reason from _ai3) = 'quota', (select reason from _ai3);
insert into public._r
select 'ai_parse_remaining reports 0 after the allowance is spent',
       (select remaining from _rem_c) = 0, (select remaining::text from _rem_c);

insert into public._r
select 'usage counter recorded exactly the allowance',
       (select count from public.usage_counters
         where owner_id = '33333333-3333-3333-3333-333333333333' and action_type = 'ai_parse') = 2, null;

-- ── replay: same key must not charge again ──────────────────────────────────
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
set role authenticated;
create temp table _replay as select * from public.begin_ai_parse('aaaaaaaa-0000-0000-0000-000000000001', 'ip-c');
reset role;

insert into public._r
select 'replayed key is allowed even with zero quota left', (select allowed from _replay), null;
insert into public._r
select 'replay is labelled as replay', (select reason from _replay) = 'replay', (select reason from _replay);
insert into public._r
select 'replay did not charge the counter',
       (select count from public.usage_counters
         where owner_id = '33333333-3333-3333-3333-333333333333' and action_type = 'ai_parse') = 2, null;
insert into public._r
select 'replay did not write a second log row',
       (select count(*) from public.ai_parse_log
         where owner_id = '33333333-3333-3333-3333-333333333333') = 2, null;

-- ── isolation: a second tenant starts with a full allowance ─────────────────
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
set role authenticated;
create temp table _ai_d as select * from public.begin_ai_parse('bbbbbbbb-0000-0000-0000-000000000001', 'ip-d');
create temp table _rem_d as select public.ai_parse_remaining() as remaining;
reset role;

insert into public._r
select 'second tenant still has its own allowance',
       (select allowed from _ai_d) and (select remaining from _ai_d) = 1, (select remaining::text from _ai_d);
insert into public._r
select 'second tenant counter is separate',
       (select count from public.usage_counters
         where owner_id = '44444444-4444-4444-4444-444444444444' and action_type = 'ai_parse') = 1, null;

-- ── refund: a failed provider call must return the unit ─────────────────────
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
set role authenticated;
create temp table _refund as select public.refund_ai_parse('aaaaaaaa-0000-0000-0000-000000000002') as remaining;
reset role;

insert into public._r
select 'refund returns the unit to the allowance', (select remaining from _refund) = 1, (select remaining::text from _refund);
insert into public._r
select 'refund decremented the counter',
       (select count from public.usage_counters
         where owner_id = '33333333-3333-3333-3333-333333333333' and action_type = 'ai_parse') = 1, null;
insert into public._r
select 'refund removed the charge log so a retry is not mistaken for a replay',
       not exists (select 1 from public.ai_parse_log
                    where owner_id = '33333333-3333-3333-3333-333333333333'
                      and idempotency_key = 'aaaaaaaa-0000-0000-0000-000000000002'), null;

-- ── per-IP ceiling ──────────────────────────────────────────────────────────
-- Every call from one ip_hash bumps the throttle row, even when quota refuses,
-- so the 11th call in the hour must be stopped by the IP rule specifically.
do $$
declare i int; v_reason text; v_allowed boolean;
begin
  for i in 1..11 loop
    insert into public.ai_ip_throttle (ip_hash, window_start, count)
      values ('ip-burst', date_trunc('hour', now() at time zone 'utc'), 0)
      on conflict do nothing;
    perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
    select b.allowed, b.reason into v_allowed, v_reason
      from public.begin_ai_parse(gen_random_uuid(), 'ip-burst') b;
  end loop;
  insert into public._r values (
    'per-IP ceiling stops the 11th call in the hour',
    v_allowed is false and v_reason = 'ip_limit',
    coalesce(v_reason, 'allowed'));
end $$;

insert into public._r
select 'per-IP ceiling counted every call, including refused ones',
       (select count from public.ai_ip_throttle where ip_hash = 'ip-burst') = 11, null;

-- ── unauthenticated callers cannot reach the function body ──────────────────
select set_config('request.jwt.claim.sub', '', false);
set role authenticated;
do $$
begin
  begin
    perform 1 from public.begin_ai_parse(gen_random_uuid(), 'ip-x');
    insert into public._r values ('unauthenticated call raises instead of charging', false, 'call succeeded');
  exception when others then
    insert into public._r values ('unauthenticated call raises instead of charging', true, null);
  end;
end $$;
reset role;

-- ── report ──────────────────────────────────────────────────────────────────
\echo ''
\echo '=== PHASE 3 SQL VERIFICATION ==='
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
