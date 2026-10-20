# QuoteKilat

Kalkulator harga jual dan pembuat penawaran untuk usaha Indonesia. **Phase 1: guest beta, tanpa akun dan tanpa backend.** Blueprint sumber ada di file `01`–`04`; gambar referensi hanya arahan gaya, bukan aset halaman.

## Menjalankan lokal

Prasyarat: Node.js yang didukung Vite 8 (22.12+; diuji pada Node 26), pnpm 12. Paket dipatok di `package.json` dan `pnpm-lock.yaml`.

```bash
NODE_ENV=development pnpm install --frozen-lockfile
pnpm dev
```

Buka URL lokal yang dicetak Vite. Tidak memerlukan `.env` atau kredensial. Jangan menaruh secret di variabel `VITE_`.

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm preview
```

`NODE_ENV=production` dapat menghilangkan devDependencies pada instalasi biasa; gunakan `NODE_ENV=development` saat instalasi di Git Bash/macOS/Linux. Di PowerShell, set `$env:NODE_ENV='development'` sebelum `pnpm install --frozen-lockfile`. pnpm 12 tidak menerima flag lama `--prod=false`. Instalasi npm awal menemui konflik optional peer resolver v6; dipilih resolver v5 yang kompatibel dan pnpm sebagai satu-satunya package manager proyek. Jangan membuat lockfile kedua.

## Pemakaian

1. Pilih Barang, Jasa, atau Custom; contoh data dapat langsung diedit atau dikosongkan dengan **Hapus data perangkat**.
2. Isi **biaya Anda**, bukan harga yang ditagihkan pelanggan. Angka rupiah penuh tanpa titik/pemisah; persentase/jam menerima maksimal dua desimal (titik/koma).
3. Tentukan gross margin. Buka **Biaya, fee & diskon** untuk overhead, fee, pembulatan, waste material, dan diskon.
4. **Detail penawaran** menambahkan nama usaha/pelanggan, masa berlaku, dan syarat. Nama dan catatan hanya disimpan di perangkat jika checkbox izin dipilih.
5. **Buat Penawaran** membuka preview pelanggan tanpa rincian biaya internal/laba. **Salin WhatsApp** menyalin teks (tidak mengirim pesan otomatis); bila clipboard diblokir, tersedia dialog salin manual. **Unduh PDF** membuat PDF nyata di browser.

## Matematika dan satuan

`P_min = (C + F) / (1 - r - m)`; `m` adalah gross margin, bukan markup. IDR integer, persentase integer basis-point, BigInt pada perhitungan antara. Harga minimum dibulatkan ke atas ke increment 100/500/1000 IDR, baru diskon diterapkan. Fee variabel dihitung ulang pada harga setelah diskon; laba dan margin aktual ikut berubah. Margin kosong/tidak terdefinisi saat pendapatan nol. Tidak ada kalkulasi pajak.

- Barang: `(biaya utama + tambahan per unit) × jumlah + overhead pesanan`.
- Jasa: `jam total × biaya internal/jam + subkontraktor total + overhead`.
- Custom: `(material + waste material + tenaga kerja + finishing) per unit × jumlah + overhead`. Waste hanya pada material.
- Fee jual tetap satu kali per pesanan, tidak dikalikan jumlah. Fee persentase atas harga jual akhir.
- Biaya waste/fee pecahan rupiah dibulatkan ke atas; diskon persentase dibulatkan ke bawah. Harga rata-rata per unit bukan janji unit price × jumlah yang persis setelah pembulatan.

## Privasi dan batas Phase 1

Kalkulasi tidak melakukan request API. Font disajikan lokal. Draft tervalidasi di `localStorage` key `quotekilat:guest-draft:v1`. Data biaya, nama item, dan pengaturan disimpan setelah edit; nama usaha/pelanggan/catatan dikecualikan kecuali opt-in. Hapus hanya key QuoteKilat; autosave dilanjutkan setelah edit baru. Penyimpanan yang diblokir browser tidak menghalangi kalkulasi. Membersihkan data browser menghapus draft; detail pribadi tetap di memori selama navigasi SPA, tetapi hilang saat reload kecuali opt-in; tidak ada sinkronisasi antarperangkat/tab.

PDF dihasilkan lokal dengan pdf-lib dan font Noto Sans. Dukungan karakter dibatasi glyph font; teks yang tidak didukung mendapat pesan eksplisit, bukan PDF dengan karakter hilang. Tidak ada upload isi penawaran. Clipboard memakai browser API aman dengan fallback.

Cloud, auth, riwayat online, AI, Pro/billing dan pembayaran **belum diimplementasikan**. Flag default mati; mengubah flag tidak mengaktifkan fitur yang belum tersedia. Free Account dan Pro adalah usulan, bukan penawaran layanan aktif. Halaman legal berstatus draf.

## Struktur

- `src/lib/pricing`: engine deterministik, tipe dan formatter.
- `src/lib/validation`, `src/features/quotation`: skema/input dan default.
- `src/lib/storage`: persistence tamu tervalidasi dan proteksi data pribadi.
- `src/lib/quotation`, `src/lib/pdf`: snapshot konsisten, WhatsApp dan ekspor.
- `src/components/quote-builder`: form, ringkasan, preview dan tindakan nyata.
- `src/components/landing`, `src/app`: konten landing, parallax dan routing legal.
- `tests/unit`, `tests/components`, `tests/e2e`: matematika, privasi, PDF dan perjalanan tamu.

## Hosting (belum dideploy)

Hasil `pnpm build` ada di `dist/` dan kompatibel dengan hosting statis Cloudflare Pages. `_redirects` menyediakan fallback SPA; `_headers` menambahkan CSP dan header dasar pada Cloudflare. Header ini tidak otomatis diterapkan server preview Vite. Tidak ada Functions atau biaya layanan yang diaktifkan.

Lihat `IMPLEMENTATION_STATUS.md` untuk bukti verifikasi dan `DECISIONS.md` untuk tradeoff.
