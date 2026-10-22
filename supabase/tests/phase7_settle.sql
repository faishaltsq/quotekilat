-- Phase 7: the buyer must not be able to authorise their own payment.
--
-- Phase 6 granted attach_qris_session to authenticated, and that function writes
-- the signature and total_idr the settlement trusts. A buyer could therefore set
-- total_idr = 1 and their own signature, then have the server grant Pro for one
-- rupiah. These assertions fail if that grant ever comes back.

\set ON_ERROR_STOP on
set client_min_messages to warning;

create table if not exists public._r (name text, ok boolean, detail text);
truncate public._r;

begin;

-- ── 1. only the service role may attach a session ─────────────────────────
insert into public._r (name, ok, detail)
select 'authenticated cannot execute attach_qris_session',
       not has_function_privilege('authenticated',
         'public.attach_qris_session(text,text,text,text,bigint,timestamptz)', 'EXECUTE'), null;
insert into public._r (name, ok, detail)
select 'anon cannot execute attach_qris_session',
       not has_function_privilege('anon',
         'public.attach_qris_session(text,text,text,text,bigint,timestamptz)', 'EXECUTE'), null;
insert into public._r (name, ok, detail)
select 'service_role may execute attach_qris_session',
       has_function_privilege('service_role',
         'public.attach_qris_session(text,text,text,text,bigint,timestamptz)', 'EXECUTE'), null;

-- ── 2. the signature is not readable by its owner ─────────────────────────
insert into public._r (name, ok, detail)
select 'authenticated cannot read qris_signature',
       not has_column_privilege('authenticated', 'public.billing_orders', 'qris_signature', 'SELECT'), null;
insert into public._r (name, ok, detail)
select 'authenticated cannot read snap_token',
       not has_column_privilege('authenticated', 'public.billing_orders', 'snap_token', 'SELECT'), null;
insert into public._r (name, ok, detail)
select 'authenticated can still read its own order fields',
       has_column_privilege('authenticated', 'public.billing_orders', 'total_idr', 'SELECT')
       and has_column_privilege('authenticated', 'public.billing_orders', 'qris_image_url', 'SELECT')
       and has_column_privilege('authenticated', 'public.billing_orders', 'status', 'SELECT'), null;

-- ── 3. the buyer still cannot grant themselves a plan ─────────────────────
insert into public._r (name, ok, detail)
select 'authenticated cannot execute apply_qris_event',
       not has_function_privilege('authenticated',
         'public.apply_qris_event(text,text,bigint,timestamptz,text)', 'EXECUTE'), null;
insert into public._r (name, ok, detail)
select 'service_role may execute apply_qris_event',
       has_function_privilege('service_role',
         'public.apply_qris_event(text,text,bigint,timestamptz,text)', 'EXECUTE'), null;

-- ── 4. attach refuses an empty signature or a non-positive total ──────────
-- A zero total is the whole exploit: it makes any payment settle the order.
do $$
declare v_uid uuid := gen_random_uuid();
        v_order text;
        v_failed boolean := false;
begin
  insert into auth.users (id, email) values (v_uid, 'phase7-attach@example.test')
    on conflict (id) do nothing;
  insert into public.billing_orders (owner_id, order_id, plan, amount_idr)
    values (v_uid, 'QK-20260101-PHASE7ATT1', 'pro', 59000)
    returning order_id into v_order;

  begin
    perform public.attach_qris_session(v_order, '', 'p', 'u', 59565, now() + interval '1 hour');
  exception when others then v_failed := true;
  end;
  insert into public._r
    select 'attach refuses an empty signature', v_failed, null;

  v_failed := false;
  begin
    perform public.attach_qris_session(v_order, 'sig', 'p', 'u', 0, now() + interval '1 hour');
  exception when others then v_failed := true;
  end;
  insert into public._r
    select 'attach refuses a zero total', v_failed, null;

  -- the happy path still works
  perform public.attach_qris_session(v_order, 'sig-ok', 'p', 'u', 59565, now() + interval '1 hour');
  insert into public._r
    select 'attach stores a valid session',
           o.total_idr = 59565 and o.qris_signature = 'sig-ok', null
      from public.billing_orders o where o.order_id = v_order;

  delete from public.billing_orders where order_id = v_order;
  delete from auth.users where id = v_uid;
end $$;

-- ── 5. attach cannot touch a paid order ───────────────────────────────────
do $$
declare v_uid uuid := gen_random_uuid();
        v_order text;
        v_failed boolean := false;
begin
  insert into auth.users (id, email) values (v_uid, 'phase7-paid@example.test')
    on conflict (id) do nothing;
  insert into public.billing_orders (owner_id, order_id, plan, amount_idr, status)
    values (v_uid, 'QK-20260101-PHASE7PAI1', 'pro', 59000, 'paid')
    returning order_id into v_order;

  begin
    perform public.attach_qris_session(v_order, 'sig', 'p', 'u', 59565, now());
  exception when others then v_failed := true;
  end;
  insert into public._r
    select 'attach refuses an already-paid order', v_failed, null;

  delete from public.billing_orders where order_id = v_order;
  delete from auth.users where id = v_uid;
end $$;

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

rollback;
