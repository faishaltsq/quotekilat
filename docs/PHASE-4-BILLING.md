# Phase 4 — Billing: status implementasi dan prasyarat deploy

Dokumen ini mencatat apa yang sudah ada di kode, apa yang sudah diverifikasi, dan
apa yang belum. Semua klaim di bawah ini diuji atau ditandai jelas sebagai belum
dijalankan.

## Yang sudah ada di kode

| Bagian | Lokasi | Test |
| --- | --- | --- |
| Rute `POST /api/billing/checkout` | `server/billing/checkout.ts`, shim `api/billing/checkout.js` | `tests/unit/billingCheckout.test.ts` (6) |
| Rute `GET /api/billing/status` | `server/billing/status.ts`, shim `api/billing/status.js` | `tests/unit/billingCheckout.test.ts` |
| Rute `POST /api/billing/webhook` (KlikQRIS) | `server/billing/qrisWebhook.ts`, shim `api/billing/webhook.js` | `tests/unit/qrisWebhook.test.ts` (11) |
| Klien KlikQRIS | `server/_lib/qris.ts` | `tests/unit/qrisClient.test.ts` (10) |
| Adapter Node untuk semua rute Vercel | `server/_lib/nodeEntry.ts` | `tests/unit/nodeEntry.test.ts` (3) |
| Pemanggil RPC ber-otorisasi pemakai & service-role | `server/_lib/supabase.ts` | — |
| Klien browser (baca status, mulai checkout) | `src/lib/billing/client.ts` | `tests/unit/billingClient.test.ts` (5) |
| Hook status langganan | `src/lib/billing/useBilling.ts` | — (cermin tipis; sengaja tanpa test) |
| Panel upgrade sandbox di `/#harga` | `src/components/billing/UpgradePanel.tsx` | `src/components/landing/MarketingSections.test.tsx` |
| Batas kuota mengikuti paket | `src/components/cloud/CloudSavePanel.tsx` | `tests/components/CloudSavePanel.test.tsx` (7) |
| Skema database `0004_phase4_billing.sql` | `supabase/migrations/0004_phase4_billing.sql` | `supabase/tests/phase4_billing.sql` (28 assertion, di `pnpm test:sql`) |

Prinsip yang dipegang: browser hanya tahu paketnya dari `/api/billing/status`.
Tidak ada `localStorage` penanda Pro, tidak ada parameter URL, tidak ada
peningkatan optimis. `redirectUrl` yang bukan `https://` ditolak sebelum
`window.location.assign`.

## Prasyarat deploy — billing tidak aktif tanpa ini

1. **Env Vercel** (isi dari `.env.server.example`, sisi server saja):
   - `KLIKQRIS_API_KEY`
   - `KLIKQRIS_MERCHANT_ID`
   - `KLIKQRIS_ENV` (kosong untuk sandbox)
   - `SUPABASE_SERVICE_ROLE_KEY` — kunci service-role Supabase; hanya boleh ada
     di env server, tidak pernah di bundel klien (`VITE_`).
2. **Migrasi `0004_phase4_billing.sql`** diterapkan ke database live.
   Migrasi ini idempoten (aman dijalankan berulang). Di database yang sudah berisi
   skema Phase 2/3, pakai `supabase/apply-phase4-5.sql` — bukan `apply-all.sql`,
   yang membuat `profiles` tanpa `if not exists` dan gagal dengan `42P07`.
   Berkas gabungan lama tetap benar untuk database kosong, dan `supabase/apply-all.sql`
   sudah memuat salinannya untuk penerapan penuh.
3. **Redeploy** setelah kedua langkah di atas, karena rute baru hidup sebagai
   fungsi `api/billing/*.js`.

Tanpa env di atas, rute menjawab 503 `disabled` dan panel upgrade menampilkan
status "Langganan belum aktif di server ini" — tidak pernah berpura-pura Pro.

## Analitik consent-gated

Event hanya dikirim setelah pengguna memilih **Boleh** di banner; tanpa pilihan,
`track()` langsung kembali. Tujuannya `/api/analytics/collect` di origin sendiri
(CSP tidak dilonggarkan), kosakata event tertutup, dan properti disaring: kunci di
luar daftar izin dibuang, teks lebih dari 40 karakter dibuang, jadi nama pelanggan
atau catatan tidak mungkin ikut terkirim. Fase ini belum menyimpan agregat ke
database — rute menjawab 204 dan tidak menulis apa pun.

## Status verifikasi

Sudah dijalankan dan lulus:

- `pnpm test:sql` di `postgres:16-alpine`: 28 assertion fase-4 (skema billing,
  `current_plan()`, kuota paket, `begin_market_research`) plus fase-2/fase-3.
- Seluruh test unit di atas: **435 test / 36 file** lulus, plus `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- `pnpm test:e2e`: **26 lulus** (24 sebelumnya + 2 assertion baru bahwa tidak ada
  request `/api/analytics/collect` sebelum pilihan consent).

Belum dijalankan (butuh akses dashboard KlikQRIS dan database live, tidak bisa
diotomasi dari repo):

- Pembayaran sandbox end-to-end: klik `Coba Pro (sandbox)`, mendarat di
  `app.sandbox.midtrans.com` dengan nilai Rp59.000, membayar dengan instrumen
  sandbox, lalu kembali dan melihat `Paket Pro aktif`.
- Notifikasi webhook ulang dari dashboard KlikQRIS: harus menjawab
  `{"applied":false,"reason":"duplicate"}` dan periode tidak bergeser.
- ~~Penerapan migrasi `0004` ke database live.~~ Selesai 2026-10-22 lewat `supabase/apply-phase4-5.sql`.

Tahapan manual di atas dijalankan setelah env dan migrasi tersedia, dan hasil
observasinya dicatat di bagian ini — bukan ditebak.
