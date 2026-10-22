-- ═══════════════════════════════════════════════════════════════════════════
-- JALANKAN INI SEKARANG di Supabase SQL Editor.
--
-- Lubang yang ditutup: pembeli bisa memanggil attach_qris_session sendiri,
-- menulis total_idr = 1 dan signature pilihannya, lalu menyelesaikan order
-- Rp59.000 dengan Rp1 dan mendapat Pro gratis.
--
-- Sudah dibuktikan di database live (2026-10-22):
--   attach_qris_session sebagai pembeli -> HTTP 204
--   qris_signature terbaca pembeli      -> "FORGED", total_idr = 1
--
-- Idempoten: aman dijalankan berulang.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. attach hanya boleh dilakukan server ────────────────────────────────
revoke execute on function public.attach_qris_session(text, text, text, text, bigint, timestamptz) from authenticated;
revoke execute on function public.attach_qris_session(text, text, text, text, bigint, timestamptz) from anon;
revoke execute on function public.attach_qris_session(text, text, text, text, bigint, timestamptz) from public;
grant execute on function public.attach_qris_session(text, text, text, text, bigint, timestamptz) to service_role;

-- ── 2. signature bukan urusan pembeli ─────────────────────────────────────
-- Grant phase 4 adalah `select` seluruh kolom, termasuk qris_signature. RLS
-- membatasi baris ke pemiliknya, tapi pemilik justru yang tidak boleh membaca.
revoke select on public.billing_orders from authenticated;
grant select (
  id, owner_id, order_id, plan, amount_idr, status, created_at, updated_at,
  paid_at, expires_at, total_idr, qris_image_url, qris_payload, expired_at
) on public.billing_orders to authenticated;

comment on column public.billing_orders.qris_signature is
  'Server-only. Writing it is the act that authorises a settlement, so neither the buyer nor the anon role may read or write it.';

-- ── 3. attach diperketat ──────────────────────────────────────────────────
-- Signature kosong dan total nol/negatif ditolak: total nol adalah inti
-- eksploitasinya, karena membuat pembayaran apa pun melunasi order.
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
