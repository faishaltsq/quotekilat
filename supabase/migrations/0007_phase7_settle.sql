-- idempotent: true
-- Phase 7: close the self-service Pro escalation, and confirm payments without
-- a dashboard webhook.
--
-- Phase 6 let a buyer call attach_qris_session themselves. That function writes
-- the signature and total_idr the webhook later trusts, so a buyer could set
-- total_idr = 1 and a signature of their choosing, POST that signature to the
-- public webhook, and have the service role grant Pro for one rupiah. Verified
-- against the live database before this migration: the buyer call returned 204.
--
-- The function is now service-role only, and the signature stops being readable
-- by its owner. Neither is needed by the browser: the checkout route attaches
-- the session with the service key, and the order read path is billing_order().

-- ── 1. attaching the gateway response is a server act ──────────────────────
revoke execute on function public.attach_qris_session(text, text, text, text, bigint, timestamptz) from authenticated;
revoke execute on function public.attach_qris_session(text, text, text, text, bigint, timestamptz) from anon;
revoke execute on function public.attach_qris_session(text, text, text, text, bigint, timestamptz) from public;
grant execute on function public.attach_qris_session(text, text, text, text, bigint, timestamptz) to service_role;

-- ── 2. the signature is not the buyer's business ───────────────────────────
-- The table-level grant in phase 4 is `select` on every column, which includes
-- qris_signature. RLS still limits rows to the owner, but the owner is exactly
-- who must not read it. Column grants are subtractive here: authenticated keeps
-- the columns it needs, and loses the two secrets.
revoke select on public.billing_orders from authenticated;
grant select (
  id, owner_id, order_id, plan, amount_idr, status, created_at, updated_at,
  paid_at, expires_at, total_idr, qris_image_url, qris_payload, expired_at
) on public.billing_orders to authenticated;

comment on column public.billing_orders.qris_signature is
  'Server-only. Writing it is the act that authorises a settlement, so neither the buyer nor the anon role may read or write it.';

-- ── 3. attach is idempotent so a retried checkout cannot half-write ────────
-- A second attach for the same order overwrites the previous session, which is
-- what a "buat ulang" click means: the buyer gets a fresh QR and the old
-- signature stops matching. Only a pending order may be re-attached.
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
  if p_signature is null or length(p_signature) = 0 then
    raise exception 'SIGNATURE_REQUIRED' using errcode = 'P0001';
  end if;
  if p_total_idr is null or p_total_idr <= 0 then
    raise exception 'INVALID_TOTAL' using errcode = 'P0001';
  end if;

  update public.billing_orders o
     set qris_signature = p_signature,
         qris_payload = p_payload,
         qris_image_url = p_image_url,
         total_idr = p_total_idr,
         expired_at = p_expired_at
   where o.order_id = p_order_id
     and o.status = 'pending';
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.attach_qris_session(text, text, text, text, bigint, timestamptz) from authenticated;
revoke execute on function public.attach_qris_session(text, text, text, text, bigint, timestamptz) from anon;
revoke execute on function public.attach_qris_session(text, text, text, text, bigint, timestamptz) from public;
grant execute on function public.attach_qris_session(text, text, text, text, bigint, timestamptz) to service_role;

-- ── 4. reading an order for settlement is a server act ─────────────────────
-- KlikQRIS has no webhook field in its dashboard, so nothing calls the webhook
-- route and no payment would ever grant Pro. The buyer's session therefore asks
-- the server to check the gateway, and the server decides.
--
-- That route must read the stored order (including qris_signature) to compare
-- against what the gateway reports, and the buyer may no longer read it. It
-- reads with the service key and compares owner_id to the caller itself, so no
-- extra function is needed here — and nothing returns the signature to a
-- browser.
