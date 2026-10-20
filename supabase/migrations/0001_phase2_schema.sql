-- Phase 2 — cloud workspace schema.
-- Guest behaviour is untouched: nothing here is required for Phase 1 features.

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  logo_path text check (logo_path is null or char_length(logo_path) <= 512),
  default_margin_bps integer not null default 3000 check (default_margin_bps between 0 and 10000),
  currency text not null default 'IDR' check (currency = 'IDR'),
  contact_email text check (contact_email is null or char_length(contact_email) <= 254),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 32),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Needed as the target of the composite FK below, which lets the database
  -- reject a quote pointing at somebody else's business profile.
  unique (id, owner_id)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  business_profile_id uuid,
  customer_name text check (customer_name is null or char_length(customer_name) <= 120),
  kind text not null check (kind in ('goods', 'service', 'custom')),
  title text not null check (char_length(title) between 1 and 120),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  cost_breakdown jsonb not null default '{}'::jsonb check (jsonb_typeof(cost_breakdown) = 'object'),
  target_margin_bps integer not null check (target_margin_bps between 0 and 10000),
  computed_price_idr bigint not null check (computed_price_idr > 0 and computed_price_idr <= 1000000000000),
  actual_margin_bps integer check (actual_margin_bps is null or actual_margin_bps between -1000000 and 10000),
  discount_amount_idr bigint not null default 0 check (discount_amount_idr >= 0),
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'expired')),
  quoted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  idempotency_key uuid not null,
  unique (owner_id, idempotency_key),
  constraint quotes_business_profile_owner_fkey
    foreign key (business_profile_id, owner_id)
    references public.business_profiles (id, owner_id)
    on delete set null (business_profile_id)
);

-- Server-owned counters. Clients may read their own row, never write it.
create table public.usage_counters (
  owner_id uuid not null references auth.users (id) on delete cascade,
  period_yyyymm text not null check (period_yyyymm ~ '^[0-9]{6}$'),
  action_type text not null check (action_type in ('quote_saved', 'ai_parse', 'market_research')),
  count integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (owner_id, period_yyyymm, action_type)
);

create index quotes_owner_created_idx on public.quotes (owner_id, created_at desc);
create index quotes_owner_status_idx on public.quotes (owner_id, status);
create index business_profiles_owner_idx on public.business_profiles (owner_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger business_profiles_touch before update on public.business_profiles
  for each row execute function public.touch_updated_at();
create trigger quotes_touch before update on public.quotes
  for each row execute function public.touch_updated_at();

-- Profile row for every new auth user; clients never insert profiles directly.
create or replace function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
