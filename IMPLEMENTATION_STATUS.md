# Status Implementasi QuoteKilat

## Hasil
**Phase 1 guest MVP selesai, terverifikasi lokal, dan live di produksi.** Live: https://quotekilat.vercel.app · repo: https://github.com/faishaltsq/quotekilat . Build statis di `dist/`. Database dan AI aktif (Supabase + DeepSeek); billing dan pembayaran belum.

## Fitur yang berfungsi
- Landing responsif dengan builder nyata di hero, Barang/Jasa/Custom, contoh berlabel, input dinamis, dan state biaya/jumlah independen antar-mode.
- Engine gross margin deterministik: IDR integer, basis point untuk margin/fee/waste, BigInt intermediates; kuantitas, jam, material, tenaga, finishing, overhead, fee tetap/persen, pembulatan dan diskon. Diskon persen menerima persen 0–100 maksimal dua desimal, dikonversi ke fixed-point di engine.
- Ringkasan biaya, harga akhir, fee, laba, margin aktual dan guard di bawah target; invalid input tidak menghasilkan angka fiktif. Pajak tidak dihitung.
- Preview pelanggan, salin teks WhatsApp sungguhan, fallback manual ketika clipboard diblokir, dan PDF nyata yang dibuat di browser. Snapshot nomor/tanggal/total konsisten antar-export; biaya internal tidak ikut diekspor.
- PDF Noto Sans Unicode lokal, wrapping dan pagination untuk nama/catatan panjang; karakter tanpa glyph (mis. emoji/CJK tertentu) mendapat error eksplisit, bukan PDF rusak. Lisensi dan checksum font disertakan.
- Draft finansial di localStorage setelah edit; nama usaha/pelanggan/catatan dikecualikan secara default. Detail pribadi tetap di memori saat navigasi SPA dan baru dipersistenkan setelah opt-in. Clear menghapus key aplikasi, mengosongkan form dan tidak menghidupkan kembali autosave sampai edit berikutnya. Storage diblokir tidak menghalangi penggunaan.
- Tiga lapis kertas invoice SVG di hero: opacity 0.14 / 0.12 / 0.10 dengan blur 0.4px (batas atas rentang blueprint 0.06–0.14), rotasi ≤2.2°, gerak maksimum 24px dibagi faktor per layer, passive scroll + `resize`, RAF dibatalkan saat unmount. Mobile ≤768px disembunyikan, `prefers-reduced-motion` menonaktifkan seluruh transform.
- Benefit, cara kerja, AI berstatus belum aktif, pricing Guest/Free Account/Pro usulan, FAQ, footer, `/pricing`, `/privacy`, `/terms`, dan 404. Legal jelas berstatus draf.

## Bukti verifikasi lokal
| Pemeriksaan | Hasil |
|---|---|
| `NODE_ENV=development pnpm install --frozen-lockfile --offline` | Lulus; lockfile konsisten, devDependencies tersedia |
| `pnpm typecheck` | Lulus |
| `pnpm lint` | Lulus, 0 error |
| `pnpm test` | **294 tes lulus, 19 file** |
| `pnpm test:sql` | **37 assertion RLS/grant/kuota lulus** di `postgres:16-alpine` |
| `pnpm build` | Lulus, produksi statis di `dist/` |
| `pnpm test:e2e` | **24 tes lulus**, Chromium desktop + emulasi mobile |
| `pnpm audit --prod` | Tidak ditemukan kerentanan yang diketahui |
| HTTP preview `/` | 200, title QuoteKilat sesuai |
| **Produksi** `https://quotekilat.vercel.app` | `/`, `/privacy`, `/terms`, `/pricing`, rute tak dikenal → 200; CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy aktif; `/assets/*` cache immutable |
| **Smoke produksi (Chromium)** | Font termuat, harga `Rp 250.000` (qty 1) → `Rp 750.000` (qty 3), dialog preview terbuka dengan total sama, tombol PDF aktif, mobile tanpa overflow, **0 console error, 0 request eksternal** |
| Screenshot desktop/mobile | Disimpan dan ditinjau visual |

E2E mencakup perhitungan fee/diskon, independensi mode, invalid input, keyboard tab, return focus modal, clipboard asli dan fallback, **unduhan PDF aktual beserta ekstraksi teks dan total yang sama dengan layar**, reload/navigasi, opt-in privasi, clear tanpa resurrection, storage failure, teks HTML tidak dieksekusi, tidak ada request API/third-party, dan routing publik. Axe scan landing/preview desktop/mobile: tidak ada pelanggaran otomatis pada aturan WCAG A/AA yang diuji. Viewport 360/390/430/768/1280px tidak overflow horizontal; reduced motion secara eksplisit memverifikasi transform dekoratif `none`.

Screenshot:
- `test-results/quotekilat-hero-parallax-desktop.png` — hero desktop, tiga sheet terlihat
- `test-results/quotekilat-hero-parallax-scrolled.png` — setelah scroll 400px, displacement maksimum
- `test-results/quotekilat-hero-parallax-reduced-motion.png` — reduced motion, transform `none`
- `test-results/quotekilat-hero-parallax-mobile.png` — mobile 390px, layer disembunyikan
- `test-results/quotekilat-desktop.png` — full page desktop 1440px
- `test-results/quotekilat-mobile.png` — full page mobile 390px
- Laporan browser: `playwright-report/index.html`

## Batasan dan tradeoff yang diketahui
- Pengujian browser lokal memakai Chromium; mobile adalah emulasi perangkat, bukan pengujian perangkat fisik, Safari atau Firefox. Axe otomatis bukan sertifikasi aksesibilitas lengkap.
- Chunk PDF sekitar 1,13 MB minified / 506 KB gzip memicu pemberitahuan ukuran bundle. Chunk dan font TTF 569 KB diunduh hanya saat ekspor; JS awal sekitar 485 KB / 151 KB gzip. Bukan blocker build.
- Tanggal quotation menggunakan UTC, dilabeli konsisten di preview/WhatsApp/PDF. PDF generik berbasis teks, tanpa logo dan branding Pro.
- localStorage tidak terenkripsi, tidak menyinkronkan antar-tab/perangkat; hapus data browser menghilangkan draft. Browser memerlukan JavaScript; belum offline PWA.
- `public/_headers` hanya berlaku di Cloudflare Pages; Vercel memakai `vercel.json`. Preview Vite tidak menerapkan header hosting mana pun, sehingga kesalahan CSP hanya terlihat di produksi. `tests/unit/deployConfig.test.ts` menjaga CSP tetap mengizinkan `*.supabase.co`, `wss://*.supabase.co`, dan `data:` untuk font.
- Repo: https://github.com/faishaltsq/quotekilat (`master`), terhubung ke Vercel sehingga push memicu deploy.
- Dependencies terkunci dengan pnpm; resolver v5 dipilih karena resolver v6 menimbulkan konflik optional peers pada npm. TypeScript 6.0.3 mengikuti dukungan typescript-eslint; script test/dev mengatur NODE_ENV eksplisit agar shell production tidak memuat React production dalam tes komponen.

## Phase 2 — cloud workspace (live dan terverifikasi end-to-end)
- Project Supabase: `xirgtbnvthgjrvgnfrsg` (akun terpisah dari MCP). Migrasi diterapkan lewat `supabase/apply-all.sql`.
- Env Vercel Production: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Tidak ada secret key di bundle atau repo (diverifikasi dengan grep, bukan diasumsikan).
- Auth Supabase hanya diminta saat aksi yang memang butuh cloud; halaman tidak pernah memasang auth wall. Nol request ke Supabase sebelum pengguna berinteraksi.
- Migrasi `0001`/`0002` + gate `pnpm test:sql` (37 assertion) membuktikan RLS, grant sempit, FK lintas-tenant, dan kuota atomik 5/bulan.
- Permukaan `anon` diuji langsung ke project live: `SELECT`/`INSERT`/`PATCH`/`DELETE` pada `quotes` dan semua RPC dibalas `42501 permission denied`.
- Alur nyata diuji dengan dua akun uji: daftar → simpan → riwayat → reload (sesi bertahan) → simpan ke-6 ditolak kuota; tenant B melihat 0 baris tenant A dan punya counter kuota sendiri. `POST /rest/v1/quotes` langsung dengan token `authenticated` dibalas `403 42501`, jadi kuota tidak bisa dilewati.
- Konfirmasi email dimatikan (`mailer_autoconfirm: true`). Cukup untuk MVP gratis; sebelum ada email transaksional, pasang SMTP sendiri dan nyalakan kembali.
- Dua akun uji tersisa di project (tenant A: 5 penawaran, tenant B: 1). Hard delete belum tersedia di app, jadi pembersihan lewat SQL Editor: `delete from auth.users where email like 'qk.qa.%@mailinator.com';` (cascade ke `quotes`/`usage_counters`/`profiles`).
- Detail: `docs/PHASE-2-CLOUD.md`.

## Phase 3 — Smart Input (aktif di produksi)
- Endpoint `POST /api/ai/parse` (Vercel Function) memanggil provider OpenAI-compatible dari env server. Kunci model tidak pernah berprefix `VITE_`, jadi tidak masuk bundle; tes `deployConfig` mengunci batas itu.
- Provider aktif: DeepSeek langsung (`deepseek-flash`) dengan `AI_REASONING_EFFORT=low`. Parse nyata terverifikasi di produksi: `mock:false`, 7,5 detik, kuota terpotong, replay idempotent tidak memotong dua kali, parse ketiga 409 `quota`.
- Kuota Free **2 parse/bulan** ditegakkan di fungsi SQL `begin_ai_parse`, bukan di klien. `ai_parse_log (owner_id, idempotency_key)` membuat retry tidak memotong jatah dua kali; `refund_ai_parse` mengembalikan jatah saat provider gagal atau timeout.
- Throttle per-IP hanya menyimpan `sha256(pepper:ip)` 32 hex. PII (email, tautan, NPWP, NIK, telepon, rekening) diredaksi sebelum teks dikirim ke model.
- Model tidak menebak: hanya 13 field whitelist, key asing dibuang, field yang tidak disebut dibiarkan kosong. Hasil tampil sebagai diff dengan checkbox; isian yang sudah diisi pengguna harus dicentang manual.
- Panel tidak pernah di-mount tanpa `VITE_FEATURE_AI_PARSE=true`; tanpa kredensial provider endpoint menjawab mode mock berlabel "belum aktif" tanpa memotong kuota.
- Dua bug laten ditemukan saat menyambungkan model reasoning dan sudah diperbaiki: `max_tokens` 700 habis untuk reasoning (naik ke 4000) dan timeout 12 detik terlalu pendek (naik ke 22 detik, di bawah `maxDuration: 30`).
- Gate: 378 tes / 26 file, 66 assertion SQL (termasuk `apply-all.sql` di database kosong), build lulus, 24 E2E. Detail: `docs/PHASE-3-SMART-INPUT.md`.
- Saldo DeepSeek saat pemasangan USD 0,53 — cukup sekitar 1.000 parse. Isi ulang sebelum dipakai publik.

## Pending — di luar Phase 3
- **Phase 4:** Midtrans sandbox, webhook terverifikasi/idempotent, lifecycle akses berbayar, dan kuota Pro 40 parse/bulan. Tidak ada penagihan nyata.
- **Phase 5:** validasi pengguna, retensi, willingness-to-pay dan observability berbasis consent.
