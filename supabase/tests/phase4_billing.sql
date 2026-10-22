-- Phase 4 verification: billing tables are unreachable from a browser session,
-- the entitlement lookup is authoritative, and a replayed webhook cannot extend
-- a period twice.

\set ON_ERROR_STOP on

create table if not exists public._r (name text, ok boolean, detail text);
truncate public._r;

insert into auth.users (id, email, raw_user_meta_data) values
  ('55555555-5555-5555-5555-555555555555', 'e@example.test', '{"display_name":"User E"}'),
  ('66666666-6666-6666-6666-666666666666', 'f@example.test', '{"display_name":"User F"}')
on conflict (id) do nothing;

-- ── grants ──────────────────────────────────────────────────────────────────
insert into public._r
select 'anon cannot select billing_orders',
       not has_table_privilege('anon', 'public.billing_orders', 'SELECT'), null;
insert into public._r
select 'authenticated may only read some billing_orders columns',
       -- Phase 7 narrowed this from a table grant to a column list, so the
       -- signature and snap_token stop being readable. The write privileges
       -- must still be absent.
       not has_table_privilege('authenticated', 'public.billing_orders', 'INSERT')
   and not has_table_privilege('authenticated', 'public.billing_orders', 'UPDATE')
   and not has_table_privilege('authenticated', 'public.billing_orders', 'DELETE')
   and has_column_privilege('authenticated', 'public.billing_orders', 'status', 'SELECT')
   and not has_column_privilege('authenticated', 'public.billing_orders', 'qris_signature', 'SELECT'), null;
insert into public._r
select 'authenticated has no access to billing_events',
       not has_table_privilege('authenticated', 'public.billing_events', 'SELECT')
   and not has_table_privilege('authenticated', 'public.billing_events', 'INSERT'), null;
insert into public._r
select 'authenticated may only select entitlements',
       has_table_privilege('authenticated', 'public.entitlements', 'SELECT')
   and not has_table_privilege('authenticated', 'public.entitlements', 'UPDATE'), null;
insert into public._r
select 'anon cannot execute create_billing_order',
       not has_function_privilege('anon', 'public.create_billing_order(text)', 'EXECUTE'), null;
-- Phase 6 replaced the Midtrans notification function with the QRIS one; the
-- grant boundary is the same, so it is asserted here against the live name.
insert into public._r
select 'authenticated cannot execute apply_qris_event',
       not has_function_privilege('authenticated',
         'public.apply_qris_event(text,text,bigint,timestamptz,text)', 'EXECUTE'), null;
insert into public._r
select 'service_role may execute apply_qris_event',
       has_function_privilege('service_role',
         'public.apply_qris_event(text,text,bigint,timestamptz,text)', 'EXECUTE'), null;
insert into public._r
select 'anon cannot execute billing_status',
       not has_function_privilege('anon', 'public.billing_status()', 'EXECUTE'), null;

-- ── default plan is free, and the free limits are unchanged ────────────────
-- Pattern copied from phase3_ai_quota.sql: set_config(..., false) makes the claim
-- session-wide, `set role` switches identity, and every assertion row is written
-- after `reset role` because public._r is not granted to authenticated.
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
set role authenticated;
create temp table _e_free as select * from public.billing_status();
create temp table _e_limits as
  select public.ai_parse_limit() as ai, public.quote_limit() as q, public.market_research_limit() as m;
reset role;

insert into public._r select 'a fresh user is on the free plan',
  (select plan from _e_free) = 'free', (select plan from _e_free);
insert into public._r select 'free plan keeps the 2 parse limit',
  (select ai from _e_limits) = 2, (select ai::text from _e_limits);
insert into public._r select 'free plan keeps the 5 quote limit',
  (select q from _e_limits) = 5, (select q::text from _e_limits);
insert into public._r select 'free plan has no market research quota',
  (select m from _e_limits) = 0, (select m::text from _e_limits);

-- ── a paid order grants Pro, and the limits move ───────────────────────────
-- Inserted directly, not via create_billing_order: that function reads
-- auth.uid(), which is null while this script runs as postgres.
insert into public.billing_orders (owner_id, order_id, plan, amount_idr)
values ('55555555-5555-5555-5555-555555555555', 'QK-20260101-TEST000001', 'pro', 59000);

create temp table _settle as
  select * from public.apply_qris_event('QK-20260101-TEST000001', 'PAID', 59000, now(), 'txn-1');

insert into public._r select 'a valid settlement is applied',
  (select applied from _settle), (select reason from _settle);

select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
set role authenticated;
create temp table _e_pro as select * from public.billing_status();
create temp table _e_pro_limits as
  select public.ai_parse_limit() as ai, public.quote_limit() as q, public.market_research_limit() as m;
reset role;

insert into public._r select 'a settled order moves the user to pro',
  (select plan from _e_pro) = 'pro', (select plan from _e_pro);
insert into public._r select 'pro plan raises the parse limit to 40',
  (select ai from _e_pro_limits) = 40, (select ai::text from _e_pro_limits);
insert into public._r select 'pro plan raises the quote limit to 100',
  (select q from _e_pro_limits) = 100, (select q::text from _e_pro_limits);
insert into public._r select 'pro plan unlocks 10 market researches',
  (select m from _e_pro_limits) = 10, (select m::text from _e_pro_limits);
insert into public._r select 'the order is marked paid',
  (select status from public.billing_orders where order_id = 'QK-20260101-TEST000001') = 'paid', null;

-- ── replay must not extend the period twice ────────────────────────────────
create temp table _period_before as
  select current_period_end from public.entitlements
   where owner_id = '55555555-5555-5555-5555-555555555555';

create temp table _replay as
  select * from public.apply_qris_event('QK-20260101-TEST000001', 'PAID', 59000, now(), 'txn-1');

insert into public._r select 'replaying the same event is refused',
  (select not applied from _replay), (select reason from _replay);
insert into public._r select 'replay names itself a duplicate',
  (select reason from _replay) = 'duplicate', (select reason from _replay);
insert into public._r select 'replay did not extend the paid period',
  (select current_period_end from public.entitlements
    where owner_id = '55555555-5555-5555-5555-555555555555')
  = (select current_period_end from _period_before), null;

-- ── a forged amount is refused ─────────────────────────────────────────────
create temp table _forged as
  select * from public.apply_qris_event('QK-20260101-TEST000001', 'PAID', 1000, now(), 'txn-2');

insert into public._r select 'a mismatched gross amount is refused',
  (select not applied from _forged), (select reason from _forged);
insert into public._r select 'a mismatched amount is named as such',
  (select reason from _forged) = 'amount_mismatch', (select reason from _forged);

-- ── an unknown order is refused, not silently accepted ─────────────────────
create temp table _unknown as
  select * from public.apply_qris_event('QK-20260101-NOSUCHORDER', 'PAID', 59000, now(), 'txn-3');

insert into public._r select 'an unknown order id is refused',
  (select not applied from _unknown) and (select reason from _unknown) = 'unknown_order', (select reason from _unknown);

-- ── tenant isolation ───────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);
set role authenticated;
create temp table _f_status as select * from public.billing_status();
create temp table _f_orders as select count(*) as n from public.billing_orders;
reset role;

insert into public._r select 'another tenant stays on free',
  (select plan from _f_status) = 'free', (select plan from _f_status);
insert into public._r select 'another tenant sees no billing orders',
  (select n from _f_orders) = 0, (select n::text from _f_orders);

-- ── an expired period reads as free without any cron job ───────────────────
update public.entitlements
   set current_period_end = now() - interval '1 day'
 where owner_id = '55555555-5555-5555-5555-555555555555';

select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
set role authenticated;
create temp table _expired as select * from public.billing_status();
create temp table _expired_ai as select public.ai_parse_limit() as ai;
reset role;

insert into public._r select 'a lapsed period reads as free',
  (select plan from _expired) = 'free', (select plan from _expired);
insert into public._r select 'a lapsed period drops the parse limit back to 2',
  (select ai from _expired_ai) = 2, (select ai::text from _expired_ai);

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
