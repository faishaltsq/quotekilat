# Status Implementasi QuoteKilat

## Hasil
**Phase 1 guest MVP selesai dan terverifikasi secara lokal.** Build aplikasi ada di `dist/`. Preview lokal: http://127.0.0.1:4173/ . Tidak ada deployment produksi, akun layanan eksternal, database, AI, billing atau pembayaran aktif.

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
| `pnpm test` | **225 tes lulus, 12 file** |
| `pnpm build` | Lulus, produksi statis di `dist/` |
| `pnpm test:e2e` | **24 tes lulus**, Chromium desktop + emulasi mobile |
| `pnpm audit --prod` | Tidak ditemukan kerentanan yang diketahui |
| HTTP preview `/` | 200, title QuoteKilat sesuai |
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
- File `_headers` berlaku saat disajikan oleh Cloudflare Pages; preview Vite tidak menerapkan header hosting tersebut. Belum ada deployment atau verifikasi header produksi.
- Folder awal dan akhir bukan repository Git. Tidak ada commit/push/branch/deployment yang dibuat.
- Dependencies terkunci dengan pnpm; resolver v5 dipilih karena resolver v6 menimbulkan konflik optional peers pada npm. TypeScript 6.0.3 mengikuti dukungan typescript-eslint; script test/dev mengatur NODE_ENV eksplisit agar shell production tidak memuat React production dalam tes komponen.

## Pending — di luar Phase 1
- **Phase 2:** Supabase Auth, cloud save/history, guest import, RLS dan kuota server atomik.
- **Phase 3:** AI opt-in terstruktur, quota/cost controls, sumber pasar yang dapat diverifikasi, dan fallback data tidak cukup.
- **Phase 4:** Midtrans sandbox, webhook terverifikasi/idempotent dan lifecycle akses berbayar. Tidak ada penagihan nyata.
- **Phase 5:** validasi pengguna, retensi, willingness-to-pay dan observability berbasis consent.
