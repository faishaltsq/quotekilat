-- Phase 5 verification: the market-research quota refuses free plans without
-- writing a counter, admits Pro, treats a replayed key as a replay, and stays
-- unreachable for anon.

\set ON_ERROR_STOP on

create table if not exists public._r (name text, ok boolean, detail text);
truncate public._r;

insert into auth.users (id, email, raw_user_meta_data) values
  ('77777777-7777-7777-7777-777777777777', 'g@example.test', '{"display_name":"User G"}'),
  ('88888888-8888-8888-8888-888888888888', 'h@example.test', '{"display_name":"User H"}')
on conflict (id) do nothing;

-- ── grants ──────────────────────────────────────────────────────────────────
insert into public._r
select 'anon cannot execute begin_market_research',
       not has_function_privilege('anon', 'public.begin_market_research(uuid,text)', 'EXECUTE'), null;
insert into public._r
select 'anon cannot execute refund_market_research',
       not has_function_privilege('anon', 'public.refund_market_research(uuid)', 'EXECUTE'), null;
insert into public._r
select 'anon cannot execute market_research_remaining',
       not has_function_privilege('anon', 'public.market_research_remaining()', 'EXECUTE'), null;
insert into public._r
select 'anon cannot read market_research_log',
       not has_table_privilege('anon', 'public.market_research_log', 'SELECT'), null;
insert into public._r
select 'authenticated cannot read market_research_log',
       not has_table_privilege('authenticated', 'public.market_research_log', 'SELECT'), null;

-- ── free plan: refused before the counter or throttle is touched ────────────
select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', false);
set role authenticated;
create temp table _free as
  select * from public.begin_market_research('11111111-1111-1111-1111-111111111111', 'ip-free');
reset role;

insert into public._r select 'a free plan is refused with reason quota',
  (select not allowed and reason = 'quota' from _free), (select reason from _free);
insert into public._r select 'a free refusal writes no usage row',
  (select count(*) from public.usage_counters
    where owner_id = '77777777-7777-7777-7777-777777777777') = 0,
  (select count(*)::text from public.usage_counters
    where owner_id = '77777777-7777-7777-7777-777777777777');
insert into public._r select 'a free refusal leaves no throttle row',
  (select count(*) from public.ai_ip_throttle where ip_hash = 'ip-free') = 0,
  (select count(*)::text from public.ai_ip_throttle where ip_hash = 'ip-free');

-- ── pro plan: allowed, and nine of ten remain ───────────────────────────────
insert into public.entitlements (owner_id, plan, current_period_end)
values ('88888888-8888-8888-8888-888888888888', 'pro', now() + interval '30 days')
on conflict (owner_id) do update
  set plan = excluded.plan, current_period_end = excluded.current_period_end;

select set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', false);
set role authenticated;
create temp table _pro as
  select * from public.begin_market_research('22222222-2222-2222-2222-222222222222', 'ip-pro');
reset role;

insert into public._r select 'a pro plan is allowed and leaves nine',
  (select allowed and remaining = 9 from _pro), (select remaining::text from _pro);

-- ── replay: same key, no extra consumption ──────────────────────────────────
select set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', false);
set role authenticated;
create temp table _replay as
  select * from public.begin_market_research('22222222-2222-2222-2222-222222222222', 'ip-pro');
reset role;

insert into public._r select 'a replayed key reports replay',
  (select allowed and reason = 'replay' from _replay), (select reason from _replay);
insert into public._r select 'a replay does not consume another unit',
  (select remaining = 9 from _replay), (select remaining::text from _replay);
insert into public._r select 'a replay leaves the counter at one',
  (select count = 1 from public.usage_counters
    where owner_id = '88888888-8888-8888-8888-888888888888' and action_type = 'market_research'),
  (select count::text from public.usage_counters
    where owner_id = '88888888-8888-8888-8888-888888888888' and action_type = 'market_research');

-- ── refund: a failed provider call gives the unit back ──────────────────────
select set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', false);
set role authenticated;
create temp table _refund as
  select public.refund_market_research('22222222-2222-2222-2222-222222222222') as remaining;
reset role;

insert into public._r select 'a refund restores the unit',
  (select remaining = 10 from _refund), (select remaining::text from _refund);

-- ── report ─────────────────────────────────────────────────────────────────
select name, case when ok then 'PASS' else 'FAIL' end as result, detail
  from public._r order by name;
do $$
declare v_failed integer;
begin
  select count(*) into v_failed from public._r where not ok;
  if v_failed > 0 then
    raise exception '% assertion(s) failed', v_failed;
  end if;
end
$$;
