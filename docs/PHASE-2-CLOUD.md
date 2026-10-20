# Phase 2 — Cloud workspace

Free cloud workspace on top of the Phase 1 guest MVP. Guest behaviour is
unchanged: nothing here is required to calculate, preview, copy or export a quote.

## What ships

| Piece | Location |
|---|---|
| Schema, triggers, quota RPC | `supabase/migrations/0001_phase2_schema.sql`, `0002_phase2_rls_quota.sql` |
| RLS / grant / quota assertions | `supabase/tests/phase2_rls_quota.sql` |
| SQL gate (throwaway Postgres in Docker) | `scripts/verify-supabase.sh` → `pnpm test:sql` |
| Supabase client + config guard | `src/lib/cloud/client.ts` |
| Auth context/provider | `src/lib/cloud/authContext.ts`, `AuthProvider.tsx` |
| Error translation | `src/lib/cloud/authErrors.ts` |
| Quote row mapping | `src/lib/cloud/quoteMapping.ts` |
| API wrapper | `src/lib/cloud/quotesApi.ts` |
| Cloud state hook | `src/lib/cloud/useCloudQuotes.ts` |
| UI | `src/components/cloud/CloudSavePanel.tsx`, `AuthDialog.tsx`, `cloud.css` |
| Password reset route | `src/app/ResetPasswordPage.tsx` (`/reset-password`) |

## Security model

- **RLS on every user table**, policies written as `owner_id = (select auth.uid())`
  so the subquery is evaluated once per statement, not once per row.
- **Grants are explicit.** Supabase's default privileges hand `anon` and
  `authenticated` `ALL` on every new table in `public`. `grant` is additive, so
  each migration first runs `revoke all ... from authenticated` and only then
  grants the narrow set. Without that revoke, `authenticated` keeps inherited
  `INSERT`/`UPDATE`/`DELETE` and the monthly quota is bypassed with one direct
  INSERT. The SQL gate fails if that revoke is removed (verified with a negative
  control, not just asserted).
- **Writes to `quotes` go through `save_quote()`.** Direct INSERT/UPDATE/DELETE is
  not granted; only five whitelisted columns are client-updatable
  (`title`, `customer_name`, `status`, `items`, `cost_breakdown`). The price
  column is not writable by a client.
- **`usage_counters` is server-owned.** Clients may `SELECT` their own row; the
  counter is incremented only inside the `SECURITY DEFINER` function.
- **Atomic quota.** `insert ... on conflict do update ... where c.count < 5
  returning count` — the row lock is the exclusion, so a failed `WHERE` returns
  no row and raises `QUOTA_EXCEEDED` without over-counting.
- **Idempotency.** `unique (owner_id, idempotency_key)`; replaying a key returns
  the stored row and consumes no extra quota slot.
- **Cross-tenant integrity.** Composite FK
  `(business_profile_id, owner_id) → business_profiles (id, owner_id)`, so the
  database rejects a quote pointing at somebody else's business profile even if
  application code slips.
- **No secret in the bundle.** `readCloudConfig` rejects a non-`supabase.co`
  origin and throws on an `sb_secret_` key rather than shipping it.

## Verification

```bash
pnpm test:sql      # 37 assertions against a real postgres:16-alpine
pnpm test          # unit + component
pnpm typecheck && pnpm lint && pnpm build
pnpm test:e2e
```

The SQL gate applies `supabase/tests/shim.sql` first (auth schema, `auth.users`,
`auth.uid()`, `anon`/`authenticated` roles, and Supabase's default grants) so the
revoke assertions are not vacuous. `supabase/tests/shim.sql` is a test fixture and
is never applied to a real project.

`tests/unit/deployConfig.test.ts` asserts the production CSP still allows
`https://*.supabase.co`, `wss://*.supabase.co` and `data:` fonts. Hosting headers
are not applied by the Vite preview server, so a CSP regression is invisible
locally and only appears in production — that is exactly how the inlined-font
block reached the live site in Phase 1.

## Enabling cloud in a deployment

1. Create the Supabase project.
2. Apply `supabase/migrations/*.sql` in order (the Supabase CLI or the dashboard
   SQL editor). Migrations are **not** run by the Vercel build.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel. Both are
   publishable; never set a service-role key with a `VITE_` prefix.
4. Redeploy.

With those variables unset, `readCloudConfig()` returns `null`, the cloud panel
renders nothing, and the app behaves exactly as Phase 1.

## Known limits

- Hard delete of a cloud quote is not granted; the UI says so instead of
  pretending. Deletion ships with an account-settings flow later.
- Email confirmation is on by default in Supabase, so sign-up returns no session
  until the user confirms. The dialog handles that state explicitly.
- The Free quota is per calendar month in UTC, enforced server-side only.
- No cross-device test yet against a real project; the RLS isolation is proven at
  the SQL layer, and the browser flow is proven with a mocked client.
