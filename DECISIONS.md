# Keputusan Implementasi

## ADR-001 — Phase 1: aplikasi statis, local-first
**Keputusan:** jalankan hanya Phase 1 sesuai kit. React/TypeScript/Vite; tanpa server, autentikasi, Supabase, AI, pembayaran, atau deployment.
**Tradeoff:** semua fungsi tamu bekerja tanpa biaya server; belum ada sinkronisasi lintas perangkat. Feature flag integrasi default mati dan tidak mengaktifkan implementasi yang belum tersedia.

## ADR-002 — Harga berbasis gross margin, bukan markup
**Keputusan:** engine TypeScript murni, IDR integer; margin, fee dan waste memakai basis point. Diskon persen pada API engine memakai 0–100 (maksimal dua desimal), lalu dikonversi ke fixed-point internal. Adapter form diuji bersama engine agar satuan tidak tertukar. BigInt untuk operasi antara. Harga minimum dan pembulatan ke atas melindungi target margin. Diskon diterapkan sesudah pembulatan, biaya persentase dihitung ulang pada harga akhir.
**Tradeoff:** biaya waste dan fee dibulatkan ke atas ke rupiah; diskon dibulatkan ke bawah agar tidak memotong melebihi input. Margin tampilan memakai rasio hasil integer. Pembulatan konservatif dapat menambah paling banyak satu rupiah per komponen pecahan.
**Kontrak biaya:** Barang: unit cost + tambahan per unit, dikali kuantitas. Jasa: jam total x biaya internal per jam + subkontraktor total. Custom: (material + waste material + tenaga + finishing) per unit x kuantitas. Overhead dan fee tetap berlaku sekali per pesanan. Pajak tidak dihitung.

## ADR-003 — PDF client-side dan typography lokal
**Keputusan:** lazy-load pdf-lib dan font Unicode lokal untuk ekspor. Tidak mengirim nama pelanggan atau isi penawaran ke layanan PDF eksternal. UI memakai font lokal dengan fallback sistem.
**Tradeoff:** chunk PDF/font baru diunduh saat dibutuhkan; tambahan ukuran ekspor diterima demi privasi dan dukungan teks Unicode.

## ADR-004 — Privasi draft tamu
**Keputusan:** simpan input finansial dan jenis/nama item di localStorage dengan validasi versi/ukuran. Nama usaha, nama pelanggan, dan catatan tetap di memori tab saat navigasi SPA, tetapi tidak disimpan lintas reload kecuali pengguna memilihnya. Kontrol hapus menghapus key aplikasi saja, tanpa menghapus data situs lain; autosave dimulai kembali setelah edit berikutnya.
**Tradeoff:** detail pribadi yang belum diizinkan hilang saat reload, sengaja. localStorage bukan penyimpanan terenkripsi; status dan kebijakan ini dijelaskan di UI.

## ADR-005 — UI mengikuti arah visual, bukan meniru klaim mockup
**Keputusan:** form dominan, off-white/navy/periwinkle, kartu putih dan hasil hijau lembut. Tiga lapis invoice abstrak sangat redup pada hero; tanpa foto besar, angka pasar contoh, testimonial, atau statistik pengguna. Tombol AI nonaktif dengan label belum tersedia. Harga Pro Rp59.000/bulan diberi label usulan.
**Tradeoff:** animasi dan dekorasi dikurangi demi keterbacaan, performa dan aksesibilitas. Legal berstatus draf, bukan klaim dokumen final.
