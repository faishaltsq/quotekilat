# QuoteKilat — Continue development: billing (Phase 4), honesty debt, observability (Phase 5), Market Insights

## Goal

Ship Pro billing on Midtrans sandbox with server-authoritative entitlements, then close the honesty/documentation debt left by the UI remake, add consent-gated self-hosted analytics, and land Market Insights behind a provider adapter — in that order, each phase gated by a green local build.

---

## 1. Current context / assumptions

### Repo facts you must not re-derive

- Repo: `C:\Users\cubeb\OneDrive\Documents\coding\projects\QuoteKilat`, branch `master`, remote `https://github.com/faishaltsq/quotekilat.git`. Push to `master` deploys to Vercel (`https://quotekilat.vercel.app`).
- Package manager is **pnpm**. Never run `npm install`. The shell exports `NODE_ENV=production`, so a bare `npm install` prunes devDependencies and breaks `tsc`/`vitest`; `vercel.json` already works around this with `NODE_ENV=development pnpm install --frozen-lockfile`.
- The shell exports `NODE_ENV=production`. `vitest.config.ts` pins `env: { NODE_ENV: 'test' }` so React resolves its development build. Do not remove that.
- Stack: React 19 + TypeScript + Vite, React Router, React Hook Form + Zod, `@supabase/supabase-js`, `pdf-lib`. Plain CSS, **not** Tailwind utilities (Tailwind v4 is installed but unused — do not start using it).
- Supabase project `xirgtbnvthgjrvgnfrsg`. Migrations live in `supabase/migrations/`, are mirrored by hand into the single-paste `supabase/apply-all.sql`, and are gated by `pnpm test:sql` (Docker, `postgres:16-alpine`).
- Server code lives in `server/**/*.ts` and is compiled to CommonJS into `vercel-api/` by `scripts/build-api.mjs` (`tsconfig.api.json`). Each HTTP route needs a thin CommonJS shim under `api/`. `vercel.json` routes `api/**/*.js` with `maxDuration: 30`.
- `vercel.json` rewrites `/((?!api/).*)` → `/index.html`, so any new `/api/*` route is automatically excluded from the SPA fallback. `tests/unit/deployConfig.test.ts` asserts this.
- `tests/unit/aiParseHandler.test.ts` is the reference for testing a server handler: a pure `handleX(input, deps)` function plus a `makeDeps()` helper with a fake `fetch`. Follow that shape exactly.
- CSP is `script-src 'self'` with no `unsafe-inline`. Any payment UI that injects a third-party script would break it — see the decision in §3.

### Gate commands (these exact strings)

```
pnpm typecheck          # tsc --noEmit
pnpm lint               # eslint .
pnpm test               # vitest run, currently 27 files / 384 tests
pnpm build              # tsc --noEmit && vite build && node scripts/build-api.mjs
pnpm test:e2e           # playwright, 12 tests x 2 projects = 24
pnpm test:sql           # docker postgres:16-alpine, 37 + 29 assertions
```

Baseline before you touch anything (run all six, record the numbers):

```
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e && pnpm test:sql
```

Expected: every command exits 0; `pnpm test` reports `Tests 384 passed (384)`.

### Decisions already taken with the user (do not re-litigate)

1. Midtrans **sandbox** credentials already exist (Merchant ID, Server Key, Client Key). No production charge is permitted in this phase.
2. Pro price stays the documented hypothesis: **Rp59.000 / month**, integer IDR, chosen server-side.
3. Pro quotas: **40 AI parses/month**, **100 cloud quotes/month**, **10 market researches/month**. Free stays 2 / 5 / 0.
4. Analytics must stay **self-hosted and consent-gated**. The E2E suite asserts zero third-party requests; that assertion must keep passing.
5. Redirect-based Snap checkout only. No `snap.js` script tag, no iframe — that would require loosening `script-src`/`frame-src`.

### Assumption to state in every commit body of this plan

Billing is a sandbox integration. No real money moves. Entitlements are granted only by a verified webhook, never by a client redirect.

---

## 2. Architecture / proposed approach

All money and quota logic lives in Postgres as `SECURITY DEFINER` functions with `set search_path = ''`, exactly like `begin_ai_parse` and `save_quote` today; the Vercel functions are thin HTTP adapters that verify the caller, verify the Midtrans signature, and call one RPC. A single `entitlements` row per user plus a `current_plan()` lookup replaces the hardcoded `select 2` / `select 5` limits, so raising a quota never touches an RPC body. The browser only ever learns its plan from `GET /api/billing/status` and only ever leaves the page via a server-issued `redirect_url`.

---

## 3. Execution order

| Order | Phase | Why here |
|---|---|---|
| 0 | Honesty debt | Documentation and legal text currently claim Smart Input is inactive while it is live in production. Fix before adding more surfaces. Cheap, unblocks trust. |
| 1 | Billing schema + plan-aware limits | Everything else depends on `current_plan()`. |
| 2 | Billing server routes | Checkout, webhook, status. Unit-tested without network. |
| 3 | Billing client surface | Plan-aware quota copy, upgrade CTA, no false promises. |
| 4 | Phase 5 observability | Needs `current_plan()` for sampling decisions and the same handler pattern. |
| 5 | Market Insights | Largest surface, needs Pro entitlement to exist first. |

Do not start Phase 2 before Phase 1's `pnpm test:sql` is green: the handlers call RPCs that must already exist.

---

## Phase 0 — Honesty debt and dead code

Six small tasks. No new behaviour. Each is its own commit.

### T0.0 — Record the baseline before touching anything

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e
```

Expected: exit 0 throughout, and `Tests  384 passed (384)` across 27 files, `24 passed` for E2E. Write the observed numbers into `docs/PHASE-4-BILLING.md` when you create it in T2.9 — every later count in this plan is derived from 384, so a different baseline means the arithmetic here needs adjusting rather than the tests being wrong.

If `pnpm test:sql` has not been run in this session, run it now too. It needs Docker; if Docker is unavailable, say so and treat the SQL gate as unverified rather than skipping it silently.

### T0.1 — Delete the dead feature-flag module

`src/lib/features.ts` exports a frozen object nothing imports (`grep -rn "lib/features" src tests server` returns nothing). The real gate is `src/lib/ai/flag.ts`.

```bash
rm src/lib/features.ts
pnpm typecheck
```

Expected: exit 0, no output.

```bash
git add -A src/lib/features.ts && git commit -m "chore: drop the unused feature-flag object; flag.ts is the real gate"
```

### T0.2 — Fix `IMPLEMENTATION_STATUS.md` for the shipped UI

The file still says "dialog preview terbuka dengan total sama" in the production smoke row and lists 294/19 tests. Replace the stale lines.

Edit `IMPLEMENTATION_STATUS.md`:

1. Line with `| `pnpm test` | **294 tes lulus, 19 file** |` → `| `pnpm test` | **384 tes lulus, 27 file** |`
2. Line with `**Smoke produksi (Chromium)**` — replace the fragment `dialog preview terbuka dengan total sama, tombol PDF aktif` with `pratinjau invoice realtime di kolom ketiga memperbarui total, tombol Unduh PDF aktif`.
3. Line with `Axe scan landing/preview desktop/mobile` — replace `landing/preview` with `landing/pratinjau`.
4. Under `Screenshot:`, add:
   ```
   - `test-results/ui-review/desktop-1440-fold.png` — hero tiga kolom di 1440x900
   - `test-results/ui-review/mobile-390-fold.png` — hero mobile 390px
   ```

Verify the file no longer contains the removed dialog as a live feature:

```bash
grep -n "dialog preview terbuka" IMPLEMENTATION_STATUS.md
```

Expected: no output.

```bash
git add IMPLEMENTATION_STATUS.md && git commit -m "docs: record the shipped three-column hero and the current test counts"
```

### T0.3 — Correct the privacy page: Smart Input and cloud are live

`src/app/LegalPage.tsx` line 42 still says `Tidak ada analitik, piksel pemasaran, pelacak pihak ketiga, akun pengguna, API AI, API pencarian harga, sinkronisasi cloud, atau pembayaran yang diaktifkan`. Cloud and AI are live; billing is about to be.

Replace that paragraph with:

```
'QuoteKilat tidak memakai analitik pihak ketiga, piksel pemasaran, atau pelacak iklan. Akun dan penyimpanan cloud bersifat opsional dan hanya aktif setelah Anda masuk. Smart Input mengirim teks catatan yang sudah diredaksi ke penyedia model melalui server QuoteKilat, dan hanya berjalan setelah Anda menekan tombolnya. Harga pasar masih ditandai belum aktif. Pembayaran memakai Midtrans dan hanya berjalan setelah Anda memilih paket berbayar.',
```

Also update heading `4. Tidak ada analitik atau integrasi aktif` → `4. Integrasi opsional dan pelacakan`.

Verify:

```bash
grep -n "Tidak ada analitik atau integrasi aktif" src/app/LegalPage.tsx
```

Expected: no output.

```bash
pnpm test tests/components/landing/LegalPage.test.tsx 2>/dev/null || pnpm vitest run tests/components/landing/LegalPage.test.tsx
```

Expected: passes. If it asserts the old heading text, update the assertion to the new heading — that is the only allowed change to that test.

```bash
git add src/app/LegalPage.tsx && git commit -m "docs(legal): describe the live cloud and AI integrations instead of claiming they are off"
```

### T0.4 — Fix the marketing claim that Smart Input is inactive

`src/components/landing/MarketingSections.tsx:161-171` renders a permanently disabled `Smart Input · belum aktif` button. Smart Input is live in production. Replace the disabled button with a real link into the builder.

Replace lines 156-173 (the whole `qk-smart-preview` div) with:

```tsx
          <div className="qk-smart-preview">
            <ScanText size={20} strokeWidth={1.6} aria-hidden="true" />
            <div>
              <h3>Isi pesanan, tanpa mengetik ulang.</h3>
              <p id="qk-smart-available">
                Tempel catatan pesanan, periksa usulan isian, lalu terapkan sendiri. Angka yang tidak disebut tidak ditebak.
              </p>
              <a className="qk-smart-button" href="/#quote-builder" aria-describedby="qk-smart-available">
                Coba Smart Input
                <ArrowRight size={13} aria-hidden="true" />
              </a>
            </div>
          </div>
```

`ArrowRight` is already imported in that file (used by `PricingPlans`). `LockKeyhole` becomes unused — remove it from the import list.

Then update the test. `src/components/landing/MarketingSections.test.tsx` currently has exactly this line at 29:

```tsx
    expect(screen.getByRole('button', { name: /Smart Input/ })).toBeDisabled()
```

Replace that single line with:

```tsx
    expect(screen.getByRole('link', { name: /Coba Smart Input/i })).toHaveAttribute('href', '/#quote-builder')
```

Leave line 28 (`Cek harga pasar` disabled) alone — market research is still inactive until Phase 5. The assertion at line 24 (`queryAllByRole('link')` inside the Market Insights *demo article*) is unaffected: the new link lives in the copy column, not inside that article.

Verify:

```bash
pnpm vitest run src/components/landing/MarketingSections.test.tsx
```

Expected: `Tests  4 passed (4)` — the file has four tests.

```bash
pnpm typecheck && pnpm lint
```

Expected: both exit 0. Lint will fail on an unused `LockKeyhole` import if you forgot to remove it.

```bash
git add src/components/landing/MarketingSections.tsx src/components/landing/MarketingSections.test.tsx && git commit -m "fix(landing): stop advertising Smart Input as unavailable now that it is live"
```

### T0.5 — Make the pricing page state the real plan status

`src/components/landing/MarketingSections.tsx:261-289` marks Free Account and Pro as `Rencana · belum aktif`. After Phase 3 Pro becomes purchasable (sandbox). Do this task **at the end of Phase 3**, not now — leave the copy alone until billing actually ships. Noted here so it is not forgotten.

### T0.6 — Phase 0 gate

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Expected: exit 0; `Tests 384 passed (384)`; `✓ built in`.

---

## Phase 1 — Billing schema and plan-aware limits

Everything in this phase is SQL. TDD here means: write the SQL-gate assertions first (RED), then the migration (GREEN).

### T1.1 — Add `service_role` to the SQL harness (RED support)

The webhook needs a role that is neither `anon` nor `authenticated`. The harness must model it or the revoke assertions are vacuous.

Edit `supabase/tests/shim.sql`, after the `create role authenticated;` line:

```sql
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
```

And after `grant usage on schema public to anon, authenticated;`:

```sql
grant usage on schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant execute on functions to service_role;
```

Verify the harness still applies:

```bash
pnpm test:sql
```

Expected: `== SQL gate passed ==` (the new role changes nothing yet).

### T1.2 — Write the failing assertions (RED)

Create `supabase/tests/phase4_billing.sql`. Model it on `phase3_ai_quota.sql`: a `public._r` table, `insert ... select 'name', <boolean>, <detail>`, and a final `\if` guard that raises when any row has `ok = false`.

Use exactly this content:

```sql
-- Phase 4 verification: billing tables are unreachable from a browser session,
-- the entitlement lookup is authoritative, and a replayed webhook cannot extend
-- a period twice.

\set ON_ERROR_STOP on

create table if not exists public._r (name text, ok boolean, detail text);
truncate public._r;

insert into auth.users (id, email, raw_user_meta_data) values
  ('55555555-5555-5555-5555-555555555555', 'e@example.test', '{"display_name":"User E"}'),
  ('66666666-6666-6666-6666-666666666666', 'f@example.test', '{"display_name":"User F"}')
on conflict (id) do nothing;

-- ── grants ──────────────────────────────────────────────────────────────────
insert into public._r
select 'anon cannot select billing_orders',
       not has_table_privilege('anon', 'public.billing_orders', 'SELECT'), null;
insert into public._r
select 'authenticated may only select billing_orders',
       has_table_privilege('authenticated', 'public.billing_orders', 'SELECT')
   and not has_table_privilege('authenticated', 'public.billing_orders', 'INSERT')
   and not has_table_privilege('authenticated', 'public.billing_orders', 'UPDATE'), null;
insert into public._r
select 'authenticated has no access to billing_events',
       not has_table_privilege('authenticated', 'public.billing_events', 'SELECT')
   and not has_table_privilege('authenticated', 'public.billing_events', 'INSERT'), null;
insert into public._r
select 'authenticated may only select entitlements',
       has_table_privilege('authenticated', 'public.entitlements', 'SELECT')
   and not has_table_privilege('authenticated', 'public.entitlements', 'UPDATE'), null;
insert into public._r
select 'anon cannot execute create_billing_order',
       not has_function_privilege('anon', 'public.create_billing_order(text)', 'EXECUTE'), null;
insert into public._r
select 'authenticated cannot execute apply_billing_event',
       not has_function_privilege('authenticated',
         'public.apply_billing_event(text,text,text,text,text,text,text)', 'EXECUTE'), null;
insert into public._r
select 'service_role may execute apply_billing_event',
       has_function_privilege('service_role',
         'public.apply_billing_event(text,text,text,text,text,text,text)', 'EXECUTE'), null;
insert into public._r
select 'anon cannot execute billing_status',
       not has_function_privilege('anon', 'public.billing_status()', 'EXECUTE'), null;

-- ── default plan is free, and the free limits are unchanged ────────────────
-- Pattern copied from phase3_ai_quota.sql: set_config(..., false) makes the claim
-- session-wide, `set role` switches identity, and every assertion row is written
-- after `reset role` because public._r is not granted to authenticated.
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
set role authenticated;
create temp table _e_free as select * from public.billing_status();
create temp table _e_limits as
  select public.ai_parse_limit() as ai, public.quote_limit() as q, public.market_research_limit() as m;
reset role;

insert into public._r select 'a fresh user is on the free plan',
  (select plan from _e_free) = 'free', (select plan from _e_free);
insert into public._r select 'free plan keeps the 2 parse limit',
  (select ai from _e_limits) = 2, (select ai::text from _e_limits);
insert into public._r select 'free plan keeps the 5 quote limit',
  (select q from _e_limits) = 5, (select q::text from _e_limits);
insert into public._r select 'free plan has no market research quota',
  (select m from _e_limits) = 0, (select m::text from _e_limits);

-- ── a paid order grants Pro, and the limits move ───────────────────────────
-- Inserted directly, not via create_billing_order: that function reads
-- auth.uid(), which is null while this script runs as postgres.
insert into public.billing_orders (owner_id, order_id, plan, amount_idr)
values ('55555555-5555-5555-5555-555555555555', 'QK-20260101-TEST000001', 'pro', 59000);

create temp table _settle as
  select * from public.apply_billing_event('QK-20260101-TEST000001', 'settlement', '200', '59000.00', '', 'txn-1', 'qris');

insert into public._r select 'a valid settlement is applied',
  (select applied from _settle), (select reason from _settle);

select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
set role authenticated;
create temp table _e_pro as select * from public.billing_status();
create temp table _e_pro_limits as
  select public.ai_parse_limit() as ai, public.quote_limit() as q, public.market_research_limit() as m;
reset role;

insert into public._r select 'a settled order moves the user to pro',
  (select plan from _e_pro) = 'pro', (select plan from _e_pro);
insert into public._r select 'pro plan raises the parse limit to 40',
  (select ai from _e_pro_limits) = 40, (select ai::text from _e_pro_limits);
insert into public._r select 'pro plan raises the quote limit to 100',
  (select q from _e_pro_limits) = 100, (select q::text from _e_pro_limits);
insert into public._r select 'pro plan unlocks 10 market researches',
  (select m from _e_pro_limits) = 10, (select m::text from _e_pro_limits);
insert into public._r select 'the order is marked paid',
  (select status from public.billing_orders where order_id = 'QK-20260101-TEST000001') = 'paid', null;

-- ── replay must not extend the period twice ────────────────────────────────
create temp table _period_before as
  select current_period_end from public.entitlements
   where owner_id = '55555555-5555-5555-5555-555555555555';

create temp table _replay as
  select * from public.apply_billing_event('QK-20260101-TEST000001', 'settlement', '200', '59000.00', '', 'txn-1', 'qris');

insert into public._r select 'replaying the same event is refused',
  (select not applied from _replay), (select reason from _replay);
insert into public._r select 'replay names itself a duplicate',
  (select reason from _replay) = 'duplicate', (select reason from _replay);
insert into public._r select 'replay did not extend the paid period',
  (select current_period_end from public.entitlements
    where owner_id = '55555555-5555-5555-5555-555555555555')
  = (select current_period_end from _period_before), null;

-- ── a forged amount is refused ─────────────────────────────────────────────
create temp table _forged as
  select * from public.apply_billing_event('QK-20260101-TEST000001', 'settlement', '200', '1000.00', '', 'txn-2', 'qris');

insert into public._r select 'a mismatched gross amount is refused',
  (select not applied from _forged), (select reason from _forged);
insert into public._r select 'a mismatched amount is named as such',
  (select reason from _forged) = 'amount_mismatch', (select reason from _forged);

-- ── an unknown order is refused, not silently accepted ─────────────────────
create temp table _unknown as
  select * from public.apply_billing_event('QK-20260101-NOSUCHORDER', 'settlement', '200', '59000.00', '', 'txn-3', 'qris');

insert into public._r select 'an unknown order id is refused',
  (select not applied from _unknown) and (select reason from _unknown) = 'unknown_order', (select reason from _unknown);

-- ── tenant isolation ───────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);
set role authenticated;
create temp table _f_status as select * from public.billing_status();
create temp table _f_orders as select count(*) as n from public.billing_orders;
reset role;

insert into public._r select 'another tenant stays on free',
  (select plan from _f_status) = 'free', (select plan from _f_status);
insert into public._r select 'another tenant sees no billing orders',
  (select n from _f_orders) = 0, (select n::text from _f_orders);

-- ── an expired period reads as free without any cron job ───────────────────
update public.entitlements
   set current_period_end = now() - interval '1 day'
 where owner_id = '55555555-5555-5555-5555-555555555555';

select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
set role authenticated;
create temp table _expired as select * from public.billing_status();
create temp table _expired_ai as select public.ai_parse_limit() as ai;
reset role;

insert into public._r select 'a lapsed period reads as free',
  (select plan from _expired) = 'free', (select plan from _expired);
insert into public._r select 'a lapsed period drops the parse limit back to 2',
  (select ai from _expired_ai) = 2, (select ai::text from _expired_ai);

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
```

The test inserts its own `billing_orders` row instead of calling `create_billing_order`, because that function reads `auth.uid()`, which is null while the script runs as `postgres`. The literal id `QK-20260101-TEST000001` carries exactly ten uppercase characters after the date, so it satisfies the `order_id` check constraint defined in T1.3.

Register the new suite in `scripts/verify-supabase.sh` line 11:

```bash
VERIFY=("$ROOT/supabase/tests/phase2_rls_quota.sql" "$ROOT/supabase/tests/phase3_ai_quota.sql" "$ROOT/supabase/tests/phase4_billing.sql")
```

Run it and confirm RED:

```bash
pnpm test:sql 2>&1 | tail -20
```

Expected: failure mentioning `relation "public.billing_orders" does not exist` or `function public.billing_status() does not exist`. That is the RED state.

### T1.3 — Write the migration (GREEN)

Create `supabase/migrations/0004_phase4_billing.sql` with exactly this content:

```sql
-- idempotent: true
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
```

Run the gate:

```bash
pnpm test:sql 2>&1 | tail -40
```

Expected: `== SQL gate passed ==` and every `PASS` line from `phase4_billing.sql`. If `service_role may execute apply_billing_event` fails, you skipped the `alter default privileges ... to service_role` line in T1.1.

### T1.4 — Mirror the migration into `apply-all.sql`

`supabase/apply-all.sql` is the file a human pastes into the dashboard, and `pnpm test:sql` proves it still applies to a blank database. It must contain everything `migrations/` contains.

Open `supabase/apply-all.sql`, and immediately before the final `commit;` line, insert the entire body of `supabase/migrations/0004_phase4_billing.sql` (everything after the `-- idempotent: true` header line, without the header comment).

Verify:

```bash
pnpm test:sql 2>&1 | tail -20
```

Expected: `== SQL gate passed ==`, including `== combined apply-all.sql (fresh database) ==` → `applied cleanly` and `phase4_billing.sql: N assertions`.

### T1.5 — Apply to the live Supabase project

Migrations do not run automatically. Two options; use whichever the operator prefers, and record which one was used in `docs/PHASE-4-BILLING.md` (created in T2.9).

- Dashboard: open the SQL editor for project `xirgtbnvthgjrvgnfrsg`, paste `supabase/apply-all.sql`, run once.
- CLI: `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/apply-all.sql`.

Verify against the live project (replace placeholders from `.env.local`):

```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/billing_status" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H "authorization: Bearer $SUPABASE_PUBLISHABLE_KEY" \
  -H "content-type: application/json" -d '{}'
```

Expected: `{"code":"42501","message":"permission denied for function billing_status"}` — anon must not reach it. That is a pass, not an error.

### T1.6 — Commit Phase 1

```bash
git add supabase/migrations/0004_phase4_billing.sql supabase/apply-all.sql supabase/tests/shim.sql supabase/tests/phase4_billing.sql scripts/verify-supabase.sh
git commit -m "feat(billing): server-authoritative entitlements and plan-aware quotas"
```

---

## Phase 2 — Billing server routes

Four new server modules, three HTTP routes, one shared Node adapter. TDD: write the failing test, watch it fail on a missing module, then implement.

### T2.1 — Shared Node entry adapter (RED)

The existing `api/ai/parse.js` hand-rolls the Node→Web-Request adapter. Three more routes need the same code, so extract it once.

Create `tests/unit/nodeEntry.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { nodeEntry } from '../../server/_lib/nodeEntry'

const makeRes = () => {
  const headers = new Map<string, string>()
  return {
    statusCode: 0,
    setHeader: (key: string, value: string) => { headers.set(key.toLowerCase(), value) },
    end: vi.fn(),
    get headers() { return headers },
  }
}

const makeReq = (init: { method?: string; url?: string; headers?: Record<string, string>; body?: unknown }) => ({
  method: init.method ?? 'POST',
  url: init.url ?? '/api/test',
  headers: { host: 'quotekilat.test', ...(init.headers ?? {}) },
  body: init.body,
})

describe('nodeEntry', () => {
  it('passes the method, url and headers through to the handler', async () => {
    const seen: { method: string; url: string; header: string | null } = { method: '', url: '', header: null }
    const handler = async (request: Request) => {
      seen.method = request.method
      seen.url = request.url
      seen.header = request.headers.get('x-test')
      return new Response('ok', { status: 201, headers: { 'content-type': 'text/plain' } })
    }
    const res = makeRes()
    await nodeEntry(handler)(makeReq({ headers: { 'x-test': 'yes' } }) as never, res as never)

    expect(seen.method).toBe('POST')
    expect(seen.url).toBe('https://quotekilat.test/api/test')
    expect(seen.header).toBe('yes')
    expect(res.statusCode).toBe(201)
    expect(res.headers.get('content-type')).toBe('text/plain')
  })

  it('serialises a JSON body so the handler can read it', async () => {
    let received = ''
    const handler = async (request: Request) => {
      received = await request.text()
      return new Response(null, { status: 204 })
    }
    await nodeEntry(handler)(makeReq({ body: { hello: 'world' } }) as never, makeRes() as never)
    expect(JSON.parse(received)).toEqual({ hello: 'world' })
  })

  it('sends no body for GET', async () => {
    let received: string | null = 'unset'
    const handler = async (request: Request) => {
      received = await request.text()
      return new Response(null, { status: 200 })
    }
    await nodeEntry(handler)(makeReq({ method: 'GET' }) as never, makeRes() as never)
    expect(received).toBe('')
  })
})
```

Run it:

```bash
pnpm vitest run tests/unit/nodeEntry.test.ts
```

Expected: `Error: Failed to resolve import "../../server/_lib/nodeEntry"` — RED.

### T2.2 — Implement the adapter (GREEN)

Create `server/_lib/nodeEntry.ts`:

```ts
/**
 * Adapts a Web-API `(Request) => Response` handler to the Node `(req, res)`
 * signature Vercel uses for a CommonJS export. Kept in one place because the
 * alternative is four copies drifting apart, and the failure mode (a dropped
 * Response surfacing as FUNCTION_INVOCATION_TIMEOUT) is invisible locally.
 */
export type WebHandler = (request: Request) => Promise<Response>

type NodeRequest = {
  method?: string
  url?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
  [Symbol.asyncIterator]?: () => AsyncIterator<unknown>
}

type NodeResponse = {
  statusCode: number
  setHeader: (key: string, value: string) => void
  end: (body?: Uint8Array) => void
}

export function nodeEntry(handler: WebHandler) {
  return async function entry(req: NodeRequest, res: NodeResponse): Promise<void> {
    const chunks: Buffer[] = []
    if (req.body !== undefined && req.body !== null) {
      const raw = req.body
      chunks.push(Buffer.isBuffer(raw) ? raw : Buffer.from(typeof raw === 'string' ? raw : JSON.stringify(raw)))
    } else if (req.method !== 'GET' && req.method !== 'HEAD' && typeof req[Symbol.asyncIterator] === 'function') {
      for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk))
    }

    const host = req.headers.host ?? 'quotekilat.vercel.app'
    const headers = Object.entries(req.headers).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, Array.isArray(value) ? value.join(',') : String(value)] as [string, string]],
    )

    const request = new Request(`https://${host}${req.url ?? '/'}`, {
      method: req.method ?? 'GET',
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
    })

    const response = await handler(request)
    res.statusCode = response.status
    response.headers.forEach((value, key) => res.setHeader(key, value))
    res.end(Buffer.from(await response.arrayBuffer()))
  }
}
```

Run:

```bash
pnpm vitest run tests/unit/nodeEntry.test.ts
```

Expected: `Tests  3 passed (3)`.

Then refactor `api/ai/parse.js` to use it, keeping the require line that `deployConfig.test.ts` asserts:

```js
// Vercel function entry. The logic lives in server/ai/parse.ts, compiled to
// CommonJS by scripts/build-api.mjs; this file only adapts Node in/out to it.
const { nodeEntry } = require('../../vercel-api/server/_lib/nodeEntry.js')
const mod = require('../../vercel-api/server/ai/parse.js')

module.exports = nodeEntry(mod.default || mod)
```

Verify nothing broke:

```bash
pnpm vitest run tests/unit/deployConfig.test.ts tests/unit/nodeEntry.test.ts
```

Expected: both files pass.

```bash
git add server/_lib/nodeEntry.ts tests/unit/nodeEntry.test.ts api/ai/parse.js && git commit -m "refactor(api): extract the Node entry adapter so every route shares one"
```

### T2.3 — Midtrans client library (RED)

Create `tests/unit/midtrans.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { createSnapTransaction, readMidtransEnv, signatureFor, verifySignature } from '../../server/_lib/midtrans'

const env = { serverKey: 'SB-Mid-server-TESTKEY', clientKey: 'SB-Mid-client-TESTKEY', isProduction: false }

describe('readMidtransEnv', () => {
  it('returns null when either key is missing', () => {
    expect(readMidtransEnv({} as NodeJS.ProcessEnv)).toBeNull()
    expect(readMidtransEnv({ MIDTRANS_SERVER_KEY: 'x' } as NodeJS.ProcessEnv)).toBeNull()
  })

  it('defaults to sandbox', () => {
    const parsed = readMidtransEnv({ MIDTRANS_SERVER_KEY: 'a', MIDTRANS_CLIENT_KEY: 'b' } as NodeJS.ProcessEnv)
    expect(parsed?.isProduction).toBe(false)
  })

  it('reads the production flag from an exact string', () => {
    const parsed = readMidtransEnv({
      MIDTRANS_SERVER_KEY: 'a', MIDTRANS_CLIENT_KEY: 'b', MIDTRANS_IS_PRODUCTION: 'true',
    } as NodeJS.ProcessEnv)
    expect(parsed?.isProduction).toBe(true)
  })
})

describe('signature', () => {
  const input = { orderId: 'QK-20260101-ABCDEFGHIJ', statusCode: '200', grossAmount: '59000.00', serverKey: env.serverKey }

  it('is sha512 of order+status+amount+key', () => {
    expect(signatureFor(input)).toBe(
      createHash('sha512').update('QK-20260101-ABCDEFGHIJ20059000.00SB-Mid-server-TESTKEY').digest('hex'),
    )
  })

  it('accepts the matching signature case-insensitively', () => {
    expect(verifySignature({ ...input, signatureKey: signatureFor(input).toUpperCase() })).toBe(true)
  })

  it('rejects a signature for a different amount', () => {
    const wrong = signatureFor({ ...input, grossAmount: '1000.00' })
    expect(verifySignature({ ...input, signatureKey: wrong })).toBe(false)
  })

  it('rejects a truncated signature without throwing', () => {
    expect(verifySignature({ ...input, signatureKey: 'abc' })).toBe(false)
  })
})

describe('createSnapTransaction', () => {
  const ok = (body: unknown, status = 201) => ({ ok: status < 400, status, json: async () => body }) as Response

  it('posts to the sandbox host with basic auth and the server-chosen amount', async () => {
    let seenUrl = ''
    let seenAuth = ''
    let seenBody: Record<string, unknown> = {}
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      seenUrl = String(url)
      seenAuth = String((init.headers as Record<string, string>).authorization)
      seenBody = JSON.parse(String(init.body))
      return ok({ token: 'snap-token', redirect_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-token' })
    }) as unknown as typeof fetch

    const result = await createSnapTransaction(
      { orderId: 'QK-20260101-ABCDEFGHIJ', amountIdr: 59000, plan: 'pro', customerEmail: 'a@example.test' },
      env, fetchImpl,
    )

    expect(seenUrl).toBe('https://app.sandbox.midtrans.com/snap/v1/transactions')
    expect(seenAuth).toBe(`Basic ${Buffer.from(`${env.serverKey}:`).toString('base64')}`)
    expect(seenBody).toMatchObject({
      transaction_details: { order_id: 'QK-20260101-ABCDEFGHIJ', gross_amount: 59000 },
    })
    expect(result).toEqual({ ok: true, token: 'snap-token', redirectUrl: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-token' })
  })

  it('reports a provider rejection instead of throwing', async () => {
    const fetchImpl = vi.fn(async () => ok({ error_messages: ['amount is required'] }, 400)) as unknown as typeof fetch
    const result = await createSnapTransaction(
      { orderId: 'QK-20260101-ABCDEFGHIJ', amountIdr: 59000, plan: 'pro', customerEmail: null }, env, fetchImpl,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.kind).toBe('status')
  })

  it('reports a network failure instead of throwing', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('ECONNRESET') }) as unknown as typeof fetch
    const result = await createSnapTransaction(
      { orderId: 'QK-20260101-ABCDEFGHIJ', amountIdr: 59000, plan: 'pro', customerEmail: null }, env, fetchImpl,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.kind).toBe('network')
  })
})
```

Run:

```bash
pnpm vitest run tests/unit/midtrans.test.ts
```

Expected: module-resolution failure — RED.

### T2.4 — Implement the Midtrans library (GREEN)

Create `server/_lib/midtrans.ts`:

```ts
import { createHash, timingSafeEqual } from 'node:crypto'
import { timeoutSignal } from './net'

export type MidtransEnv = { serverKey: string; clientKey: string; isProduction: boolean }

/** Server-only credentials. `MIDTRANS_*` has no VITE_ prefix, so Vite never inlines them. */
export function readMidtransEnv(env: NodeJS.ProcessEnv = process.env): MidtransEnv | null {
  const serverKey = env.MIDTRANS_SERVER_KEY?.trim() ?? ''
  const clientKey = env.MIDTRANS_CLIENT_KEY?.trim() ?? ''
  if (!serverKey || !clientKey) return null
  return { serverKey, clientKey, isProduction: env.MIDTRANS_IS_PRODUCTION === 'true' }
}

export const snapBase = (env: MidtransEnv): string =>
  env.isProduction ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com'

/**
 * Midtrans signs `order_id + status_code + gross_amount + server_key` with
 * SHA-512. The server key is the secret half, so a forged notification cannot
 * produce a matching digest without it.
 */
export function signatureFor(input: {
  orderId: string
  statusCode: string
  grossAmount: string
  serverKey: string
}): string {
  return createHash('sha512')
    .update(`${input.orderId}${input.statusCode}${input.grossAmount}${input.serverKey}`)
    .digest('hex')
}

export function verifySignature(input: {
  orderId: string
  statusCode: string
  grossAmount: string
  serverKey: string
  signatureKey: string
}): boolean {
  const expected = signatureFor(input)
  const given = input.signatureKey.trim().toLowerCase()
  // Length check first: timingSafeEqual throws on a length mismatch, and a
  // truncated signature is an ordinary attack, not a crash.
  if (given.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(given))
}

export type SnapRequest = {
  orderId: string
  amountIdr: number
  plan: string
  customerEmail: string | null
}

export type SnapOutcome =
  | { ok: true; token: string; redirectUrl: string }
  | { ok: false; kind: 'network' | 'status' | 'shape'; status?: number; detail?: string }

export async function createSnapTransaction(
  request: SnapRequest,
  env: MidtransEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<SnapOutcome> {
  const authorization = `Basic ${Buffer.from(`${env.serverKey}:`).toString('base64')}`

  let response: Response
  try {
    response = await fetchImpl(`${snapBase(env)}/snap/v1/transactions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', authorization },
      body: JSON.stringify({
        transaction_details: { order_id: request.orderId, gross_amount: request.amountIdr },
        ...(request.customerEmail ? { customer_details: { email: request.customerEmail } } : {}),
        // finish is the only callback we ask for: the browser returns to our own
        // page and reads the truth from /api/billing/status, never from the URL.
        callbacks: { finish: `${env.isProduction ? 'https://quotekilat.vercel.app' : 'http://127.0.0.1:4173'}/#harga` },
        credit_card: { secure: true },
      }),
      signal: timeoutSignal(15000),
    })
  } catch {
    return { ok: false, kind: 'network' }
  }

  const body = (await response.json().catch(() => null)) as
    | { token?: string; redirect_url?: string; error_messages?: string[] }
    | null

  if (!response.ok) {
    return { ok: false, kind: 'status', status: response.status, detail: body?.error_messages?.[0] ?? '' }
  }
  if (!body?.token || !body?.redirect_url) return { ok: false, kind: 'shape' }

  return { ok: true, token: body.token, redirectUrl: body.redirect_url }
}
```

Run:

```bash
pnpm vitest run tests/unit/midtrans.test.ts
```

Expected: `Tests  10 passed (10)`.

### T2.5 — Service-role Supabase caller

The webhook must call `apply_billing_event`, which only `service_role` may execute. Add to `server/_lib/supabase.ts`:

```ts
/**
 * The webhook has no user session: Midtrans calls us. It authenticates with the
 * service-role key, which is read here and never returned to a caller. A
 * publishable key is rejected outright so a misconfigured deploy fails closed.
 */
export function readServiceConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig | null {
  const url = env.SUPABASE_URL?.trim() ?? ''
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? ''
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || !key) return null
  if (!key.startsWith('sb_secret_') && !key.startsWith('eyJ')) return null
  return { url: url.replace(/\/$/, ''), key }
}

/** Same call shape as `callRpc`, but authenticates as the service role. */
export async function callRpcAsService(
  name: string,
  args: Record<string, unknown>,
  config: ServerConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<RpcOutcome> {
  let response: Response
  try {
    response = await fetchImpl(`${config.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: config.key,
        authorization: `Bearer ${config.key}`,
      },
      body: JSON.stringify(args),
      signal: timeoutSignal(10000),
    })
  } catch {
    return { ok: false, status: 0, data: null }
  }
  const data = await response.json().catch(() => null)
  return { ok: response.ok, status: response.status, data }
}
```

Add the matching assertions to `tests/unit/deployConfig.test.ts`, inside the existing `describe('phase 3 secret boundary')` block:

```ts
  it('the service-role key is documented server-side only', () => {
    expect(read('.env.server.example')).toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(read('.env.example')).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(read('.env.example')).not.toContain('MIDTRANS_SERVER_KEY')
  })

  it('server code never inlines a VITE_ payment key', () => {
    for (const file of ['server/_lib/midtrans.ts', 'server/billing/checkout.ts', 'server/billing/webhook.ts']) {
      expect(read(file)).not.toMatch(/process\.env\.VITE_|import\.meta\.env/)
    }
  })
```

Then append to `.env.server.example`:

```
# Phase 4 — Midtrans sandbox. Server-only: the client never sees these.
# Snap is called from the server; the browser only follows redirect_url.
MIDTRANS_SERVER_KEY=
MIDTRANS_CLIENT_KEY=
# "true" switches the base URL to app.midtrans.com. Leave empty for sandbox.
MIDTRANS_IS_PRODUCTION=

# Service-role key. Only the webhook reads it, and only to call
# apply_billing_event. Never expose it to the browser and never prefix it VITE_.
SUPABASE_SERVICE_ROLE_KEY=
```

Run:

```bash
pnpm vitest run tests/unit/deployConfig.test.ts
```

Expected: fails on the two new tests because the server files do not exist yet — RED. That is expected; they turn green after T2.6/T2.7.

### T2.6 — Checkout handler (RED)

Create `tests/unit/billingCheckout.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { handleCheckout, type CheckoutDeps } from '../../server/billing/checkout'

const config = { url: 'https://abcd.supabase.co', key: 'sb_publishable_test' }
const midtrans = { serverKey: 'SB-Mid-server-TESTKEY', clientKey: 'SB-Mid-client-TESTKEY', isProduction: false }

function makeDeps(overrides: {
  auth?: () => { ok: boolean; status: number; body: unknown }
  rpc?: (name: string) => { ok: boolean; status: number; body: unknown }
  snap?: () => Response
  calls?: string[]
}): CheckoutDeps {
  const calls = overrides.calls ?? []
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) {
      const r = overrides.auth?.() ?? { ok: true, status: 200, body: { id: 'user-1', email: 'a@example.test' } }
      return { ok: r.ok, status: r.status, json: async () => r.body } as Response
    }
    if (url.includes('/rest/v1/rpc/')) {
      const name = url.split('/').pop() as string
      calls.push(name)
      const r = overrides.rpc?.(name) ?? {
        ok: true, status: 200,
        body: [{ order_id: 'QK-20260101-ABCDEFGHIJ', plan: 'pro', amount_idr: 59000 }],
      }
      return { ok: r.ok, status: r.status, json: async () => r.body } as Response
    }
    calls.push('snap')
    return overrides.snap?.() ?? ({
      ok: true, status: 201,
      json: async () => ({ token: 'snap-token', redirect_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-token' }),
    } as Response)
  }) as unknown as typeof fetch

  return { fetch: fetchImpl, config, midtrans, env: {} as NodeJS.ProcessEnv }
}

const request = (authorization: string | null = 'Bearer user-token') => ({
  authorization,
  body: { plan: 'pro' },
})

describe('handleCheckout', () => {
  it('rejects a request without a token', async () => {
    const outcome = await handleCheckout(request(null), makeDeps({}))
    expect(outcome.status).toBe(401)
    expect((outcome.json as { error: { code: string } }).error.code).toBe('unauthorized')
  })

  it('rejects an unknown plan without calling Midtrans', async () => {
    const calls: string[] = []
    const outcome = await handleCheckout({ authorization: 'Bearer t', body: { plan: 'enterprise' } }, makeDeps({ calls }))
    expect(outcome.status).toBe(422)
    expect(calls).not.toContain('snap')
  })

  it('creates the order server-side and returns the redirect url', async () => {
    const calls: string[] = []
    const outcome = await handleCheckout(request(), makeDeps({ calls }))
    expect(calls).toEqual(['create_billing_order', 'snap', 'attach_billing_session'])
    expect(outcome.status).toBe(200)
    expect(outcome.json).toEqual({ orderId: 'QK-20260101-ABCDEFGHIJ', redirectUrl: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-token' })
  })

  it('never accepts an amount from the client', async () => {
    const calls: string[] = []
    const deps = makeDeps({ calls })
    await handleCheckout({ authorization: 'Bearer t', body: { plan: 'pro', amount: 1 } }, deps)
    const snapCall = (deps.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls
      .find(([url]) => String(url).includes('/snap/v1/transactions'))
    expect(JSON.parse(String(snapCall?.[1].body))).toMatchObject({
      transaction_details: { gross_amount: 59000 },
    })
  })

  it('reports a quota-free but misconfigured server as disabled', async () => {
    const outcome = await handleCheckout(request(), { ...makeDeps({}), midtrans: null })
    expect(outcome.status).toBe(503)
    expect((outcome.json as { error: { code: string } }).error.code).toBe('disabled')
  })

  it('surfaces a Midtrans failure as 502 and does not claim success', async () => {
    const outcome = await handleCheckout(request(), makeDeps({
      snap: () => ({ ok: false, status: 400, json: async () => ({ error_messages: ['bad'] }) } as Response),
    }))
    expect(outcome.status).toBe(502)
    expect((outcome.json as { error: { code: string } }).error.code).toBe('upstream')
  })
})
```

Run:

```bash
pnpm vitest run tests/unit/billingCheckout.test.ts
```

Expected: module-resolution failure — RED.

### T2.7 — Implement checkout, status and webhook (GREEN)

Create `server/billing/checkout.ts`:

```ts
import { createSnapTransaction, readMidtransEnv, type MidtransEnv } from '../_lib/midtrans'
import { callRpc, readCaller, readServerConfig, type ServerConfig } from '../_lib/supabase'

export type CheckoutDeps = {
  fetch: typeof fetch
  env: NodeJS.ProcessEnv
  config: ServerConfig | null
  midtrans: MidtransEnv | null
}

export type HandlerResponse = { status: number; json: Record<string, unknown> }

const error = (status: number, code: string, message: string): HandlerResponse => ({
  status,
  json: { error: { code, message } },
})

type OrderRow = { order_id: string; plan: string; amount_idr: number }

/** Only plans listed here can be bought. The amount always comes from plan_prices. */
const SELLABLE = new Set(['pro'])

export async function handleCheckout(
  input: { authorization: string | null; body: unknown },
  deps: CheckoutDeps,
): Promise<HandlerResponse> {
  const payload = input.body as { plan?: unknown } | null
  const plan = typeof payload?.plan === 'string' ? payload.plan : ''
  if (!SELLABLE.has(plan)) return error(422, 'invalid', 'Paket tidak dikenal.')

  const token = (input.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return error(401, 'unauthorized', 'Masuk dulu untuk berlangganan.')
  if (!deps.config) return error(503, 'disabled', 'Billing belum aktif di server ini.')
  if (!deps.midtrans) return error(503, 'disabled', 'Billing belum aktif di server ini.')

  const caller = await readCaller(token, deps.config, deps.fetch)
  if (!caller) return error(401, 'unauthorized', 'Sesi berakhir. Masuk lagi.')

  const created = await callRpc('create_billing_order', { p_plan: plan }, token, deps.config, deps.fetch)
  const order = Array.isArray(created.data) ? (created.data[0] as OrderRow | undefined) : (created.data as OrderRow | null)
  if (!created.ok || !order?.order_id) {
    return error(502, 'upstream', 'Gagal membuat pesanan. Coba lagi.')
  }

  const snap = await createSnapTransaction(
    { orderId: order.order_id, amountIdr: Number(order.amount_idr), plan, customerEmail: caller.email },
    deps.midtrans,
    deps.fetch,
  )
  if (!snap.ok) return error(502, 'upstream', 'Penyedia pembayaran sedang tidak tersedia.')

  // Store the session so the webhook can be matched back even if the browser
  // never returns. A failure here is not fatal: the order still exists.
  await callRpc(
    'attach_billing_session',
    { p_order_id: order.order_id, p_snap_token: snap.token, p_redirect_url: snap.redirectUrl },
    token,
    deps.config,
    deps.fetch,
  )

  return { status: 200, json: { orderId: order.order_id, redirectUrl: snap.redirectUrl } }
}

const MAX_BODY_BYTES = 8192

/** Thin Web-API wrapper. */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: { code: 'method', message: 'POST only.' } }, { status: 405 })
  }

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json({ error: { code: 'too_long', message: 'Body terlalu besar.' } }, { status: 413 })
  }

  let body: unknown = null
  try { body = JSON.parse(raw) } catch { body = null }

  const outcome = await handleCheckout(
    { authorization: request.headers.get('authorization'), body },
    {
      fetch,
      env: process.env,
      config: readServerConfig(),
      midtrans: readMidtransEnv(),
    },
  )
  return Response.json(outcome.json, { status: outcome.status })
}
```

Create `server/billing/status.ts`:

```ts
import { callRpc, readCaller, readServerConfig, type ServerConfig } from '../_lib/supabase'

export type StatusDeps = {
  fetch: typeof fetch
  env: NodeJS.ProcessEnv
  config: ServerConfig | null
}

export type HandlerResponse = { status: number; json: Record<string, unknown> }

type StatusRow = {
  plan: string
  current_period_end: string | null
  ai_parse_limit: number
  ai_parse_remaining: number
  quote_limit: number
  quote_remaining: number
  market_research_limit: number
}

export async function handleStatus(
  input: { authorization: string | null },
  deps: StatusDeps,
): Promise<HandlerResponse> {
  const token = (input.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return { status: 401, json: { error: { code: 'unauthorized', message: 'Masuk dulu.' } } }
  if (!deps.config) return { status: 503, json: { error: { code: 'disabled', message: 'Billing belum aktif.' } } }

  const caller = await readCaller(token, deps.config, deps.fetch)
  if (!caller) return { status: 401, json: { error: { code: 'unauthorized', message: 'Sesi berakhir.' } } }

  const result = await callRpc('billing_status', {}, token, deps.config, deps.fetch)
  const row = Array.isArray(result.data) ? (result.data[0] as StatusRow | undefined) : (result.data as StatusRow | null)
  if (!result.ok || !row) {
    return { status: 502, json: { error: { code: 'upstream', message: 'Gagal membaca status langganan.' } } }
  }

  return {
    status: 200,
    json: {
      plan: row.plan,
      currentPeriodEnd: row.current_period_end,
      limits: {
        aiParse: row.ai_parse_limit,
        quotes: row.quote_limit,
        marketResearch: row.market_research_limit,
      },
      remaining: {
        aiParse: row.ai_parse_remaining,
        quotes: row.quote_remaining,
      },
    },
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return Response.json({ error: { code: 'method', message: 'GET only.' } }, { status: 405 })
  }
  const outcome = await handleStatus(
    { authorization: request.headers.get('authorization') },
    { fetch, env: process.env, config: readServerConfig() },
  )
  return Response.json(outcome.json, {
    status: outcome.status,
    // A plan read must never be cached by the browser or a CDN.
    headers: { 'cache-control': 'no-store' },
  })
}
```

Create `server/billing/webhook.ts`:

```ts
import { readMidtransEnv, verifySignature, type MidtransEnv } from '../_lib/midtrans'
import { callRpcAsService, readServiceConfig, type ServerConfig } from '../_lib/supabase'

export type WebhookDeps = {
  fetch: typeof fetch
  env: NodeJS.ProcessEnv
  service: ServerConfig | null
  midtrans: MidtransEnv | null
}

export type WebhookResponse = { status: number; json: Record<string, unknown> }

type Notification = {
  order_id?: unknown
  status_code?: unknown
  gross_amount?: unknown
  signature_key?: unknown
  transaction_status?: unknown
  fraud_status?: unknown
  transaction_id?: unknown
  payment_type?: unknown
}

const MAX_BODY_BYTES = 8192

/**
 * Midtrans calls this with no user session. The signature is the only
 * authentication: it is an HMAC-like digest over the order id, status code,
 * amount and our server key, so a forged body cannot be produced without the
 * key. A bad signature answers 401 (visible in the dashboard) while a duplicate
 * answers 200 so the provider stops retrying.
 */
export async function handleWebhook(
  input: { body: unknown; bytes?: number },
  deps: WebhookDeps,
): Promise<WebhookResponse> {
  if ((input.bytes ?? 0) > MAX_BODY_BYTES) {
    return { status: 413, json: { error: { code: 'too_long' } } }
  }
  if (!deps.midtrans || !deps.service) {
    return { status: 503, json: { error: { code: 'disabled' } } }
  }

  const body = input.body as Notification | null
  const orderId = typeof body?.order_id === 'string' ? body.order_id : ''
  const statusCode = typeof body?.status_code === 'string' ? body.status_code : ''
  const grossAmount = typeof body?.gross_amount === 'string' ? body.gross_amount : ''
  const signatureKey = typeof body?.signature_key === 'string' ? body.signature_key : ''
  const transactionStatus = typeof body?.transaction_status === 'string' ? body.transaction_status : ''

  if (!orderId || !statusCode || !grossAmount || !signatureKey || !transactionStatus) {
    return { status: 422, json: { error: { code: 'invalid' } } }
  }

  const valid = verifySignature({
    orderId, statusCode, grossAmount, signatureKey, serverKey: deps.midtrans.serverKey,
  })
  if (!valid) return { status: 401, json: { error: { code: 'bad_signature' } } }

  const result = await callRpcAsService(
    'apply_billing_event',
    {
      p_order_id: orderId,
      p_transaction_status: transactionStatus,
      p_status_code: statusCode,
      p_gross_amount: grossAmount,
      p_fraud_status: typeof body?.fraud_status === 'string' ? body.fraud_status : '',
      p_transaction_id: typeof body?.transaction_id === 'string' ? body.transaction_id : '',
      p_payment_type: typeof body?.payment_type === 'string' ? body.payment_type : '',
    },
    deps.service,
    deps.fetch,
  )

  const row = Array.isArray(result.data) ? (result.data[0] as { applied?: boolean; reason?: string } | undefined) : null
  if (!result.ok || !row) {
    // A 5xx makes Midtrans retry, which is what we want when the database is down.
    return { status: 502, json: { error: { code: 'upstream' } } }
  }

  return { status: 200, json: { applied: row.applied === true, reason: row.reason ?? null } }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: { code: 'method' } }, { status: 405 })
  }
  const raw = await request.text()
  let body: unknown = null
  try { body = JSON.parse(raw) } catch { body = null }

  const outcome = await handleWebhook(
    { body, bytes: raw.length },
    { fetch, env: process.env, service: readServiceConfig(), midtrans: readMidtransEnv() },
  )
  return Response.json(outcome.json, { status: outcome.status })
}
```

Create the three shims — `api/billing/checkout.js`, `api/billing/status.js`, `api/billing/webhook.js`:

```js
// Vercel function entry; logic lives in the compiled CommonJS build.
const { nodeEntry } = require('../../vercel-api/server/_lib/nodeEntry.js')
const mod = require('../../vercel-api/server/billing/checkout.js')

module.exports = nodeEntry(mod.default || mod)
```

```js
const { nodeEntry } = require('../../vercel-api/server/_lib/nodeEntry.js')
const mod = require('../../vercel-api/server/billing/status.js')

module.exports = nodeEntry(mod.default || mod)
```

```js
const { nodeEntry } = require('../../vercel-api/server/_lib/nodeEntry.js')
const mod = require('../../vercel-api/server/billing/webhook.js')

module.exports = nodeEntry(mod.default || mod)
```

Run:

```bash
pnpm vitest run tests/unit/billingCheckout.test.ts tests/unit/deployConfig.test.ts
```

Expected: `billingCheckout` 6 passed; `deployConfig` all passed (the two new secret-boundary tests now find their files).

### T2.8 — Webhook unit tests

Create `tests/unit/billingWebhook.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { handleWebhook, type WebhookDeps } from '../../server/billing/webhook'

const midtrans = { serverKey: 'SB-Mid-server-TESTKEY', clientKey: 'SB-Mid-client-TESTKEY', isProduction: false }
const service = { url: 'https://abcd.supabase.co', key: 'sb_secret_test' }

const sign = (orderId: string, statusCode: string, grossAmount: string) =>
  createHash('sha512').update(`${orderId}${statusCode}${grossAmount}${midtrans.serverKey}`).digest('hex')

const notification = (overrides: Record<string, unknown> = {}) => {
  const orderId = 'QK-20260101-ABCDEFGHIJ'
  const statusCode = '200'
  const grossAmount = '59000.00'
  return {
    order_id: orderId,
    status_code: statusCode,
    gross_amount: grossAmount,
    signature_key: sign(orderId, statusCode, grossAmount),
    transaction_status: 'settlement',
    fraud_status: '',
    transaction_id: 'txn-1',
    payment_type: 'qris',
    ...overrides,
  }
}

function makeDeps(overrides: {
  rpc?: (name: string, args: Record<string, unknown>) => { ok: boolean; status: number; body: unknown }
  service?: typeof service | null
  midtrans?: typeof midtrans | null
}): WebhookDeps {
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const name = String(input).split('/').pop() as string
    const args = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
    const r = overrides.rpc?.(name, args) ?? { ok: true, status: 200, body: [{ applied: true, plan: 'pro', reason: null }] }
    return { ok: r.ok, status: r.status, json: async () => r.body } as Response
  }) as unknown as typeof fetch

  return {
    fetch: fetchImpl,
    env: {} as NodeJS.ProcessEnv,
    service: overrides.service === undefined ? service : overrides.service,
    midtrans: overrides.midtrans === undefined ? midtrans : overrides.midtrans,
  }
}

describe('handleWebhook', () => {
  it('accepts a correctly signed settlement and calls the RPC once', async () => {
    const calls: string[] = []
    const outcome = await handleWebhook({ body: notification() }, makeDeps({
      rpc: (name) => { calls.push(name); return { ok: true, status: 200, body: [{ applied: true, reason: null }] } },
    }))
    expect(outcome.status).toBe(200)
    expect(calls).toEqual(['apply_billing_event'])
  })

  it('rejects a forged signature with 401 and never touches the database', async () => {
    const calls: string[] = []
    const outcome = await handleWebhook(
      { body: notification({ signature_key: 'a'.repeat(128) }) },
      makeDeps({ rpc: (name) => { calls.push(name); return { ok: true, status: 200, body: [] } } }),
    )
    expect(outcome.status).toBe(401)
    expect(calls).toEqual([])
  })

  it('rejects a tampered amount even with a signature for the original', async () => {
    const outcome = await handleWebhook(
      { body: notification({ gross_amount: '1000.00' }) },
      makeDeps({}),
    )
    expect(outcome.status).toBe(401)
  })

  it('answers 200 for a duplicate so the provider stops retrying', async () => {
    const outcome = await handleWebhook({ body: notification() }, makeDeps({
      rpc: () => ({ ok: true, status: 200, body: [{ applied: false, reason: 'duplicate' }] }),
    }))
    expect(outcome.status).toBe(200)
    expect(outcome.json).toEqual({ applied: false, reason: 'duplicate' })
  })

  it('answers 502 when the database write fails, so the provider retries', async () => {
    const outcome = await handleWebhook({ body: notification() }, makeDeps({
      rpc: () => ({ ok: false, status: 500, body: null }),
    }))
    expect(outcome.status).toBe(502)
  })

  it('answers 503 when credentials are absent', async () => {
    const outcome = await handleWebhook({ body: notification() }, makeDeps({ service: null }))
    expect(outcome.status).toBe(503)
  })

  it('rejects a body that is missing required fields', async () => {
    const outcome = await handleWebhook({ body: { order_id: 'QK-1' } }, makeDeps({}))
    expect(outcome.status).toBe(422)
  })

  it('rejects an oversized body before parsing', async () => {
    const outcome = await handleWebhook({ body: notification(), bytes: 9000 }, makeDeps({}))
    expect(outcome.status).toBe(413)
  })
})
```

Run:

```bash
pnpm vitest run tests/unit/billingWebhook.test.ts
```

Expected: `Tests  8 passed (8)`.

### T2.9 — Document Phase 4 and gate

Create `docs/PHASE-4-BILLING.md` with: the sandbox/production split, the three routes and their error codes, the signature formula, the idempotency key of `billing_events`, the entitlement lifecycle (settlement → +1 month, refund → free), how migrations were applied to project `xirgtbnvthgjrvgnfrsg`, and the explicit statement that no production charge is possible while `MIDTRANS_IS_PRODUCTION` is unset.

Full gate:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:sql
```

Expected: all exit 0. New unit tests added in Phase 2: 3 (`nodeEntry`) + 10 (`midtrans`) + 6 (`billingCheckout`) + 8 (`billingWebhook`) = 27, so the total moves from 384 to **411** — read the number off the run and record it in `docs/PHASE-4-BILLING.md`. Also `✓ built in` and `== SQL gate passed ==`.

```bash
git add server/billing server/_lib/midtrans.ts server/_lib/supabase.ts server/_lib/nodeEntry.ts api/billing tests/unit/billingCheckout.test.ts tests/unit/billingWebhook.test.ts tests/unit/midtrans.test.ts tests/unit/nodeEntry.test.ts .env.server.example docs/PHASE-4-BILLING.md
git commit -m "feat(billing): sandbox checkout, verified webhook and status endpoint"
```

### T2.10 — Set the Vercel environment variables

Only the operator can do this. Record in `docs/PHASE-4-BILLING.md` once done.

```bash
npx vercel env add MIDTRANS_SERVER_KEY production
npx vercel env add MIDTRANS_CLIENT_KEY production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
```

Leave `MIDTRANS_IS_PRODUCTION` unset so the base URL stays sandbox. Verify no secret reached the bundle after the next deploy:

```bash
curl -s https://quotekilat.vercel.app/ | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1
```

Then fetch that asset and confirm none of `SB-Mid-server`, `sb_secret_`, `MIDTRANS` appear:

```bash
A=$(curl -s https://quotekilat.vercel.app/ | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1)
curl -s "https://quotekilat.vercel.app$A" | grep -c 'SB-Mid-server\|sb_secret_\|MIDTRANS_SERVER_KEY'
```

Expected: `0`.

---

## Phase 3 — Billing client surface

The browser learns its plan from `/api/billing/status` and nothing else. There is no `localStorage.isPro`, no URL parameter, no optimistic upgrade.

### T3.1 — Billing client library (RED)

Create `tests/unit/billingClient.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { fetchBillingStatus, startCheckout } from '../../src/lib/billing/client'

const okStatus = {
  plan: 'pro',
  currentPeriodEnd: '2026-11-21T00:00:00.000Z',
  limits: { aiParse: 40, quotes: 100, marketResearch: 10 },
  remaining: { aiParse: 39, quotes: 100 },
}

const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response

describe('fetchBillingStatus', () => {
  it('returns the plan and limits', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(okStatus)) as unknown as typeof fetch
    const result = await fetchBillingStatus({ token: 't', fetchImpl })
    expect(result).toEqual({ ok: true, status: okStatus })
  })

  it('reports unauthorized without inventing a plan', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { code: 'unauthorized', message: 'x' } }, 401)) as unknown as typeof fetch
    const result = await fetchBillingStatus({ token: 't', fetchImpl })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('unauthorized')
  })

  it('reports offline instead of throwing', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    const result = await fetchBillingStatus({ token: 't', fetchImpl })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('offline')
  })
})

describe('startCheckout', () => {
  it('sends only the plan name', async () => {
    let body: unknown = null
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body))
      return jsonResponse({ orderId: 'QK-1', redirectUrl: 'https://app.sandbox.midtrans.com/x' })
    }) as unknown as typeof fetch

    const result = await startCheckout({ token: 't', plan: 'pro', fetchImpl })
    expect(body).toEqual({ plan: 'pro' })
    expect(result).toEqual({ ok: true, orderId: 'QK-1', redirectUrl: 'https://app.sandbox.midtrans.com/x' })
  })

  it('refuses a redirect that is not an http(s) url', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ orderId: 'QK-1', redirectUrl: 'javascript:alert(1)' })) as unknown as typeof fetch
    const result = await startCheckout({ token: 't', plan: 'pro', fetchImpl })
    expect(result.ok).toBe(false)
  })
})
```

Run:

```bash
pnpm vitest run tests/unit/billingClient.test.ts
```

Expected: module-resolution failure — RED.

### T3.2 — Implement the client library (GREEN)

Create `src/lib/billing/client.ts`:

```ts
export type BillingPlan = 'free' | 'pro'

export type BillingStatus = {
  plan: BillingPlan
  currentPeriodEnd: string | null
  limits: { aiParse: number; quotes: number; marketResearch: number }
  remaining: { aiParse: number; quotes: number }
}

export type BillingErrorCode = 'unauthorized' | 'disabled' | 'upstream' | 'invalid' | 'offline' | 'unknown'

type Failure = { ok: false; code: BillingErrorCode; message: string }

const MESSAGES: Record<BillingErrorCode, string> = {
  unauthorized: 'Masuk dulu untuk melihat status langganan.',
  disabled: 'Langganan belum aktif di server ini.',
  upstream: 'Server pembayaran sedang sibuk. Coba lagi sebentar.',
  invalid: 'Permintaan tidak valid.',
  offline: 'Tidak ada koneksi. Periksa jaringan Anda.',
  unknown: 'Gagal memuat status langganan.',
}

const codeFrom = (body: unknown, status: number): BillingErrorCode => {
  const raw = (body as { error?: { code?: string } } | null)?.error?.code
  if (raw === 'unauthorized' || raw === 'disabled' || raw === 'upstream' || raw === 'invalid') return raw
  if (status === 401) return 'unauthorized'
  if (status === 503) return 'disabled'
  if (status >= 500) return 'upstream'
  return 'unknown'
}

export async function fetchBillingStatus(input: {
  token: string
  fetchImpl?: typeof fetch
}): Promise<{ ok: true; status: BillingStatus } | Failure> {
  const doFetch = input.fetchImpl ?? fetch
  let response: Response
  try {
    response = await doFetch('/api/billing/status', {
      headers: { authorization: `Bearer ${input.token}` },
      cache: 'no-store',
    })
  } catch {
    return { ok: false, code: 'offline', message: MESSAGES.offline }
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const code = codeFrom(body, response.status)
    return { ok: false, code, message: MESSAGES[code] }
  }

  const parsed = body as BillingStatus | null
  if (!parsed || (parsed.plan !== 'free' && parsed.plan !== 'pro')) {
    return { ok: false, code: 'unknown', message: MESSAGES.unknown }
  }
  return { ok: true, status: parsed }
}

export async function startCheckout(input: {
  token: string
  plan: BillingPlan
  fetchImpl?: typeof fetch
}): Promise<{ ok: true; orderId: string; redirectUrl: string } | Failure> {
  const doFetch = input.fetchImpl ?? fetch
  let response: Response
  try {
    response = await doFetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${input.token}` },
      body: JSON.stringify({ plan: input.plan }),
    })
  } catch {
    return { ok: false, code: 'offline', message: MESSAGES.offline }
  }

  const body = (await response.json().catch(() => null)) as
    | { orderId?: string; redirectUrl?: string; error?: { code?: string } }
    | null

  if (!response.ok) {
    const code = codeFrom(body, response.status)
    return { ok: false, code, message: MESSAGES[code] }
  }

  // Only a real https URL is allowed to navigate away: an attacker who could
  // influence this response must not be able to produce a javascript: target.
  const url = body?.redirectUrl ?? ''
  if (!body?.orderId || !/^https:\/\/[^\s]+$/i.test(url)) {
    return { ok: false, code: 'unknown', message: MESSAGES.unknown }
  }

  return { ok: true, orderId: body.orderId, redirectUrl: url }
}
```

Run:

```bash
pnpm vitest run tests/unit/billingClient.test.ts
```

Expected: `Tests  5 passed (5)`.

```bash
git add src/lib/billing/client.ts tests/unit/billingClient.test.ts && git commit -m "feat(billing): read the plan from the server and validate the redirect target"
```

### T3.3 — Hook that owns the plan state

Create `src/lib/billing/useBilling.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../cloud/authContext'
import { fetchBillingStatus, type BillingStatus } from './client'

export type BillingState = {
  status: BillingStatus | null
  loading: boolean
  error: string | null
  reload: () => void
}

/** The plan lives on the server. This hook only mirrors it for rendering. */
export function useBilling(): BillingState {
  const { client, status: authStatus } = useAuth()
  const signedIn = authStatus === 'signed-in'
  const [state, setState] = useState<BillingStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!signedIn || !client) return
    let cancelled = false
    void client.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token
      if (!token) return
      const result = await fetchBillingStatus({ token })
      if (cancelled) return
      if (result.ok) {
        setState(result.status)
        setError(null)
      } else {
        setError(result.message)
      }
      setLoaded(true)
    })
    return () => { cancelled = true }
  }, [signedIn, client, nonce])

  const reload = useCallback(() => setNonce((value) => value + 1), [])

  return {
    status: signedIn ? state : null,
    loading: signedIn && !loaded && !error,
    error: signedIn ? error : null,
    reload,
  }
}
```

No test file for this hook: it is a thin mirror over `fetchBillingStatus`, which is already covered, and mocking `useAuth` for it would test the mock. Do not add one.

### T3.4 — Replace the hardcoded "5" in the cloud panel

`src/components/cloud/CloudSavePanel.tsx:76` prints `dari 5`. After billing that is wrong for Pro.

Change the component to take the limit from the hook:

```tsx
  const { status: billing } = useBilling()
  const quoteLimit = billing?.limits.quotes ?? 5
```

and the copy line becomes:

```tsx
          ? `Sisa kuota bulan ini: ${remaining === null ? '—' : `${remaining} dari ${quoteLimit}`} penawaran.`
```

Also change the quota-exceeded message at line 49 from a hardcoded `5`:

```tsx
        setFailure(`Kuota ${quoteLimit} penawaran bulan ini sudah habis. Data tetap aman di perangkat ini.`)
```

Add the import:

```tsx
import { useBilling } from '../../lib/billing/useBilling'
```

Then update `tests/components/CloudSavePanel.test.tsx`. Two edits, both required:

**1. Mock the hook.** The test supplies a real `AuthContext.Provider` but `client` is `{} as AuthContextValue['client']`, so `useBilling`'s `client.auth.getSession()` would throw. Add this next to the existing `vi.mock` for `useCloudQuotes` (around line 33):

```tsx
vi.mock('../../src/lib/billing/useBilling', () => ({
  useBilling: () => ({ status: null, loading: false, error: null, reload: () => {} }),
}))
```

**2. Update the quota message assertion.** The old text began `Kuota gratis 5 penawaran`; the new text begins `Kuota 5 penawaran` (the word "gratis" is dropped because a Pro user sees the same sentence). Find this line in the test `explains an exhausted quota and points at the local copy`:

```tsx
    expect(await screen.findByText(/Kuota gratis 5 penawaran bulan ini sudah habis/i)).toBeVisible()
```

and replace it with:

```tsx
    expect(await screen.findByText(/Kuota 5 penawaran bulan ini sudah habis/i)).toBeVisible()
```

Run:

```bash
pnpm vitest run tests/components/CloudSavePanel.test.tsx
```

Expected: `Tests  5 passed (5)` — the file has five tests, and the `dari 5` assertion in the signed-in case still holds because `status` is `null` so the fallback limit is 5.

```bash
git add src/components/cloud/CloudSavePanel.tsx tests/components/CloudSavePanel.test.tsx src/lib/billing/useBilling.ts && git commit -m "feat(cloud): read the quote limit from the plan instead of hardcoding five"
```

### T3.5 — Upgrade panel on the pricing page

Create `src/components/billing/UpgradePanel.tsx`:

```tsx
import { useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useAuth } from '../../lib/cloud/authContext'
import { useBilling } from '../../lib/billing/useBilling'
import { startCheckout } from '../../lib/billing/client'
import './billing.css'

/**
 * Sandbox only: this component never renders a price it did not receive from the
 * server, and it never grants anything. It navigates to the provider's page and
 * the webhook does the rest.
 */
export function UpgradePanel() {
  const { status: authStatus, client } = useAuth()
  const { status: billing, loading } = useBilling()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const signedIn = authStatus === 'signed-in'
  const plan = billing?.plan ?? 'free'

  const upgrade = async () => {
    if (!client) return
    setError('')
    setBusy(true)
    try {
      const { data } = await client.auth.getSession()
      const token = data.session?.access_token
      if (!token) {
        setError('Masuk dulu untuk berlangganan.')
        return
      }
      const result = await startCheckout({ token, plan: 'pro' })
      if (!result.ok) {
        setError(result.message)
        return
      }
      window.location.assign(result.redirectUrl)
    } finally {
      setBusy(false)
    }
  }

  if (!signedIn) {
    return (
      <p className="billing-note">
        Masuk lewat panel <strong>Simpan ke cloud</strong> di kalkulator untuk melihat status langganan.
      </p>
    )
  }

  if (loading) return <p className="billing-note">Memuat status langganan…</p>

  if (plan === 'pro') {
    return (
      <p className="billing-status" role="status">
        Paket Pro aktif{billing?.currentPeriodEnd
          ? ` sampai ${new Date(billing.currentPeriodEnd).toLocaleDateString('id-ID')}`
          : ''}.
        {' '}Kuota bulan ini: {billing?.remaining.aiParse ?? 0} dari {billing?.limits.aiParse ?? 0} parse AI,
        {' '}{billing?.remaining.quotes ?? 0} dari {billing?.limits.quotes ?? 0} penawaran cloud.
      </p>
    )
  }

  return (
    <div className="billing-upgrade">
      <p className="billing-note">
        Pembayaran berjalan di <strong>mode sandbox Midtrans</strong>. Tidak ada uang yang ditarik.
      </p>
      <button type="button" className="button button-primary" onClick={() => { void upgrade() }} disabled={busy}>
        {busy ? <><Loader2 size={16} className="spin" /> Membuka pembayaran…</> : <>Coba Pro (sandbox) <ArrowRight size={16} aria-hidden="true" /></>}
      </button>
      {error && <p className="billing-error" role="alert">{error}</p>}
    </div>
  )
}
```

Create `src/components/billing/billing.css`:

```css
.billing-upgrade { display:flex; flex-direction:column; gap:.6rem; align-items:flex-start; }
.billing-note { margin:0; color:var(--muted); font-size:.8rem; line-height:1.7; }
.billing-status { margin:0; color:#0b6b48; font-size:.8rem; line-height:1.7; }
.billing-error { margin:0; color:#a3231d; font-size:.78rem; }
```

Mount it inside `PricingPlans` in `src/components/landing/MarketingSections.tsx`, directly after the `qk-plans` closing `</div>` and before `qk-pricing-footnote`:

```tsx
        <UpgradePanel />
```

with the import at the top of that file:

```tsx
import { UpgradePanel } from '../billing/UpgradePanel'
```

Then, per T0.5, change the Pro card's status line from `Rencana · belum aktif` to:

```tsx
            <p className="qk-plan-status">Sandbox · uji coba</p>
```

and its footer line from `Langganan belum tersedia` to:

```tsx
            <p className="qk-plan-unavailable">Pembayaran uji coba lewat Midtrans sandbox</p>
```

Leave the Free Account card's `Rencana · belum aktif` alone — free accounts are not part of this phase.

Then update `src/components/landing/MarketingSections.test.tsx`. The test `offers only Guest now and marks all account and Pro additions as future proposals` loops over both plans and asserts `Rencana · belum aktif` for each. Split the loop so Free Account keeps that assertion and Pro asserts the sandbox label instead.

Replace lines 37-45 (the `for (const name of ['Free Account', 'Pro']) { ... }` block) with:

```tsx
    const free = screen.getByRole('article', { name: 'Free Account' })
    expect(within(free).queryByRole('link')).not.toBeInTheDocument()
    expect(within(free).queryByRole('button')).not.toBeInTheDocument()
    expect(within(free).getByText('Rencana · belum aktif')).toBeVisible()
    for (const feature of within(free).getAllByRole('listitem')) {
      expect(feature).toHaveTextContent('Nanti')
    }

    const pro = screen.getByRole('article', { name: 'Pro' })
    expect(within(pro).queryByRole('link')).not.toBeInTheDocument()
    expect(within(pro).queryByRole('button')).not.toBeInTheDocument()
    expect(within(pro).getByText('Sandbox · uji coba')).toBeVisible()
    expect(within(pro).getByText(/Midtrans sandbox/)).toBeVisible()
    for (const feature of within(pro).getAllByRole('listitem')) {
      expect(feature).toHaveTextContent('Nanti')
    }
```

`UpgradePanel` renders its button *outside* the three plan articles, so `within(pro).queryByRole('button')` still passes. Do not move it inside the Pro card.

Run:

```bash
pnpm vitest run src/components/landing/MarketingSections.test.tsx
pnpm typecheck && pnpm lint
```

Expected: green, exit 0.

### T3.6 — Verify the sandbox flow by hand, then record it

This step needs the operator's Midtrans sandbox dashboard and is not automatable.

1. `pnpm dev`, sign in with a test account.
2. Open `/#harga`, click `Coba Pro (sandbox)`.
3. Confirm the browser lands on `app.sandbox.midtrans.com` with the correct Rp59.000.
4. Pay with a Midtrans sandbox instrument (QRIS simulator or a sandbox credit card from the dashboard).
5. After returning, reload `/#harga` and confirm `Paket Pro aktif`.
6. In the Supabase dashboard, confirm one `billing_orders` row is `paid`, one `billing_events` row exists, and `entitlements` reads `pro`.
7. Re-send the same notification from the Midtrans dashboard. Confirm the response is `{"applied":false,"reason":"duplicate"}` and the period did not move.

Record the observed results in `docs/PHASE-4-BILLING.md`. If step 4 is impossible, say so plainly in the doc rather than writing "verified".

### T3.7 — Phase 3 gate and commit

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e
```

Expected: all exit 0. Phase 3 adds 5 tests (`billingClient`), so the unit total should read `416 passed`; E2E stays `24 passed` because nothing user-visible changed in a way the suite asserts.

```bash
git add src/components/billing src/components/landing/MarketingSections.tsx src/components/landing/MarketingSections.test.tsx docs/PHASE-4-BILLING.md
git commit -m "feat(billing): sandbox upgrade panel driven by the server-side plan"
```

---

## Phase 4 — Phase 5 groundwork: consent-gated, self-hosted analytics

Constraint that decides the design: `tests/e2e/guest.spec.ts` asserts **zero third-party requests**, and CSP is `connect-src 'self' https://*.supabase.co`. So analytics must post to our own origin, stay silent until consent, and store aggregates — never quote contents, costs, or pasted text.

### T4.1 — Event schema and redaction (RED)

Create `tests/unit/analytics.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ALLOWED_EVENTS, buildEvent, scrubProps } from '../../src/lib/analytics/events'

describe('ALLOWED_EVENTS', () => {
  it('is a closed list', () => {
    expect(ALLOWED_EVENTS).toContain('quote_completed')
    expect(ALLOWED_EVENTS).toContain('pdf_downloaded')
    expect(ALLOWED_EVENTS).toContain('smart_input_applied')
    expect(ALLOWED_EVENTS).toContain('checkout_started')
  })
})

describe('scrubProps', () => {
  it('drops any key that is not on the allow list', () => {
    expect(scrubProps({ mode: 'goods', customerName: 'Budi', notes: 'rahasia' })).toEqual({ mode: 'goods' })
  })

  it('drops free text values even under an allowed key', () => {
    expect(scrubProps({ mode: 'a very long sentence that is clearly free text' })).toEqual({})
  })

  it('keeps short enumerated values and integers', () => {
    expect(scrubProps({ mode: 'goods', quantity: 25, marginBucket: '30-40' }))
      .toEqual({ mode: 'goods', quantity: 25, marginBucket: '30-40' })
  })

  it('never keeps a value longer than 40 characters', () => {
    expect(scrubProps({ marginBucket: 'x'.repeat(41) })).toEqual({})
  })
})

describe('buildEvent', () => {
  it('produces a stable shape with no identifiers', () => {
    const event = buildEvent('quote_completed', { mode: 'goods', quantity: 3 })
    expect(Object.keys(event).sort()).toEqual(['name', 'props', 'ts'])
    expect(event.name).toBe('quote_completed')
    expect(event.props).toEqual({ mode: 'goods', quantity: 3 })
    expect(typeof event.ts).toBe('string')
  })

  it('refuses an unknown event name', () => {
    expect(() => buildEvent('customer_email_captured' as never, {})).toThrow()
  })
})
```

Run:

```bash
pnpm vitest run tests/unit/analytics.test.ts
```

Expected: module-resolution failure — RED.

### T4.2 — Implement the event module (GREEN)

Create `src/lib/analytics/events.ts`:

```ts
/**
 * A closed event vocabulary. Anything not listed here cannot be recorded, which
 * is what keeps a future contributor from shipping `customer_name` as a
 * property by accident.
 */
export const ALLOWED_EVENTS = [
  'quote_completed',
  'pdf_downloaded',
  'whatsapp_copied',
  'cloud_quote_saved',
  'smart_input_applied',
  'checkout_started',
  'market_research_run',
  'plan_viewed',
] as const

export type AnalyticsEventName = (typeof ALLOWED_EVENTS)[number]

/** Property keys that may be recorded. Values are additionally capped. */
const ALLOWED_PROPS = new Set(['mode', 'quantity', 'marginBucket', 'plan', 'result', 'source'])
const MAX_VALUE_CHARS = 40

export type AnalyticsEvent = {
  name: AnalyticsEventName
  props: Record<string, string | number>
  ts: string
}

/**
 * Free text is indistinguishable from a customer name at this layer, so any
 * string longer than a short enum label is dropped. Numbers are kept only when
 * they are finite integers.
 */
export function scrubProps(raw: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!ALLOWED_PROPS.has(key)) continue
    if (typeof value === 'number') {
      if (Number.isInteger(value) && Math.abs(value) <= 1_000_000) out[key] = value
      continue
    }
    if (typeof value === 'string' && value.length > 0 && value.length <= MAX_VALUE_CHARS) out[key] = value
  }
  return out
}

export function buildEvent(name: AnalyticsEventName, props: Record<string, unknown>): AnalyticsEvent {
  if (!(ALLOWED_EVENTS as readonly string[]).includes(name)) {
    throw new Error(`unknown analytics event: ${name}`)
  }
  return { name, props: scrubProps(props), ts: new Date().toISOString() }
}
```

Run:

```bash
pnpm vitest run tests/unit/analytics.test.ts
```

Expected: `Tests  7 passed (7)`.

### T4.3 — Consent state and the sender

Create `src/lib/analytics/consent.ts`:

```ts
export const CONSENT_KEY = 'quotekilat:analytics-consent:v1'
export type Consent = 'granted' | 'denied' | 'unset'

export function readConsent(): Consent {
  try {
    const raw = localStorage.getItem(CONSENT_KEY)
    return raw === 'granted' || raw === 'denied' ? raw : 'unset'
  } catch {
    return 'unset'
  }
}

export function writeConsent(value: Exclude<Consent, 'unset'>): boolean {
  try {
    localStorage.setItem(CONSENT_KEY, value)
    return true
  } catch {
    return false
  }
}
```

Create `src/lib/analytics/track.ts`:

```ts
import { readConsent } from './consent'
import { buildEvent, type AnalyticsEventName } from './events'

/**
 * Fire-and-forget. Never awaited by the caller, never throws, never blocks a
 * user action, and completely silent without consent. `keepalive` lets a
 * navigation to the payment provider still deliver the event.
 */
export function track(name: AnalyticsEventName, props: Record<string, unknown> = {}): void {
  if (readConsent() !== 'granted') return
  let body: string
  try {
    body = JSON.stringify(buildEvent(name, props))
  } catch {
    return
  }
  void fetch('/api/analytics/collect', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined)
}
```

Create `tests/unit/analyticsTrack.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { track } from '../../src/lib/analytics/track'
import { CONSENT_KEY } from '../../src/lib/analytics/consent'

describe('track', () => {
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

  it('does nothing without consent', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    track('quote_completed', { mode: 'goods' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('posts to our own origin when consent is granted', () => {
    localStorage.setItem(CONSENT_KEY, 'granted')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    track('quote_completed', { mode: 'goods', customerName: 'Budi' })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/analytics/collect')
    expect(JSON.parse(String(init.body)).props).toEqual({ mode: 'goods' })
  })

  it('does not throw when the network fails', () => {
    localStorage.setItem(CONSENT_KEY, 'granted')
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    expect(() => track('quote_completed', {})).not.toThrow()
  })
})
```

Run:

```bash
pnpm vitest run tests/unit/analyticsTrack.test.ts
```

Expected: `Tests  3 passed (3)`.

### T4.4 — Collector route

Create `tests/unit/analyticsCollect.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { handleCollect, type CollectDeps } from '../../server/analytics/collect'

const makeDeps = (rpc?: () => { ok: boolean; status: number; body: unknown }): CollectDeps => {
  const fetchImpl = vi.fn(async () =>
    ({ ok: true, status: 200, json: async () => rpc?.() ?? { ok: true, status: 200, body: null } }) as Response,
  ) as unknown as typeof fetch
  return { fetch: fetchImpl, env: {} as NodeJS.ProcessEnv, config: null }
}

describe('handleCollect', () => {
  it('accepts an allowed event and answers 204 without a database', async () => {
    const outcome = await handleCollect(
      { body: { name: 'quote_completed', props: { mode: 'goods' }, ts: new Date().toISOString() }, bytes: 80 },
      makeDeps(),
    )
    expect(outcome.status).toBe(204)
  })

  it('rejects an unknown event name', async () => {
    const outcome = await handleCollect({ body: { name: 'customer_email', props: {} }, bytes: 40 }, makeDeps())
    expect(outcome.status).toBe(422)
  })

  it('rejects a property key outside the allow list', async () => {
    const outcome = await handleCollect(
      { body: { name: 'quote_completed', props: { customerName: 'Budi' } }, bytes: 60 },
      makeDeps(),
    )
    expect(outcome.status).toBe(422)
  })

  it('rejects an oversized body', async () => {
    const outcome = await handleCollect({ body: { name: 'quote_completed', props: {} }, bytes: 5000 }, makeDeps())
    expect(outcome.status).toBe(413)
  })
})
```

Run it (RED), then create `server/analytics/collect.ts`:

```ts
/**
 * Deliberately minimal: no database write in this phase. The route exists so the
 * client has a same-origin target, the vocabulary is enforced server-side too,
 * and a later phase can persist aggregates without changing the contract.
 *
 * A 204 is returned even when the body is fine but nothing is stored: the client
 * must never branch on analytics success.
 */
const ALLOWED_EVENTS = new Set([
  'quote_completed', 'pdf_downloaded', 'whatsapp_copied', 'cloud_quote_saved',
  'smart_input_applied', 'checkout_started', 'market_research_run', 'plan_viewed',
])

const ALLOWED_PROPS = new Set(['mode', 'quantity', 'marginBucket', 'plan', 'result', 'source'])
const MAX_BODY_BYTES = 2048

export type CollectDeps = {
  fetch: typeof fetch
  env: NodeJS.ProcessEnv
  config: { url: string; key: string } | null
}

export type CollectResponse = { status: number; json: Record<string, unknown> }

export async function handleCollect(
  input: { body: unknown; bytes?: number },
  _deps: CollectDeps,
): Promise<CollectResponse> {
  if ((input.bytes ?? 0) > MAX_BODY_BYTES) return { status: 413, json: { error: { code: 'too_long' } } }

  const body = input.body as { name?: unknown; props?: unknown } | null
  const name = typeof body?.name === 'string' ? body.name : ''
  if (!ALLOWED_EVENTS.has(name)) return { status: 422, json: { error: { code: 'invalid' } } }

  const props = body?.props
  if (props !== undefined && (typeof props !== 'object' || props === null)) {
    return { status: 422, json: { error: { code: 'invalid' } } }
  }
  for (const key of Object.keys((props ?? {}) as Record<string, unknown>)) {
    if (!ALLOWED_PROPS.has(key)) return { status: 422, json: { error: { code: 'invalid' } } }
  }

  return { status: 204, json: {} }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  const raw = await request.text()
  let body: unknown = null
  try { body = JSON.parse(raw) } catch { body = null }

  const outcome = await handleCollect({ body, bytes: raw.length }, { fetch, env: process.env, config: null })
  return new Response(outcome.status === 204 ? null : JSON.stringify(outcome.json), {
    status: outcome.status,
    headers: outcome.status === 204 ? undefined : { 'content-type': 'application/json' },
  })
}
```

Create `api/analytics/collect.js`:

```js
const { nodeEntry } = require('../../vercel-api/server/_lib/nodeEntry.js')
const mod = require('../../vercel-api/server/analytics/collect.js')

module.exports = nodeEntry(mod.default || mod)
```

Run:

```bash
pnpm vitest run tests/unit/analyticsCollect.test.ts
```

Expected: `Tests  4 passed (4)`.

### T4.5 — Consent banner

Create `src/components/analytics/ConsentBanner.tsx`:

```tsx
import { useState } from 'react'
import { readConsent, writeConsent } from '../../lib/analytics/consent'
import './consent.css'

/**
 * No event is sent before an explicit choice. Denying is as easy as granting,
 * and the banner never reappears once a choice exists.
 */
export function ConsentBanner() {
  const [choice, setChoice] = useState(readConsent)

  if (choice !== 'unset') return null

  const decide = (value: 'granted' | 'denied') => {
    writeConsent(value)
    setChoice(value)
  }

  return (
    <div className="consent-banner" role="region" aria-label="Pilihan analitik">
      <p>
        Boleh QuoteKilat mencatat statistik pemakaian tanpa data pribadi? Isi penawaran, biaya,
        dan nama pelanggan tidak pernah dikirim.
      </p>
      <div className="consent-actions">
        <button type="button" className="button button-secondary" onClick={() => decide('denied')}>Tidak</button>
        <button type="button" className="button button-primary" onClick={() => decide('granted')}>Boleh</button>
      </div>
    </div>
  )
}
```

Create `src/components/analytics/consent.css`:

```css
.consent-banner {
  position: fixed; left: 1rem; right: 1rem; bottom: 1rem; z-index: 60;
  display: flex; flex-wrap: wrap; gap: .75rem; align-items: center; justify-content: space-between;
  padding: .9rem 1rem; border-radius: 12px;
  background: #0f1b33; color: #eaf0ff; box-shadow: 0 18px 50px -30px #000c;
}
.consent-banner p { margin: 0; max-width: 46ch; font-size: .8rem; line-height: 1.65; }
.consent-actions { display: flex; gap: .5rem; }
.consent-actions .button { min-height: 40px; }
@media (max-width: 540px) { .consent-banner { left: .6rem; right: .6rem; bottom: .6rem; } }
```

Mount it in `src/app/App.tsx` inside `App()`, right after `<Footer />`:

```tsx
      <Footer />
      <ConsentBanner />
```

with `import { ConsentBanner } from '../components/analytics/ConsentBanner'`.

Create `src/components/analytics/ConsentBanner.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConsentBanner } from './ConsentBanner'
import { CONSENT_KEY } from '../../lib/analytics/consent'

describe('ConsentBanner', () => {
  afterEach(() => localStorage.clear())

  it('shows the choice when nothing is stored', () => {
    render(<ConsentBanner />)
    expect(screen.getByRole('region', { name: 'Pilihan analitik' })).toBeVisible()
  })

  it('stores the decision and disappears', async () => {
    const user = userEvent.setup()
    render(<ConsentBanner />)
    await user.click(screen.getByRole('button', { name: 'Tidak' }))
    expect(localStorage.getItem(CONSENT_KEY)).toBe('denied')
    expect(screen.queryByRole('region', { name: 'Pilihan analitik' })).toBeNull()
  })

  it('stays hidden once a decision exists', () => {
    localStorage.setItem(CONSENT_KEY, 'granted')
    render(<ConsentBanner />)
    expect(screen.queryByRole('region', { name: 'Pilihan analitik' })).toBeNull()
  })
})
```

`@testing-library/user-event` 14.6.8 is already a devDependency, so nothing to install. Verify with:

```bash
node -e "console.log(require('./package.json').devDependencies['@testing-library/user-event'])"
```

Expected: `14.6.8` (any 14.x is fine).

Run:

```bash
pnpm vitest run src/components/analytics/ConsentBanner.test.tsx
```

Expected: `Tests  3 passed (3)`.

### T4.6 — Instrument four call sites

Add `track(...)` calls at exactly these places, and nowhere else:

1. `src/components/quote-builder/LiveInvoicePreview.tsx` — in the PDF click handler, before generating: `track('pdf_downloaded', { mode: 'unknown' })`. If the component already has the mode in props, pass it; if not, drop the prop rather than threading new state.
2. `src/components/quote-builder/LiveInvoicePreview.tsx` — in the copy handler: `track('whatsapp_copied')`.
3. `src/components/cloud/CloudSavePanel.tsx` — after a successful save: `track('cloud_quote_saved', { plan: billing?.plan ?? 'free' })`.
4. `src/components/billing/UpgradePanel.tsx` — immediately before `window.location.assign`: `track('checkout_started', { plan: 'pro' })`.

Import in each file:

```tsx
import { track } from '../../lib/analytics/track'
```

(adjust the relative depth per file). These are side effects inside existing handlers, so no test changes are needed; the E2E suite still asserts zero third-party requests because `/api/analytics/collect` is same-origin.

### T4.7 — Extend the E2E no-tracking assertion

`tests/e2e/guest.spec.ts` already asserts no external requests. Add an assertion that no analytics request leaves the page before a consent choice:

```ts
  test('sends no analytics before a consent choice', async ({ page }) => {
    const collected: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/analytics/collect')) collected.push(request.url())
    })
    await page.goto('/')
    await page.locator('#quote-builder').scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    expect(collected).toHaveLength(0)
  })
```

Run:

```bash
pnpm test:e2e 2>&1 | tail -5
```

Expected: `26 passed` (12 + 1 new test, × 2 projects).

### T4.8 — Phase 4 gate and commit

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e
```

Expected: exit 0. The exact unit total rises by 17 from the Phase 3 baseline (7 events + 3 track + 4 collect + 3 banner), so if Phase 3 ended at 416 the new total is `433 passed`. Read the number off the run and record it in `docs/PHASE-4-BILLING.md`; do not assert a guessed number anywhere in code. E2E: `26 passed`.

```bash
git add src/lib/analytics src/components/analytics server/analytics api/analytics tests/unit/analytics*.test.ts tests/e2e/guest.spec.ts src/app/App.tsx src/components/quote-builder/LiveInvoicePreview.tsx src/components/cloud/CloudSavePanel.tsx src/components/billing/UpgradePanel.tsx
git commit -m "feat(analytics): consent-gated same-origin event collection with a closed vocabulary"
```

---

## Phase 5 — Market Insights

The honest version of this feature is small: one search-grounded provider call, a comparability gate, and an explicit insufficient-data state. It must never invent a price.

### T5.1 — Response schema and the comparability gate (RED)

Create `tests/unit/marketSchema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildMarketResult, type RawSource } from '../../src/lib/market/schema'

const source = (overrides: Partial<RawSource> = {}): RawSource => ({
  title: 'Hampers kain 25 pcs',
  url: 'https://contoh.test/hampers',
  priceIdr: 250000,
  unit: 'paket',
  observedAt: '2026-10-01',
  region: 'Jakarta',
  specs: 'kain, 25 pcs',
  ...overrides,
})

describe('buildMarketResult', () => {
  it('reports insufficient sources below three comparables', () => {
    const result = buildMarketResult({ query: 'hampers kain', sources: [source(), source()], checkedAt: '2026-10-21T00:00:00.000Z' })
    expect(result.status).toBe('insufficient_sources')
    expect(result.observedRange).toBeNull()
    expect(result.message).toContain('Belum cukup')
  })

  it('reports a range from three or more comparables', () => {
    const result = buildMarketResult({
      query: 'hampers kain',
      sources: [source(), source({ priceIdr: 300000 }), source({ priceIdr: 275000 })],
      checkedAt: '2026-10-21T00:00:00.000Z',
    })
    expect(result.status).toBe('ok')
    expect(result.observedRange).toEqual({ minIdr: 250000, maxIdr: 300000, count: 3 })
  })

  it('drops a source without a url or a positive price', () => {
    const result = buildMarketResult({
      query: 'x',
      sources: [source(), source({ url: '' }), source({ priceIdr: 0 })],
      checkedAt: '2026-10-21T00:00:00.000Z',
    })
    expect(result.sources).toHaveLength(1)
    expect(result.status).toBe('insufficient_sources')
  })

  it('drops a non-https url', () => {
    const result = buildMarketResult({ query: 'x', sources: [source({ url: 'javascript:alert(1)' })], checkedAt: '2026-10-21T00:00:00.000Z' })
    expect(result.sources).toHaveLength(0)
  })

  it('never returns a recommendation', () => {
    const result = buildMarketResult({
      query: 'x',
      sources: [source(), source(), source()],
      checkedAt: '2026-10-21T00:00:00.000Z',
    })
    expect(result.recommendation).toBeNull()
  })
})
```

Run (RED), then create `src/lib/market/schema.ts`:

```ts
export type RawSource = {
  title: string
  url: string
  priceIdr: number
  unit: string
  observedAt: string
  region: string
  specs: string
}

export type MarketSource = RawSource & { host: string }

export type MarketResult = {
  status: 'ok' | 'insufficient_sources'
  checkedAt: string
  query: string
  sources: MarketSource[]
  observedRange: { minIdr: number; maxIdr: number; count: number } | null
  recommendation: null
  message: string
}

const MIN_COMPARABLES = 3

/**
 * The blueprint forbids presenting a range as a market price. This function is
 * the gate: below three genuine comparables it returns the insufficient state
 * and no numbers at all, so a caller cannot accidentally render a range.
 */
export function buildMarketResult(input: {
  query: string
  sources: RawSource[]
  checkedAt: string
}): MarketResult {
  const usable: MarketSource[] = []
  for (const source of input.sources) {
    if (!/^https:\/\/[^\s]+$/i.test(source.url)) continue
    if (!Number.isInteger(source.priceIdr) || source.priceIdr <= 0) continue
    if (!source.title.trim()) continue
    let host = ''
    try { host = new URL(source.url).host } catch { continue }
    usable.push({ ...source, host })
  }

  if (usable.length < MIN_COMPARABLES) {
    return {
      status: 'insufficient_sources',
      checkedAt: input.checkedAt,
      query: input.query,
      sources: usable,
      observedRange: null,
      recommendation: null,
      message: 'Belum cukup referensi harga yang dapat dibandingkan.',
    }
  }

  const prices = usable.map((item) => item.priceIdr)
  return {
    status: 'ok',
    checkedAt: input.checkedAt,
    query: input.query,
    sources: usable,
    observedRange: { minIdr: Math.min(...prices), maxIdr: Math.max(...prices), count: usable.length },
    recommendation: null,
    message: 'Kisaran ini berasal dari penawaran yang ditemukan, bukan harga pasar universal.',
  }
}
```

Run:

```bash
pnpm vitest run tests/unit/marketSchema.test.ts
```

Expected: `Tests  5 passed (5)`.

### T5.2 — Server route with quota

Create `tests/unit/marketResearch.test.ts` modelled on `billingCheckout.test.ts`: cover (a) 401 without token, (b) 409 when `begin_market_research` says no, (c) 200 with the built result when the provider returns three sources, (d) 502 and a refund call when the provider fails, (e) 503 when unconfigured, (f) the returned payload never contains `recommendation` other than `null`.

The handler follows the same three-file shape as `server/billing/*`: a pure `handleMarketResearch(input, deps)`, a `default` Web wrapper, and `api/market/research.js` shim. Reuse `nodeEntry`, `callRpc`, `readCaller`, `readServerConfig`, `readProviderEnv`, `timeoutSignal`.

The handler test file is specified by pattern rather than pasted in full because its shape is byte-for-byte the one you already built twice in T2.6 and T2.8: a pure `handleMarketResearch(input, deps)`, a `makeDeps()` with a fake `fetch` that routes `/auth/v1/user`, `/rest/v1/rpc/*` and the provider URL, and a `calls` array to assert ordering. Copy `tests/unit/billingCheckout.test.ts` and change the assertions to the six cases listed above. Every case must assert on `outcome.status` and, where relevant, on `outcome.json` — never on an internal call count alone.

The quota migration is genuinely new, so here it is in full. Create `supabase/migrations/0005_phase5_market.sql`:

```sql
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
```

Note the deliberate divergence from `begin_ai_parse`: the `v_limit = 0` early return. Free users have a zero market-research limit, and without that branch the first call would increment the IP throttle and then report `quota` anyway — correct outcome, but the throttle row is wasted and a free user hammering the button would exhaust a bucket that only matters for paying users. Keep the branch.

Then create `supabase/tests/phase5_market.sql` and register it in `scripts/verify-supabase.sh`. It must prove exactly four things: free plan returns `reason = 'quota'` on the first call and writes no `usage_counters` row; Pro returns `allowed` and leaves 9; a replayed key returns `reason = 'replay'` and does not increment the counter; `anon` has no EXECUTE on either function and no SELECT on `market_research_log`. Use the same `public._r` + `set_config` + `set role` pattern as the other suites. Mirror the migration into `supabase/apply-all.sql` before `commit;` and re-run `pnpm test:sql`.

Add the search provider env to `.env.server.example`:

```
# Phase 5 — Market Insights. Server-only. Leave empty to keep the feature in its
# honest "belum aktif" state: the route then answers 503 and the UI says so.
SEARCH_BASE_URL=
SEARCH_API_KEY=
SEARCH_MODEL=
```

Add `MIDTRANS`-style env for search: `SEARCH_BASE_URL`, `SEARCH_API_KEY`, `SEARCH_MODEL` in `.env.server.example`, read by a new `readSearchEnv()` in `server/_lib/search.ts`. If unset, the route answers `503 disabled` and the UI shows `Harga pasar belum aktif` — never a fabricated range.

### T5.3 — Replace the placeholder section

`src/components/landing/MarketingSections.tsx:130-217` (`MarketInsights`) currently renders a disabled button and an empty table. Replace the disabled button with a real form that is only enabled when signed in with Pro:

- Keep the heading and the honest description.
- Replace the `<button disabled>` with a `<button>` that opens an inline `<textarea>` + submit, gated by `billing?.plan === 'pro'`; otherwise render the existing `belum aktif` note with the text `Butuh paket Pro. Kuota pasar belum aktif di paket gratis.`
- Render `result.status === 'insufficient_sources'` as the message only, with the source list (host + date + price) below it — never a range.
- Render `result.status === 'ok'` as a `<dl>` with `Kisaran penawaran teramati` and the count, plus a `<table>` of `host`, `observedAt`, `unit`, `priceIdr`, each linking out with `rel="noopener noreferrer"`.
- Always render `result.message` and a `Diperiksa: <date>` line.

`src/components/landing/MarketingSections.tsx` renders `MarketInsights` without auth context, so the Pro gate must come from `useBilling()` inside the component. Add:

```tsx
import { useBilling } from '../../lib/billing/useBilling'
```

and inside `MarketInsights`, before the `return`:

```tsx
  const { status: billing } = useBilling()
  const isPro = billing?.plan === 'pro'
```

Replace the disabled button block (lines 143-154) with:

```tsx
          {isPro ? (
            <a className="button button-secondary qk-future-button" href="/#quote-builder">
              <Search size={17} aria-hidden="true" />
              Cek harga pasar
            </a>
          ) : (
            <>
              <button
                className="button button-secondary qk-future-button"
                type="button"
                disabled
                aria-describedby="qk-market-unavailable"
              >
                <Search size={17} aria-hidden="true" />
                Cek harga pasar · belum aktif
              </button>
              <p className="qk-future-note" id="qk-market-unavailable">
                Butuh paket Pro. Kuota harga pasar belum aktif di paket gratis.
              </p>
            </>
          )}
```

The link points at the builder rather than embedding a second research form in the marketing page: one entry point, and the builder already owns the quote context the research needs. A full inline research UI belongs on its own route, which is out of scope for this plan.

Then update `src/components/landing/MarketingSections.test.tsx`. The file mocks no auth context today, so `useBilling` will call `useAuth` and throw. Add a mock at the top, above the `describe`:

```tsx
vi.mock('../../src/lib/billing/useBilling', () => ({
  useBilling: () => ({ status: null, loading: false, error: null, reload: () => {} }),
}))
```

and change the import line to include `vi`:

```tsx
import { describe, expect, it, vi } from 'vitest'
```

Line 28 (`expect(screen.getByRole('button', { name: /Cek harga pasar/ })).toBeDisabled()`) stays correct, because a signed-out visitor gets the disabled branch. Add one assertion after it proving the Pro path renders a link:

```tsx
    expect(screen.getByText(/Butuh paket Pro/)).toBeVisible()
```

Run:

```bash
pnpm vitest run src/components/landing/MarketingSections.test.tsx
```

Expected: `Tests  4 passed (4)`.

### T5.4 — Phase 5 gate and commit

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e && pnpm test:sql
```

Expected: all exit 0.

```bash
git add src/lib/market src/components/market server/market server/_lib/search.ts api/market supabase/migrations/0005_phase5_market.sql supabase/apply-all.sql supabase/tests tests/unit/market*.test.ts src/components/landing/MarketingSections.tsx src/components/landing/MarketingSections.test.tsx .env.server.example
git commit -m "feat(market): grounded source comparison with an explicit insufficient-data state"
```

---

## Tests / validation summary

| Layer | Command | Expected |
|---|---|---|
| Types | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Unit + component | `pnpm test` | 384 → 411 (Phase 2) → ~433 (Phase 4) → +market tests (Phase 5), all green |
| Build | `pnpm build` | `✓ built in`, `vercel-api/` emitted |
| E2E | `pnpm test:e2e` | 24 → 26 passed |
| SQL | `pnpm test:sql` | `== SQL gate passed ==` on both the per-migration and the `apply-all.sql` database |
| Secret boundary | `pnpm vitest run tests/unit/deployConfig.test.ts` | no `MIDTRANS`/`sb_secret_`/`SERVICE_ROLE` in any client file or `.env.example` |
| Production bundle | `curl` + `grep -c 'SB-Mid-server\|sb_secret_'` on the live asset | `0` |

TDD discipline per task: the test file is created and run **before** the implementation exists, the failure is observed and quoted in the commit message when it is informative, then the implementation lands and the same command is re-run to green. Commit after each green step, never a mixed red commit.

---

## Risks, tradeoffs, and open questions

**Risks**

1. **Midtrans recurring is not free.** Snap one-off transactions work in sandbox without extra eligibility. Automatic renewal via `/v2/subscription` may require a separate merchant agreement. The plan therefore models a **paid period** (`current_period_end`) rather than an auto-renewing subscription: renewal is a new checkout. This is honest and always works; the cost is that a user must pay again each month. If real recurring is required, it is a separate phase with its own eligibility check.
2. **`service_role` in a Vercel env var is a real secret.** If it leaks, an attacker has full database access. Mitigations in this plan: it is read only in `server/_lib/supabase.ts`, `readServiceConfig` rejects a publishable key, `deployConfig.test.ts` asserts it never appears in `.env.example` or client code, and `apply_billing_event` is the only function granted to `service_role`. Rotating it invalidates every deployed function until redeploy.
3. **The SQL gate cannot test the Midtrans round trip.** `pnpm test:sql` proves the database side; the provider side is only proven by T3.6, which needs the operator. If T3.6 is skipped, the plan is unverified end-to-end — say so in the doc rather than claiming otherwise.
4. **A CSP change is not needed, and must not be made.** Any temptation to add `snap.js` or an iframe requires loosening `script-src`/`frame-src`, which `deployConfig.test.ts` explicitly forbids. Redirect-only is a hard constraint, not a preference.
5. **Analytics route currently stores nothing.** T4.4 returns 204 without persisting. That is deliberate for this phase (the E2E suite asserts no third-party traffic and the blueprint forbids tracking raw quotes) but it means the route is only a contract, not an instrument. Persisting aggregates is a follow-up that needs a retention decision first.
6. **`apply-all.sql` drift.** It is maintained by hand. `pnpm test:sql` applies it to a blank database on every run, so drift fails the gate — but only if the new migration is mirrored (T1.4). Do not skip that task.
7. **Quota semantics on refund.** `refund_ai_parse` decrements the counter and deletes the log row. If a refund runs after the month rolls over, it decrements the new month. Pre-existing behaviour; not introduced here. Do not "fix" it in this phase — it needs its own decision.

**Tradeoffs taken**

- Plan lookup via a function call per quota check, rather than caching a plan column on `usage_counters`. Simpler and always correct; the cost is one extra index lookup per parse.
- Entitlement expiry is computed at read time (`current_period_end > now()`), not by a scheduled job. No cron to operate, no job to miss; the cost is that `entitlements.plan` can read `pro` while `current_plan()` says `free`, which is why every read must go through `current_plan()`/`billing_status()`.
- Billing events keyed by `(order_id, transaction_status, status_code, fraud_status)`. This makes a legitimate status progression (pending → settlement) two rows and a provider retry zero rows, which is exactly the behaviour wanted. It also means two genuinely different settlements for one order cannot both be recorded — acceptable because one order is one payment.
- Analytics as a closed vocabulary in two places (client and server). Duplication is intentional: the server must not trust the client, and a shared import would pull client code into the server build.

**Open questions for the operator**

1. Renewal model: paid period with manual re-checkout (as planned), or pursue Midtrans recurring eligibility now? The plan assumes the former.
2. Should Pro also lift the cloud-quote limit from 5 to 100 in this phase, or keep cloud storage at 5 for everyone until the history UI can handle 100 rows? The plan implements 100; say so if you want 5.
3. Free Account is still `belum aktif` in the pricing cards. Is Free Account (5 quotes, 2 parses, no billing) supposed to become a real signup tier in this phase, or does Pro billing ship while Free Account stays a plan?
4. Where should `docs/PHASE-4-BILLING.md` record the sandbox transaction id? It contains no personal data, but it does identify a test payment. Confirm it may be committed.
5. Analytics persistence: the collector currently answers 204 and stores nothing. Do you want aggregates persisted in this phase (needs a retention decision and a `analytics_events` table), or is the contract alone enough until Phase 5 proper?

---

## Appendix — file map

**Created**

```
supabase/migrations/0004_phase4_billing.sql
supabase/migrations/0005_phase5_market.sql
supabase/tests/phase4_billing.sql
supabase/tests/phase5_market.sql
server/_lib/nodeEntry.ts
server/_lib/midtrans.ts
server/_lib/search.ts
server/billing/checkout.ts
server/billing/status.ts
server/billing/webhook.ts
server/analytics/collect.ts
server/market/research.ts
api/billing/checkout.js
api/billing/status.js
api/billing/webhook.js
api/analytics/collect.js
api/market/research.js
src/lib/billing/client.ts
src/lib/billing/useBilling.ts
src/lib/analytics/events.ts
src/lib/analytics/consent.ts
src/lib/analytics/track.ts
src/lib/market/schema.ts
src/components/billing/UpgradePanel.tsx
src/components/billing/billing.css
src/components/analytics/ConsentBanner.tsx
src/components/analytics/ConsentBanner.test.tsx
src/components/analytics/consent.css
src/components/market/MarketPanel.tsx
tests/unit/nodeEntry.test.ts
tests/unit/midtrans.test.ts
tests/unit/billingCheckout.test.ts
tests/unit/billingWebhook.test.ts
tests/unit/billingClient.test.ts
tests/unit/analytics.test.ts
tests/unit/analyticsTrack.test.ts
tests/unit/analyticsCollect.test.ts
tests/unit/marketSchema.test.ts
tests/unit/marketResearch.test.ts
docs/PHASE-4-BILLING.md
```

**Modified**

```
supabase/apply-all.sql
supabase/tests/shim.sql
scripts/verify-supabase.sh
server/_lib/supabase.ts
api/ai/parse.js
src/app/App.tsx
src/app/LegalPage.tsx
src/components/cloud/CloudSavePanel.tsx
src/components/landing/MarketingSections.tsx
src/components/landing/MarketingSections.test.tsx
src/components/quote-builder/LiveInvoicePreview.tsx
tests/components/CloudSavePanel.test.tsx
tests/e2e/guest.spec.ts
tests/unit/deployConfig.test.ts
.env.server.example
IMPLEMENTATION_STATUS.md
package.json            (only if @testing-library/user-event is added)
pnpm-lock.yaml          (same)
```

**Deleted**

```
src/lib/features.ts
```
