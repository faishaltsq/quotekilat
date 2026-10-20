-- idempotent: true
-- Phase 3: server-enforced quota for AI Smart Input.
-- Free tier only for now: 2 parses/month (blueprint §Free Account).
-- Pro (40/month) arrives with billing in Phase 4; the limit lives in a function
-- so raising it never requires touching the RPC body.

create table if not exists public.ai_parse_log (
  owner_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, idempotency_key)
);

comment on table public.ai_parse_log is
  'One row per charged AI parse. A retry with the same key is answered from here instead of burning another unit of quota.';

create table if not exists public.ai_ip_throttle (
  ip_hash text not null,
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  primary key (ip_hash, window_start)
);

comment on table public.ai_ip_throttle is
  'Hourly per-IP ceiling. Rows are pruned by the caller; nothing reads them after the window closes.';

alter table public.ai_parse_log enable row level security;
alter table public.ai_ip_throttle enable row level security;

revoke all on public.ai_parse_log from anon, authenticated;
revoke all on public.ai_ip_throttle from anon, authenticated;

-- Monthly allowance. 2 = free tier. Phase 4 replaces this with a plan lookup.
create or replace function public.ai_parse_limit()
returns integer
language sql
stable
security definer
set search_path = ''
as $$ select 2 $$;

revoke execute on function public.ai_parse_limit() from public;
revoke execute on function public.ai_parse_limit() from anon;
grant execute on function public.ai_parse_limit() to authenticated;

create or replace function public.ai_parse_remaining()
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
     and c.action_type = 'ai_parse';
  return greatest(public.ai_parse_limit() - coalesce(v_used, 0), 0);
end;
$$;

revoke execute on function public.ai_parse_remaining() from public;
revoke execute on function public.ai_parse_remaining() from anon;
grant execute on function public.ai_parse_remaining() to authenticated;

-- Charges one unit or refuses. Returns the decision in a single round trip so the
-- API function never has to read-then-write (which would allow overspend under
-- concurrent requests).
create or replace function public.begin_ai_parse(p_idempotency_key uuid, p_ip_hash text)
returns table (allowed boolean, remaining integer, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_period text := to_char(now() at time zone 'utc', 'YYYYMM');
  v_window timestamptz := date_trunc('hour', now() at time zone 'utc');
  v_limit integer := public.ai_parse_limit();
  v_used integer := 0;
  v_count integer;
  v_replay boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select exists (
    select 1 from public.ai_parse_log l
     where l.owner_id = v_uid and l.idempotency_key = p_idempotency_key
  ) into v_replay;

  select coalesce(c.count, 0) into v_used
    from public.usage_counters c
   where c.owner_id = v_uid and c.period_yyyymm = v_period and c.action_type = 'ai_parse';

  if v_replay then
    allowed := true; remaining := greatest(v_limit - coalesce(v_used, 0), 0); reason := 'replay';
    return next;
    return;
  end if;

  insert into public.ai_ip_throttle as t (ip_hash, window_start, count)
  values (coalesce(nullif(p_ip_hash, ''), 'unknown'), v_window, 1)
  on conflict (ip_hash, window_start) do update set count = t.count + 1
  returning t.count into v_count;

  if v_count > 10 then
    allowed := false; remaining := greatest(v_limit - coalesce(v_used, 0), 0); reason := 'ip_limit';
    return next;
    return;
  end if;

  insert into public.usage_counters as c (owner_id, period_yyyymm, action_type, count)
  values (v_uid, v_period, 'ai_parse', 1)
  on conflict (owner_id, period_yyyymm, action_type)
  do update set count = c.count + 1, updated_at = now()
  where c.count < v_limit
  returning c.count into v_used;

  if v_used is null then
    allowed := false; remaining := 0; reason := 'quota';
    return next;
    return;
  end if;

  insert into public.ai_parse_log (owner_id, idempotency_key)
  values (v_uid, p_idempotency_key)
  on conflict do nothing;

  allowed := true; remaining := v_limit - v_used; reason := null;
  return next;
end;
$$;

revoke execute on function public.begin_ai_parse(uuid, text) from public;
revoke execute on function public.begin_ai_parse(uuid, text) from anon;
grant execute on function public.begin_ai_parse(uuid, text) to authenticated;

-- Undo a charge when the model call fails. Without this a provider outage would
-- silently eat a user's two free parses.
create or replace function public.refund_ai_parse(p_idempotency_key uuid)
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
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  delete from public.ai_parse_log l
   where l.owner_id = v_uid and l.idempotency_key = p_idempotency_key;
  v_deleted := found;

  if v_deleted then
    update public.usage_counters c
       set count = greatest(c.count - 1, 0), updated_at = now()
     where c.owner_id = v_uid and c.period_yyyymm = v_period and c.action_type = 'ai_parse';
  end if;

  return public.ai_parse_remaining();
end;
$$;

revoke execute on function public.refund_ai_parse(uuid) from public;
revoke execute on function public.refund_ai_parse(uuid) from anon;
grant execute on function public.refund_ai_parse(uuid) to authenticated;
