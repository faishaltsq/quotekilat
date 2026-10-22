-- Phase 6 verification: the KlikQRIS path refuses what it must and grants once.
-- Runs against a database that already has phases 2-5 applied.

\set ON_ERROR_STOP on

create table if not exists public._r (name text, ok boolean, detail text);
truncate public._r;

insert into auth.users (id, email, raw_user_meta_data) values
  ('99999999-9999-9999-9999-999999999999', 'q@example.test', '{"display_name":"User Q"}')
on conflict (id) do nothing;

-- ── grants ─────────────────────────────────────────────────────────────────
insert into public._r select 'anon cannot execute apply_qris_event',
  not has_function_privilege('anon', 'public.apply_qris_event(text,text,bigint,timestamptz,text)', 'EXECUTE'), null;
insert into public._r select 'authenticated cannot execute apply_qris_event',
  not has_function_privilege('authenticated', 'public.apply_qris_event(text,text,bigint,timestamptz,text)', 'EXECUTE'), null;
insert into public._r select 'anon cannot execute attach_qris_session',
  not has_function_privilege('anon', 'public.attach_qris_session(text,text,text,text,bigint,timestamptz)', 'EXECUTE'), null;
insert into public._r select 'service_role can execute apply_qris_event',
  has_function_privilege('service_role', 'public.apply_qris_event(text,text,bigint,timestamptz,text)', 'EXECUTE'), null;
insert into public._r select 'the old midtrans signature is gone',
  to_regprocedure('public.apply_billing_event(text,text,text,text,text,text,text)') is null, null;

-- ── an order created by the buyer ──────────────────────────────────────────
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', false);
set role authenticated;
create temp table _ord as select * from public.create_billing_order('pro');
reset role;

insert into public._r select 'a new order starts pending at the plan price',
  (select status = 'pending' and amount_idr = 59000 from _ord), (select amount_idr::text from _ord);

-- ── attach a QRIS session: the gateway adds a unique code ──────────────────
-- Attaching is a server act since phase 7: the checkout route calls it with the
-- service key, because writing the signature and total is what authorises a
-- payment. Running it as `authenticated` here would (correctly) be refused.
select public.attach_qris_session(
  (select order_id from _ord), 'sig-abc123', '00020101021226...', 'https://qr.example/1.png',
  59042, now() + interval '30 minutes');

insert into public._r select 'the session stores the exact total, not the plan price',
  (select total_idr = 59042 from public.billing_orders
    where order_id = (select order_id from _ord)), null;
insert into public._r select 'the session stores the signature the webhook will compare',
  (select qris_signature = 'sig-abc123' from public.billing_orders
    where order_id = (select order_id from _ord)), null;

-- ── underpayment must be refused ───────────────────────────────────────────
insert into public._r select 'a short payment is refused',
  (select not applied and reason = 'amount_mismatch'
     from public.apply_qris_event((select order_id from _ord), 'PAID', 59000, now(), 'ref-1')),
  (select reason from public.apply_qris_event((select order_id from _ord), 'PAID', 59000, now(), 'ref-1'));

-- ── an unknown order is refused ────────────────────────────────────────────
insert into public._r select 'an unknown order is refused',
  (select not applied and reason = 'unknown_order'
     from public.apply_qris_event('QK-20260101-ZZZZZZZZZZ', 'PAID', 59042, now(), 'ref-2')), null;

-- ── the correct amount grants once ─────────────────────────────────────────
insert into public._r select 'the exact total grants pro',
  (select applied and plan = 'pro' and current_period_end is not null
     from public.apply_qris_event((select order_id from _ord), 'PAID', 59042, now(), 'ref-3')), null;

insert into public._r select 'the order is marked paid with a paid_at',
  (select status = 'paid' and paid_at is not null from public.billing_orders
    where order_id = (select order_id from _ord)), null;

-- ── a replay must not extend the period again ──────────────────────────────
create temp table _before as
  select current_period_end from public.entitlements
   where owner_id = '99999999-9999-9999-9999-999999999999';

insert into public._r select 'a replayed notification is a duplicate',
  (select not applied and reason = 'duplicate'
     from public.apply_qris_event((select order_id from _ord), 'PAID', 59042, now(), 'ref-3')), null;

insert into public._r select 'a replay does not extend the period',
  (select e.current_period_end = b.current_period_end
     from public.entitlements e, _before b
    where e.owner_id = '99999999-9999-9999-9999-999999999999'), null;

-- ── a late EXPIRED must not undo a paid order ──────────────────────────────
insert into public._r select 'a late expiry does not flip a paid order',
  (select not applied from public.apply_qris_event((select order_id from _ord), 'EXPIRED', 59042, now(), 'ref-4'))
  and (select status = 'paid' from public.billing_orders where order_id = (select order_id from _ord)), null;

-- ── plan entitlements follow ───────────────────────────────────────────────
insert into public._r select 'pro raises every limit',
  (select quote_limit() = 100 and ai_parse_limit() = 40 and market_research_limit() = 10), null;

-- ── the buyer can read their own order, and only their own ─────────────────
select set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', false);
set role authenticated;
create temp table _read as select * from public.billing_order((select order_id from _ord));
reset role;
insert into public._r select 'the buyer reads their own order back',
  (select count(*) = 1 and max(status) = 'paid' from _read), null;

select set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', false);
set role authenticated;
create temp table _other as select * from public.billing_order((select order_id from _ord));
reset role;
insert into public._r select 'another user reads nothing',
  (select count(*) = 0 from _other), null;

-- ── expiry sweep only touches stale pending orders ─────────────────────────
insert into public.billing_orders (owner_id, order_id, plan, amount_idr, status, expired_at)
values ('99999999-9999-9999-9999-999999999999', 'QK-20260101-AAAAAAAAAA', 'pro', 59000, 'pending', now() - interval '1 hour')
on conflict (order_id) do nothing;

create temp table _sweep as select public.expire_stale_billing_orders() as n;

insert into public._r select 'the sweep expires a stale pending order',
  (select n >= 1 from _sweep)
  and (select status = 'expired' from public.billing_orders where order_id = 'QK-20260101-AAAAAAAAAA'),
  (select n::text from _sweep);

insert into public._r select 'the sweep leaves a paid order alone',
  (select status = 'paid' from public.billing_orders where order_id = (select order_id from _ord)), null;

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
