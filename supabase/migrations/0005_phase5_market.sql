-- idempotent: true
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
