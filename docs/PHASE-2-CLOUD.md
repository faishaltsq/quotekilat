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

## Live project

Ref `xirgtbnvthgjrvgnfrsg` (`https://xirgtbnvthgjrvgnfrsg.supabase.co`), region
ap-southeast-1. Migrasi diterapkan lewat `supabase/apply-all.sql` di dashboard SQL
editor karena project ini ada di akun Supabase yang berbeda dari MCP (organisasi
`lvbbubaqbzajqjdjaxgi` hanya memuat 4 project lain).

Postur yang diverifikasi dari luar, memakai publishable key saja:

| Probe | Hasil | Arti |
|---|---|---|
| `GET /rest/v1/quotes` | `42501 permission denied` | tabel ada, `anon` tidak punya grant |
| `POST /rest/v1/quotes` | `42501` | kuota tidak bisa dilewati lewat insert langsung |
| `PATCH`/`DELETE /rest/v1/quotes` | `42501` | tulis langsung tertutup |
| `POST /rpc/save_quote` (11 argumen) | `42501 permission denied for function` | fungsi ada, tidak dieksekusi `anon` |
| `POST /rpc/remaining_quota` | `42501` | idem |
| `POST /rpc/free_quote_limit` | `42501` | idem |

`save_quote` yang dipanggil tanpa argumen membalas `PGRST202`; itu bukan bukti
fungsi tidak ada, hanya PostgREST gagal mencocokkan signature. Pemanggilan dengan
11 parameter membalas `42501`, artinya fungsi ada dan tertutup untuk `anon`.

## Konfigurasi auth (diselesaikan)

Awalnya `mailer_autoconfirm: false`, sehingga signup mengirim email konfirmasi
lewat SMTP bawaan Supabase. SMTP bawaan berbatas keras (2 email/jam), dan
percobaan signup nyata dibalas `429 over_email_send_rate_limit` — pengguna tidak
pernah menerima tautan, dan login sebelum konfirmasi gagal.

Sekarang dimatikan: `mailer_autoconfirm: true`, `disable_signup: false`,
provider `email`. Lokasinya **bukan** di drawer provider Email, melainkan di
kartu **User Signups** pada halaman Authentication → Sign In / Providers, lalu
**Save changes**.

Konsekuensi yang diterima: alamat email tidak diverifikasi. RLS dan kuota tetap
membatasi apa yang bisa dicapai akun mana pun, jadi risiko terburuknya adalah
baris `profiles` untuk alamat palsu — bukan akses ke data tenant lain.

Ini cukup untuk MVP gratis, **belum** cukup untuk produksi berbayar: begitu ada
alur reset kata sandi atau email transaksional, pasang SMTP sendiri
(Resend/Brevo/Postmark) dan nyalakan kembali konfirmasi email.

Kode menangani kedua keadaan: `translateAuthError` membedakan batas pengiriman
email dari kesalahan pengguna, dan `NOT_PROVISIONED` membedakan skema belum ada
dari gangguan jaringan.

## Verifikasi end-to-end ke project live

Dijalankan dengan Chromium terhadap `https://quotekilat.vercel.app` dan project
`xirgtbnvthgjrvgnfrsg`, memakai dua akun uji nyata (tenant A dan B).

| Langkah | Hasil |
|---|---|
| Daftar lewat UI | HTTP 200, dialog tertutup, `email_confirmed_at` terisi otomatis |
| Trigger `profiles` | baris `display_name = QA QuoteKilat` dibuat saat signup |
| Simpan ke cloud | "Penawaran tersimpan di cloud.", riwayat 1 baris |
| Simpan ke-2..5 | sukses, `usage_counters.count` naik ke 5 |
| Simpan ke-6 | ditolak: "Kuota gratis 5 penawaran bulan ini sudah habis." |
| `remaining_quota` setelah 5 simpan | `0` |
| Reload halaman | sesi bertahan (`quotekilat:auth:v1` di localStorage), riwayat tetap 5 |
| Tenant B daftar | `remaining_quota` = `5` (counter terpisah), `quotes` = `[]` |
| Tenant B simpan 1 | `remaining_quota` = `4`, `quotes` = 1 baris milik B |
| Riwayat tenant B | 1 baris — nol baris tenant A terlihat |
| `POST /rest/v1/quotes` langsung (token A) | `403 42501 permission denied for table quotes` |

Baris terakhir itu yang paling penting: kuota tidak bisa dilewati dengan menulis
langsung ke tabel, karena `authenticated` hanya punya `select` dan `update` pada
kolom tertentu, sementara satu-satunya jalan menulis adalah RPC `save_quote` yang
memeriksa counter di dalam transaksi.

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
