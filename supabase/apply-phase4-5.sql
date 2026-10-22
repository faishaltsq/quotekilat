-- Phase 4 + Phase 5 for a database that already has the Phase 2/3 schema.
-- Safe to re-run: every statement is guarded (if not exists / or replace).
-- Use this instead of apply-all.sql when profiles already exists.

-- Phase 4: Midtrans sandbox billing, server-authoritative entitlements, and
-- plan-aware quotas. No client can move itself to Pro: only apply_billing_event
-- does that, and only service_role may execute it.

create table if not exists public.plan_prices (
  plan text primary key check (plan in ('pro')),
  amount_idr bigint not null check (amount_idr between 1000 and 100000000)
);

insert into public.plan_prices (plan, amount_idr) values ('pro', 59000)
on conflict (plan) do nothing;

comment on table public.plan_prices is
  'Server-chosen price. A client can never supply an amount, so a forged checkout cannot underpay.';

create table if not exists public.billing_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  order_id text not null unique check (order_id ~ '^QK-[0-9]{8}-[A-Z0-9]{10}$'),
  plan text not null check (plan in ('pro')),
  amount_idr bigint not null check (amount_idr > 0),
  status text not null default 'pending' check (status in ('pending','paid','failed','expired','refunded')),
  snap_token text check (snap_token is null or char_length(snap_token) <= 256),
  redirect_url text check (redirect_url is null or char_length(redirect_url) <= 512),
  paid_at timestamptz,
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_orders_owner_idx on public.billing_orders (owner_id, created_at desc);

create table if not exists public.billing_events (
  order_id text not null,
  transaction_status text not null,
  status_code text not null,
  fraud_status text not null default '',
  gross_amount text not null,
  transaction_id text,
  payment_type text,
  received_at timestamptz not null default now(),
  primary key (order_id, transaction_status, status_code, fraud_status)
);

comment on table public.billing_events is
  'Every accepted notification. The primary key is the idempotency ledger: a provider retry inserts nothing, so a period cannot be extended twice.';

create table if not exists public.entitlements (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','pro')),
  current_period_end timestamptz,
  source_order_id text,
  updated_at timestamptz not null default now()
);

drop trigger if exists billing_orders_touch on public.billing_orders;
create trigger billing_orders_touch before update on public.billing_orders
  for each row execute function public.touch_updated_at();

alter table public.plan_prices enable row level security;
alter table public.billing_orders enable row level security;
alter table public.billing_events enable row level security;
alter table public.entitlements enable row level security;

-- ── RLS ────────────────────────────────────────────────────────────────────
drop policy if exists billing_orders_select_own on public.billing_orders;
create policy billing_orders_select_own on public.billing_orders
  for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists entitlements_select_own on public.entitlements;
create policy entitlements_select_own on public.entitlements
  for select to authenticated using (owner_id = (select auth.uid()));

drop policy if exists plan_prices_select_all on public.plan_prices;
create policy plan_prices_select_all on public.plan_prices
  for select to authenticated using (true);

-- ── grants: writes only through SECURITY DEFINER functions ────────────────
revoke all on public.billing_orders from anon;
revoke all on public.billing_orders from authenticated;
grant select on public.billing_orders to authenticated;

revoke all on public.billing_events from anon;
revoke all on public.billing_events from authenticated;

revoke all on public.entitlements from anon;
revoke all on public.entitlements from authenticated;
grant select on public.entitlements to authenticated;

revoke all on public.plan_prices from anon;
revoke all on public.plan_prices from authenticated;
grant select on public.plan_prices to authenticated;

-- ── effective plan ─────────────────────────────────────────────────────────
-- A Pro row whose period has ended reads as free. Nothing has to run a cron
-- job for a lapsed subscription to lose its entitlements.
create or replace function public.current_plan()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select e.plan from public.entitlements e
     where e.owner_id = (select auth.uid())
       and (e.current_period_end is null or e.current_period_end > now())
  ), 'free')
$$;

revoke execute on function public.current_plan() from public;
revoke execute on function public.current_plan() from anon;
grant execute on function public.current_plan() to authenticated;

-- ── plan-aware quotas ──────────────────────────────────────────────────────
create or replace function public.ai_parse_limit()
returns integer
language sql
stable
security definer
set search_path = ''
as $$ select case public.current_plan() when 'pro' then 40 else 2 end $$;

create or replace function public.quote_limit()
returns integer
language sql
stable
security definer
set search_path = ''
as $$ select case public.current_plan() when 'pro' then 100 else 5 end $$;

create or replace function public.market_research_limit()
returns integer
language sql
stable
security definer
set search_path = ''
as $$ select case public.current_plan() when 'pro' then 10 else 0 end $$;

revoke execute on function public.quote_limit() from public;
revoke execute on function public.quote_limit() from anon;
grant execute on function public.quote_limit() to authenticated;

revoke execute on function public.market_research_limit() from public;
revoke execute on function public.market_research_limit() from anon;
grant execute on function public.market_research_limit() to authenticated;

-- ── save_quote now reads quote_limit(); drop the free-only name ────────────
create or replace function public.save_quote(
  p_kind text,
  p_title text,
  p_items jsonb,
  p_cost_breakdown jsonb,
  p_target_margin_bps integer,
  p_computed_price_idr bigint,
  p_actual_margin_bps integer,
  p_discount_amount_idr bigint,
  p_customer_name text,
  p_business_profile_id uuid,
  p_idempotency_key uuid
) returns public.quotes
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_owner uuid := (select auth.uid());
  v_period text := to_char(now() at time zone 'utc', 'YYYYMM');
  v_quote public.quotes;
  v_count integer;
begin
  if v_owner is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  insert into public.quotes (
    owner_id, business_profile_id, customer_name, kind, title, items,
    cost_breakdown, target_margin_bps, computed_price_idr, actual_margin_bps,
    discount_amount_idr, idempotency_key
  ) values (
    v_owner, p_business_profile_id, p_customer_name, p_kind, p_title, p_items,
    p_cost_breakdown, p_target_margin_bps, p_computed_price_idr, p_actual_margin_bps,
    p_discount_amount_idr, p_idempotency_key
  )
  on conflict (owner_id, idempotency_key) do nothing
  returning * into v_quote;

  if v_quote.id is null then
    select * into v_quote from public.quotes
      where owner_id = v_owner and idempotency_key = p_idempotency_key;
    return v_quote;
  end if;

  insert into public.usage_counters as c (owner_id, period_yyyymm, action_type, count)
  values (v_owner, v_period, 'quote_saved', 1)
  on conflict (owner_id, period_yyyymm, action_type) do update
    set count = c.count + 1, updated_at = now()
    where c.count < public.quote_limit()
  returning count into v_count;

  if v_count is null then
    raise exception 'QUOTA_EXCEEDED' using errcode = 'P0001';
  end if;

  return v_quote;
end;
$$;

revoke execute on function public.save_quote(text, text, jsonb, jsonb, integer, bigint, integer, bigint, text, uuid, uuid) from public;
revoke execute on function public.save_quote(text, text, jsonb, jsonb, integer, bigint, integer, bigint, text, uuid, uuid) from anon;
grant execute on function public.save_quote(text, text, jsonb, jsonb, integer, bigint, integer, bigint, text, uuid, uuid) to authenticated;

create or replace function public.remaining_quota() returns integer
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select greatest(
    public.quote_limit() - coalesce((
      select count from public.usage_counters
      where owner_id = (select auth.uid())
        and period_yyyymm = to_char(now() at time zone 'utc', 'YYYYMM')
        and action_type = 'quote_saved'
    ), 0),
    0
  )
$$;

revoke execute on function public.remaining_quota() from public;
revoke execute on function public.remaining_quota() from anon;
grant execute on function public.remaining_quota() to authenticated;

drop function if exists public.free_quote_limit();

-- ── one read for the whole billing surface ─────────────────────────────────
create or replace function public.billing_status()
returns table (
  plan text,
  current_period_end timestamptz,
  ai_parse_limit integer,
  ai_parse_remaining integer,
  quote_limit integer,
  quote_remaining integer,
  market_research_limit integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.plan,
         e.current_period_end,
         public.ai_parse_limit(),
         public.ai_parse_remaining(),
         public.quote_limit(),
         public.remaining_quota(),
         public.market_research_limit()
    from (select public.current_plan() as plan) p
    left join public.entitlements e on e.owner_id = (select auth.uid())
$$;

revoke execute on function public.billing_status() from public;
revoke execute on function public.billing_status() from anon;
grant execute on function public.billing_status() to authenticated;

-- ── order creation: price comes from plan_prices, never from the caller ────
create or replace function public.create_billing_order(p_plan text)
returns public.billing_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_price bigint;
  v_row public.billing_orders;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select amount_idr into v_price from public.plan_prices where plan = p_plan;
  if v_price is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  -- Reuse a fresh unpaid order so a double click cannot open two transactions.
  select * into v_row from public.billing_orders o
   where o.owner_id = v_uid and o.plan = p_plan and o.status = 'pending'
     and o.created_at > now() - interval '30 minutes'
   order by o.created_at desc
   limit 1;
  if v_row.id is not null then
    return v_row;
  end if;

  insert into public.billing_orders (owner_id, order_id, plan, amount_idr)
  values (
    v_uid,
    'QK-' || to_char(now(), 'YYYYMMDD') || '-'
      || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    p_plan,
    v_price
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.create_billing_order(text) from public;
revoke execute on function public.create_billing_order(text) from anon;
grant execute on function public.create_billing_order(text) to authenticated;

create or replace function public.attach_billing_session(
  p_order_id text,
  p_snap_token text,
  p_redirect_url text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.billing_orders o
     set snap_token = p_snap_token,
         redirect_url = p_redirect_url
   where o.order_id = p_order_id
     and o.owner_id = (select auth.uid())
     and o.status = 'pending';
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.attach_billing_session(text, text, text) from public;
revoke execute on function public.attach_billing_session(text, text, text) from anon;
grant execute on function public.attach_billing_session(text, text, text) to authenticated;

-- ── the only path to Pro ───────────────────────────────────────────────────
-- service_role only. The webhook verifies the Midtrans signature first; this
-- function then re-checks the amount against the stored order and refuses a
-- replayed notification, so a leaked webhook URL still cannot grant a free
-- subscription.
create or replace function public.apply_billing_event(
  p_order_id text,
  p_transaction_status text,
  p_status_code text,
  p_gross_amount text,
  p_fraud_status text,
  p_transaction_id text,
  p_payment_type text
) returns table (applied boolean, plan text, current_period_end timestamptz, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.billing_orders;
  v_inserted boolean;
  v_next_status text;
  v_period_end timestamptz;
begin
  select * into v_order from public.billing_orders o
   where o.order_id = p_order_id
   for update;

  if v_order.id is null then
    applied := false; plan := null; current_period_end := null; reason := 'unknown_order';
    return next; return;
  end if;

  -- "59000.00" from Midtrans vs 59000 in the row: compare numerically.
  if p_gross_amount !~ '^[0-9]+(\.[0-9]{1,2})?$'
     or p_gross_amount::numeric <> v_order.amount_idr then
    applied := false; plan := null; current_period_end := null; reason := 'amount_mismatch';
    return next; return;
  end if;

  insert into public.billing_events (
    order_id, transaction_status, status_code, fraud_status, gross_amount, transaction_id, payment_type
  ) values (
    p_order_id, p_transaction_status, p_status_code, coalesce(p_fraud_status, ''),
    p_gross_amount, p_transaction_id, p_payment_type
  )
  on conflict do nothing;
  v_inserted := found;

  if not v_inserted then
    applied := false;
    select e.plan, e.current_period_end into plan, current_period_end
      from public.entitlements e where e.owner_id = v_order.owner_id;
    reason := 'duplicate';
    return next; return;
  end if;

  if p_transaction_status = 'settlement'
     or (p_transaction_status = 'capture' and coalesce(p_fraud_status, '') = 'accept') then
    v_next_status := 'paid';

    insert into public.entitlements as e (owner_id, plan, current_period_end, source_order_id)
    values (v_order.owner_id, 'pro', now() + interval '1 month', p_order_id)
    on conflict (owner_id) do update
      set plan = 'pro',
          current_period_end = greatest(coalesce(e.current_period_end, now()), now()) + interval '1 month',
          source_order_id = p_order_id,
          updated_at = now()
    returning e.current_period_end into v_period_end;

    update public.billing_orders o
       set status = 'paid', paid_at = now()
     where o.id = v_order.id;

    applied := true;
    plan := 'pro';
    current_period_end := v_period_end;
    reason := null;
    return next; return;
  end if;

  v_next_status := case
    when p_transaction_status = 'pending' then 'pending'
    when p_transaction_status in ('deny', 'cancel', 'failure') then 'failed'
    when p_transaction_status = 'expire' then 'expired'
    when p_transaction_status in ('refund', 'partial_refund') then 'refunded'
    else null
  end;

  if v_next_status is null then
    applied := false;
    select e.plan, e.current_period_end into plan, current_period_end
      from public.entitlements e where e.owner_id = v_order.owner_id;
    reason := 'ignored_status';
    return next; return;
  end if;

  update public.billing_orders o set status = v_next_status where o.id = v_order.id;

  if v_next_status = 'refunded' then
    update public.entitlements e
       set plan = 'free', current_period_end = null, updated_at = now()
     where e.owner_id = v_order.owner_id;
  end if;

  select e.plan, e.current_period_end into plan, current_period_end
    from public.entitlements e where e.owner_id = v_order.owner_id;

  applied := true;
  reason := v_next_status;
  return next;
end;
$$;

revoke execute on function public.apply_billing_event(text, text, text, text, text, text, text) from public;
revoke execute on function public.apply_billing_event(text, text, text, text, text, text, text) from anon;
revoke execute on function public.apply_billing_event(text, text, text, text, text, text, text) from authenticated;
grant execute on function public.apply_billing_event(text, text, text, text, text, text, text) to service_role;

-- Phase 5: server-enforced quota for Market Insights. Mirrors begin_ai_parse so
-- the two counters behave identically under retry, concurrency and refund.

create table if not exists public.market_research_log (
  owner_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, idempotency_key)
);

alter table public.market_research_log enable row level security;
revoke all on public.market_research_log from anon, authenticated;

create or replace function public.market_research_remaining()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_used integer;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select coalesce(c.count, 0) into v_used
    from public.usage_counters c
   where c.owner_id = v_uid
     and c.period_yyyymm = to_char(now() at time zone 'utc', 'YYYYMM')
     and c.action_type = 'market_research';
  return greatest(public.market_research_limit() - coalesce(v_used, 0), 0);
end;
$$;

revoke execute on function public.market_research_remaining() from public;
revoke execute on function public.market_research_remaining() from anon;
grant execute on function public.market_research_remaining() to authenticated;

create or replace function public.begin_market_research(p_idempotency_key uuid, p_ip_hash text)
returns table (allowed boolean, remaining integer, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_period text := to_char(now() at time zone 'utc', 'YYYYMM');
  v_window timestamptz := date_trunc('hour', now() at time zone 'utc');
  v_limit integer := public.market_research_limit();
  v_used integer := 0;
  v_count integer;
  v_replay boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select exists (
    select 1 from public.market_research_log l
     where l.owner_id = v_uid and l.idempotency_key = p_idempotency_key
  ) into v_replay;

  select coalesce(c.count, 0) into v_used
    from public.usage_counters c
   where c.owner_id = v_uid and c.period_yyyymm = v_period and c.action_type = 'market_research';

  if v_replay then
    allowed := true; remaining := greatest(v_limit - coalesce(v_used, 0), 0); reason := 'replay';
    return next; return;
  end if;

  -- A zero limit must refuse before touching the IP throttle, otherwise a free
  -- user would be told "ip_limit" instead of "quota" and the UI would show the
  -- wrong explanation.
  if v_limit = 0 then
    allowed := false; remaining := 0; reason := 'quota';
    return next; return;
  end if;

  insert into public.ai_ip_throttle as t (ip_hash, window_start, count)
  values (coalesce(nullif(p_ip_hash, ''), 'unknown'), v_window, 1)
  on conflict (ip_hash, window_start) do update set count = t.count + 1
  returning t.count into v_count;

  if v_count > 10 then
    allowed := false; remaining := greatest(v_limit - coalesce(v_used, 0), 0); reason := 'ip_limit';
    return next; return;
  end if;

  insert into public.usage_counters as c (owner_id, period_yyyymm, action_type, count)
  values (v_uid, v_period, 'market_research', 1)
  on conflict (owner_id, period_yyyymm, action_type)
  do update set count = c.count + 1, updated_at = now()
  where c.count < v_limit
  returning c.count into v_used;

  if v_used is null then
    allowed := false; remaining := 0; reason := 'quota';
    return next; return;
  end if;

  insert into public.market_research_log (owner_id, idempotency_key)
  values (v_uid, p_idempotency_key)
  on conflict do nothing;

  allowed := true; remaining := v_limit - v_used; reason := null;
  return next;
end;
$$;

revoke execute on function public.begin_market_research(uuid, text) from public;
revoke execute on function public.begin_market_research(uuid, text) from anon;
grant execute on function public.begin_market_research(uuid, text) to authenticated;

create or replace function public.refund_market_research(p_idempotency_key uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_period text := to_char(now() at time zone 'utc', 'YYYYMM');
  v_deleted boolean;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;

  delete from public.market_research_log l
   where l.owner_id = v_uid and l.idempotency_key = p_idempotency_key;
  v_deleted := found;

  if v_deleted then
    update public.usage_counters c
       set count = greatest(c.count - 1, 0), updated_at = now()
     where c.owner_id = v_uid and c.period_yyyymm = v_period and c.action_type = 'market_research';
  end if;

  return public.market_research_remaining();
end;
$$;

revoke execute on function public.refund_market_research(uuid) from public;
revoke execute on function public.refund_market_research(uuid) from anon;
grant execute on function public.refund_market_research(uuid) to authenticated;

-- Phase 6: replace the Midtrans Snap session with KlikQRIS QRIS payment.
--
-- Snap handed back a token plus a redirect URL the browser could leave for. QRIS
-- returns an image the buyer scans in place, plus a per-order signature that is
-- the only thing the webhook trusts. The order row therefore stores what the
-- webhook needs to verify a notification: the signature issued at creation and
-- the exact total the buyer must pay (which the gateway may bump by a unique
-- code, so it is not always amount_idr).

alter table public.billing_orders
  add column if not exists qris_signature text
    check (qris_signature is null or char_length(qris_signature) <= 256),
  add column if not exists qris_payload text
    check (qris_payload is null or char_length(qris_payload) <= 8192),
  add column if not exists qris_image_url text
    check (qris_image_url is null or char_length(qris_image_url) <= 1024),
  add column if not exists total_idr bigint
    check (total_idr is null or total_idr > 0),
  add column if not exists expired_at timestamptz;

comment on column public.billing_orders.qris_signature is
  'Signature issued by KlikQRIS at creation. The webhook compares this timing-safe and refuses an order with none.';
comment on column public.billing_orders.total_idr is
  'Exact amount the buyer pays, including the gateway unique code. Never amount_idr.';

-- The Snap columns have no meaning for QRIS. They stay in place (a migration that
-- drops columns is not replayable) but stop being written.
comment on column public.billing_orders.snap_token is
  'Unused since phase 6: KlikQRIS replaced Midtrans Snap.';
comment on column public.billing_orders.redirect_url is
  'Unused since phase 6: QRIS is scanned in place, there is no redirect.';

-- ── attach the gateway response to a pending order ─────────────────────────
create or replace function public.attach_qris_session(
  p_order_id text,
  p_signature text,
  p_payload text,
  p_image_url text,
  p_total_idr bigint,
  p_expired_at timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.billing_orders o
     set qris_signature = p_signature,
         qris_payload = p_payload,
         qris_image_url = p_image_url,
         total_idr = p_total_idr,
         expired_at = p_expired_at
   where o.order_id = p_order_id
     and o.owner_id = (select auth.uid())
     and o.status = 'pending';
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.attach_qris_session(text, text, text, text, bigint, timestamptz) from public;
revoke execute on function public.attach_qris_session(text, text, text, text, bigint, timestamptz) from anon;
grant execute on function public.attach_qris_session(text, text, text, text, bigint, timestamptz) to authenticated;

-- ── the only path to Pro, now driven by a KlikQRIS notification ────────────
-- The webhook has already proved the signature matches the stored one. This
-- function re-checks the amount against the stored order and refuses a replayed
-- notification, so a leaked webhook URL still cannot grant a free subscription.
--
-- Dropped first because the argument list changed; create or replace cannot
-- rename or retype parameters.
drop function if exists public.apply_billing_event(text, text, text, text, text, text, text);

create or replace function public.apply_qris_event(
  p_order_id text,
  p_status text,
  p_total_amount bigint,
  p_paid_at timestamptz,
  p_gateway_ref text
) returns table (applied boolean, plan text, current_period_end timestamptz, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.billing_orders;
  v_inserted boolean;
  v_period_end timestamptz;
  v_expected bigint;
begin
  select * into v_order from public.billing_orders o
   where o.order_id = p_order_id
   for update;

  if v_order.id is null then
    applied := false; plan := null; current_period_end := null; reason := 'unknown_order';
    return next; return;
  end if;

  -- The buyer must pay what the order said, including any unique code. A zero
  -- means the gateway did not report an amount; that is refused rather than
  -- trusted, because it would let a one-rupiah payment settle a real order.
  v_expected := coalesce(v_order.total_idr, v_order.amount_idr);
  if p_total_amount is null or p_total_amount <> v_expected then
    applied := false; plan := null; current_period_end := null; reason := 'amount_mismatch';
    return next; return;
  end if;

  insert into public.billing_events (
    order_id, transaction_status, status_code, fraud_status, gross_amount, transaction_id, payment_type
  ) values (
    p_order_id, p_status, '200', '', p_total_amount::text, p_gateway_ref, 'qris'
  )
  on conflict do nothing;
  v_inserted := found;

  if not v_inserted then
    applied := false;
    select e.plan, e.current_period_end into plan, current_period_end
      from public.entitlements e where e.owner_id = v_order.owner_id;
    reason := 'duplicate';
    return next; return;
  end if;

  if upper(p_status) in ('PAID', 'SUCCESS', 'SETTLEMENT') then
    insert into public.entitlements as e (owner_id, plan, current_period_end, source_order_id)
    values (v_order.owner_id, 'pro', now() + interval '1 month', p_order_id)
    on conflict (owner_id) do update
      set plan = 'pro',
          current_period_end = greatest(coalesce(e.current_period_end, now()), now()) + interval '1 month',
          source_order_id = p_order_id,
          updated_at = now()
    returning e.current_period_end into v_period_end;

    update public.billing_orders o
       set status = 'paid', paid_at = coalesce(p_paid_at, now())
     where o.id = v_order.id;

    applied := true;
    plan := 'pro';
    current_period_end := v_period_end;
    reason := null;
    return next; return;
  end if;

  if upper(p_status) = 'EXPIRED' then
    -- Guarded on 'pending': a late EXPIRED must not flip an already-paid order
    -- back, or the next PAID delivery would pass the duplicate check and grant
    -- the plan a second time.
    update public.billing_orders o
       set status = 'expired'
     where o.id = v_order.id and o.status = 'pending';

    applied := found;
    select e.plan, e.current_period_end into plan, current_period_end
      from public.entitlements e where e.owner_id = v_order.owner_id;
    reason := 'expired';
    return next; return;
  end if;

  if upper(p_status) in ('FAILED', 'CANCELLED', 'CANCEL') then
    update public.billing_orders o
       set status = 'failed'
     where o.id = v_order.id and o.status = 'pending';
    applied := found;
    select e.plan, e.current_period_end into plan, current_period_end
      from public.entitlements e where e.owner_id = v_order.owner_id;
    reason := 'failed';
    return next; return;
  end if;

  applied := false;
  select e.plan, e.current_period_end into plan, current_period_end
    from public.entitlements e where e.owner_id = v_order.owner_id;
  reason := 'ignored_status';
  return next;
end;
$$;

revoke execute on function public.apply_qris_event(text, text, bigint, timestamptz, text) from public;
revoke execute on function public.apply_qris_event(text, text, bigint, timestamptz, text) from anon;
revoke execute on function public.apply_qris_event(text, text, bigint, timestamptz, text) from authenticated;
grant execute on function public.apply_qris_event(text, text, bigint, timestamptz, text) to service_role;

-- ── read the QRIS session so a returning browser can show the same code ────
create or replace function public.billing_order(p_order_id text)
returns table (
  order_id text,
  status text,
  plan text,
  amount_idr bigint,
  total_idr bigint,
  qris_image_url text,
  qris_payload text,
  expired_at timestamptz,
  paid_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select o.order_id, o.status, o.plan, o.amount_idr, o.total_idr,
           o.qris_image_url, o.qris_payload, o.expired_at, o.paid_at
      from public.billing_orders o
     where o.order_id = p_order_id
       and o.owner_id = (select auth.uid());
end;
$$;

revoke execute on function public.billing_order(text) from public;
revoke execute on function public.billing_order(text) from anon;
grant execute on function public.billing_order(text) to authenticated;

-- Expired orders must stop accepting payment. A sweep the route can call keeps
-- the rule in one place instead of duplicating the interval in the UI.
create or replace function public.expire_stale_billing_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.billing_orders o
     set status = 'expired'
   where o.status = 'pending'
     and coalesce(o.expired_at, o.expires_at) < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.expire_stale_billing_orders() from public;
revoke execute on function public.expire_stale_billing_orders() from anon;
revoke execute on function public.expire_stale_billing_orders() from authenticated;
grant execute on function public.expire_stale_billing_orders() to service_role;
