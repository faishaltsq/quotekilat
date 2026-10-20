-- idempotent: true
-- Phase 2 — RLS, grants and the atomic Free-plan quota.
-- Every statement names exactly one role: naming PUBLIC next to other roles
-- makes Postgres ignore the whole list and leaves the hole open.

alter table public.profiles enable row level security;
alter table public.business_profiles enable row level security;
alter table public.quotes enable row level security;
alter table public.usage_counters enable row level security;

-- ── profiles ────────────────────────────────────────────────────────────────
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.profiles from anon;
-- `grant` is additive: Supabase's default privileges already gave authenticated
-- ALL on new tables, so the inherited grant must be revoked explicitly first.
revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- ── business_profiles ───────────────────────────────────────────────────────
drop policy if exists business_profiles_select_own on public.business_profiles;
create policy business_profiles_select_own on public.business_profiles
  for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists business_profiles_insert_own on public.business_profiles;
create policy business_profiles_insert_own on public.business_profiles
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists business_profiles_update_own on public.business_profiles;
create policy business_profiles_update_own on public.business_profiles
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
drop policy if exists business_profiles_delete_own on public.business_profiles;
create policy business_profiles_delete_own on public.business_profiles
  for delete to authenticated using (owner_id = (select auth.uid()));

revoke all on public.business_profiles from anon;
revoke all on public.business_profiles from authenticated;
grant select, insert, update, delete on public.business_profiles to authenticated;

-- ── quotes ──────────────────────────────────────────────────────────────────
drop policy if exists quotes_select_own on public.quotes;
create policy quotes_select_own on public.quotes
  for select to authenticated using (owner_id = (select auth.uid()));
drop policy if exists quotes_insert_own on public.quotes;
create policy quotes_insert_own on public.quotes
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists quotes_update_own on public.quotes;
create policy quotes_update_own on public.quotes
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
drop policy if exists quotes_delete_own on public.quotes;
create policy quotes_delete_own on public.quotes
  for delete to authenticated using (owner_id = (select auth.uid()));

revoke all on public.quotes from anon;
-- Writes go through save_quote() so the quota cannot be bypassed. The inherited
-- ALL grant must be revoked before the narrow grants below, otherwise they are
-- additive and the quota is trivially bypassed with a direct INSERT.
revoke all on public.quotes from authenticated;
grant select on public.quotes to authenticated;
grant update (title, customer_name, status, items, cost_breakdown) on public.quotes to authenticated;

-- ── usage_counters: read-only to clients, mutated only by server functions ──
drop policy if exists usage_counters_select_own on public.usage_counters;
create policy usage_counters_select_own on public.usage_counters
  for select to authenticated using (owner_id = (select auth.uid()));

revoke all on public.usage_counters from anon;
revoke all on public.usage_counters from authenticated;
grant select on public.usage_counters to authenticated;

-- ── atomic quota + insert ───────────────────────────────────────────────────
-- Free plan: 5 cloud-saved quotes per calendar month (UTC).
create or replace function public.free_quote_limit() returns integer
language sql immutable as $$ select 5 $$;

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

  -- Replay of the same idempotency key returns the stored row and does not
  -- consume another quota slot.
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

  -- Single-statement guard: the row lock is the exclusion. A conflicting
  -- update that fails the WHERE returns no row, so no increment happens.
  insert into public.usage_counters as c (owner_id, period_yyyymm, action_type, count)
  values (v_owner, v_period, 'quote_saved', 1)
  on conflict (owner_id, period_yyyymm, action_type) do update
    set count = c.count + 1, updated_at = now()
    where c.count < public.free_quote_limit()
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

revoke execute on function public.free_quote_limit() from public;
revoke execute on function public.free_quote_limit() from anon;
grant execute on function public.free_quote_limit() to authenticated;

create or replace function public.remaining_quota() returns integer
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select greatest(
    public.free_quote_limit() - coalesce((
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
