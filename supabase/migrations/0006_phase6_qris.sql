-- idempotent: true
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
