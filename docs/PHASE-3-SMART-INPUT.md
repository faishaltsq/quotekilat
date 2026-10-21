# Phase 3 — Smart Input (parsing catatan jadi isian)

Status: **kode selesai, gate lokal hijau, belum diaktifkan di produksi.** Billing tetap Phase 4 dan tidak disentuh di sini.

Tujuan Phase 3 hanya satu: pengguna menempel catatan pesanan berbahasa bebas ("Hampers 25 pcs, kain 60rb/pcs, kemasan 8rb"), lalu menerima **usulan isian** yang bisa diperiksa dan diterapkan satu per satu. Tidak ada penulisan otomatis tanpa persetujuan, tidak ada angka yang ditebak, tidak ada tagihan.

## Alur

```
browser                    Vercel Function                Supabase                  Provider
textarea + consent  ──▶  POST /api/ai/parse
                          ├─ validasi body (≤ 1200 char, ≤ 8 KB)
                          ├─ verifikasi token pemanggil  ──▶  /auth/v1/user
                          ├─ redaksi PII
                          ├─ charge kuota               ──▶  rpc begin_ai_parse
                          ├─ panggil model (JSON mode)  ─────────────────────────▶  chat/completions
                          ├─ gagal? refund kuota        ──▶  rpc refund_ai_parse
                          ◀── { mock, mode, fields, assumptions, missing, remaining }
ushul diff + checkbox  ◀──
```

- Kunci model hanya ada di env server Vercel tanpa prefix `VITE_`, jadi Vite tidak pernah meng-inline-nya ke bundle.
- Klien tidak pernah memegang kredensial provider maupun service-role key; yang dipegang browser hanya flag `VITE_FEATURE_AI_PARSE`.

## Kontrak endpoint

`POST /api/ai/parse` — `authorization: Bearer <access_token>`, body `{ text, idempotencyKey }`.

Respons sukses:

```json
{
  "mock": false,
  "mode": "goods",
  "fields": { "title": "Hampers", "quantity": 25, "unitCost": 60000 },
  "assumptions": ["Kemasan dihitung per unit"],
  "missing": ["Ongkir"],
  "deadline": null,
  "redactedCount": 0,
  "remaining": 1
}
```

| Status | `code` | Arti |
|---|---|---|
| 401 | `unauthorized` | Token tidak ada/kedaluwarsa — dialog masuk dibuka, bukan pesan kuota |
| 409 | `quota` | Jatah bulanan habis |
| 413 | `too_long` | Teks > 1200 karakter atau body > 8 KB |
| 422 | `invalid` | Body tidak sesuai skema |
| 429 | `ip_limit` | Ceiling per-IP per jam (10) |
| 502 | `upstream` | Provider gagal/timeout — **kuota dikembalikan** |
| 503 | `disabled` | Server belum punya kredensial Supabase |

Kode di body selalu menang atas status HTTP, supaya blokir IP tidak pernah dilaporkan sebagai "kuota habis".

## Kuota, idempotensi, dan pengembalian

| Objek | Isi |
|---|---|
| `ai_parse_log (owner_id, idempotency_key)` | PK gabungan: retry dengan key sama tidak memotong kuota dua kali |
| `ai_ip_throttle (ip_hash, window_start)` | hanya `sha256(pepper:ip)` 32 hex; alamat IP tidak disimpan |
| `begin_ai_parse(uuid, text)` | charge atomik → `(allowed, remaining, reason)`; limit Free **2/bulan** ada di dalam fungsi |
| `ai_parse_remaining()` | sisa jatah untuk UI |
| `refund_ai_parse(uuid)` | hapus log + kembalikan counter saat provider gagal |

Ketiga fungsi `SECURITY DEFINER`, `set search_path = ''`, dan `execute` hanya untuk `authenticated`. Tabel di-`revoke all` dari `anon, authenticated`, jadi browser tidak bisa membaca atau memalsukan log kuota.

## Privasi

Isi catatan diredaksi **sebelum** meninggalkan proses, di `src/lib/ai/redact.ts`:

| Pola | Pengganti |
|---|---|
| Email | `[email]` |
| URL | `[tautan]` |
| NPWP | `[npwp]` |
| NIK 16 digit | `[nik]` |
| Telepon `08…`/`+62…` | `[telepon]` |
| Nomor rekening berseparator | `[nomor]` |

Angka 10–15 digit tanpa separator **sengaja dibiarkan** karena hampir selalu harga. `redactedCount` dikembalikan ke UI agar pengguna tahu ada yang dibuang.

## Keselamatan perilaku

- **Mock mode**: bila `AI_*` kosong, endpoint menjawab `mock: true`, `fields: {}`, tanpa memanggil provider dan **tanpa memotong kuota**. Panel menampilkan "Contoh AI (belum aktif). Tidak ada isian yang bisa diterapkan."
- **Tidak menebak**: field yang tidak disebut model dibiarkan `null`/tidak ada; `fields` hanya berisi 13 field whitelist, key asing dilaporkan sebagai `ignored` dan dibuang.
- **Diff, bukan timpa**: proposal hanya tercentang otomatis bila isian form masih kosong; nilai yang sudah diisi pengguna harus dicentang manual. Field yang tidak disebut model tidak pernah diubah.
- **Mode-aware**: biaya barang tidak bisa masuk ke penawaran jasa dan sebaliknya (`MODE_TARGETS`).
- **Panel mati tanpa flag**: `VITE_FEATURE_AI_PARSE !== 'true'` → komponen tidak pernah di-mount, dan nol request terjadi sebelum pengguna menekan tombol.

## Berkas

| Lapisan | Berkas |
|---|---|
| DB | `supabase/migrations/0003_phase3_ai_quota.sql`, `supabase/tests/phase3_ai_quota.sql` |
| Server | `server/ai/parse.ts`, `server/_lib/{provider,supabase,net}.ts`, entry `api/ai/parse.js` |
| Klien | `src/lib/ai/{schema,redact,diff,client,flag}.ts` |
| UI | `src/components/ai/SmartInputPanel.tsx`, `smart-input.css` |
| Konfig | `.env.server.example`, `.env.example`, `vercel.json`, `tsconfig.json`, `tsconfig.api.json` |

## Format modul fungsi (jebakan produksi)

Builder Vercel mengemit fungsi sebagai **ESM**, tetapi `/var/task/package.json` yang dibuatnya tidak membawa `"type": "module"`. Node lalu memuat berkas itu sebagai CommonJS dan setiap request mati dengan `Cannot use import statement outside a module` — 500 `FUNCTION_INVOCATION_FAILED`, tanpa error saat build.

Yang tidak menyelesaikan masalah: `api/package.json` (`module` maupun `commonjs`), rename ke `.mts` (ditolak sebagai function), dan `functions.includeFiles` untuk membawa `package.json` ikut terpaket.

Jalan keluarnya: `server/**` dikompilasi sendiri ke CommonJS lewat `tsconfig.api.json` (`outDir: vercel-api`), lalu `api/ai/parse.js` menjadi entry tipis yang `require` hasil kompilasi itu.

Entry itu juga **wajib ber-signature Node `(req, res)`**. Dengan export CommonJS, launcher tidak bisa mendeteksi Web handler, memanggilnya sebagai middleware Node, dan `Response` yang dikembalikan dibuang — gejalanya `FUNCTION_INVOCATION_TIMEOUT` (504) pada `GET` dan 500 pada `POST`. Adapter di entry membangun `Request` dari `req` (body sudah diparse platform bila JSON), memanggil handler asli, lalu menulis status/header/body ke `res`. `scripts/build-api.mjs` menjalankan `tsc` dan menulis `vercel-api/package.json` (`{"type":"commonjs"}`), dan `pnpm build` memanggilnya. Glob `functions` di `vercel.json` diarahkan ke `api/**/*.js`; ekstensi `.cjs` ditolak sebagai function (`unused_function`).

## Gate

| Pemeriksaan | Hasil |
|---|---|
| `pnpm typecheck` | lulus |
| `pnpm lint` | lulus (0 warning) |
| `NODE_ENV=test pnpm test` | **376 tes / 26 file** lulus |
| `pnpm test:sql` | **66 assertion** lulus (37 Phase 2 + 29 Phase 3) |
| `apply-all.sql` di database kosong | diterapkan bersih, kedua suite lulus di atasnya |
| `pnpm build` | lulus (+ `vercel-api/` CommonJS terbentuk) |
| `pnpm test:e2e` | **24 lulus** (desktop + mobile) |
| Produksi `https://quotekilat.vercel.app/api/ai/parse` | `GET` → 405 `Gunakan POST.`, `POST` tanpa token → 401 `Masuk dulu untuk memakai Smart Input.` (fungsi benar-benar termuat, bukan `FUNCTION_INVOCATION_FAILED`) |

Tes Phase 3 menyentuh: redaksi PII, normalisasi angka `Rp 60.000`/`7,5`, penolakan nilai mustahil, whitelist field, mapping per mode, diff/toggle tanpa mutasi, kontrak klien (401/409/429/offline/body rusak), provider (mode mock, JSON berpagar, timeout, key tidak pernah masuk body), handler (urutan charge → provider → refund, kuota tidak dipotong saat RPC gagal, redaksi sebelum kirim), panel (tidak ada request sebelum aksi, consent wajib, tick manual, dialog auth, pesan penolakan, label mock), serta batas rahasia (tidak ada `VITE_` di `api/`, template env terpisah).

## Status produksi

Panel **sudah menyala** di `https://quotekilat.vercel.app` (smoke: `section.smart-input` terender, nol `pageerror`, `POST /api/ai/parse` → 401 kontrak auth, `GET` → 405).

Env Vercel Production yang sudah diset: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `AI_IP_PEPPER`, `VITE_FEATURE_AI_PARSE=true`, dan sejak 21 Okt 2026 juga `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`, `AI_REASONING_EFFORT`.

Provider aktif: **DeepSeek langsung** — `AI_BASE_URL=https://api.deepseek.com/v1`, `AI_MODEL=deepseek-flash`, `AI_REASONING_EFFORT=low`.

Parse nyata terverifikasi end-to-end di produksi dengan akun uji:

| Uji | Hasil |
| --- | --- |
| `POST /api/ai/parse` dengan token asli | 200, `mock: false`, 7,5 detik |
| Field hasil | `mode: custom`, `title`, `quantity: 50`, `materialCost: 45000`, `laborCost: 5000`, `finishingCost: 8000`, `marginPercent: 30`, `deadline: "2 minggu"` |
| Kuota | `remaining` 1 → 0, jadi unit benar-benar terpotong |
| Replay `idempotencyKey` sama | 200, `remaining` tetap 0 (tidak memotong dua kali) |
| Parse ketiga | 409 `quota` — batas 2/bulan ditegakkan di SQL |

### Dua bug laten yang muncul hanya dengan model reasoning

Keduanya tidak pernah terlihat sebelumnya karena provider selalu mock.

1. **`max_tokens: 700` habis sebelum jawaban keluar.** `deepseek-flash` membakar 400–1400 token reasoning sebelum menulis JSON. Dengan cap 700 respons berakhir `finish_reason: "length"` dan `content` kosong, yang oleh handler dibaca sebagai `shape` error → refund + 502. Dinaikkan ke `4000`.
2. **Timeout 12 detik terlalu pendek.** Parse 1200 karakter butuh 6–25 detik tergantung effort. Dinaikkan ke 22 detik, masih di bawah `maxDuration: 30` di `vercel.json` supaya refund tetap sempat jalan kalau model menggantung.

`AI_REASONING_EFFORT=low` memangkas token reasoning (sekitar 900 vs 1400+) dan menjaga mayoritas parse di bawah 10 detik. Variabel ini opsional: provider yang menolak field `reasoning_effort` cukup dibiarkan kosong dan field-nya tidak dikirim sama sekali.

### Jebakan yang pernah terjadi di sini

1. ESM vs CommonJS function — lihat bagian "Format modul fungsi".
2. Panel ter-mount **di luar** `<FormProvider>` di `QuoteBuilder` (blok smart-input ada setelah `</form></FormProvider>`), sehingga `useFormContext()` bernilai `null` dan seluruh halaman mati dengan `Cannot read properties of null (reading 'control')` begitu flag dinyalakan. Tes sebelumnya selalu jalan dengan flag mati sehingga lolos. Perbaikan: `</FormProvider>` dipindah ke setelah blok panel; regresi dijaga `QuoteBuilder.test.tsx` (file dijalankan dengan flag ter-mock menyala).
3. Model reasoning + `response_format: json_object` menuntut kata "json" muncul di prompt. System prompt sudah memenuhinya ("Balas HANYA satu objek JSON"), jadi jangan hapus kata itu saat menyunting prompt — provider akan membalas 400.

### Sisa pekerjaan

Tidak ada lagi langkah manual yang menghalangi parse asli — poin 1, 2, dan 3 di atas sudah selesai.

Catatan operasional:

- Kunci DeepSeek yang terpasang bersaldo **USD 0,53**. Dengan harga deepseek-flash sekitar USD 0,28 per 1 juta token input dan USD 0,42 per 1 juta token output, satu parse 1200 karakter memakai sekitar 1.250 token total, jadi saldo ini cukup untuk sekitar 1.000 parse. Isi ulang sebelum dipakai publik.
- Kuota Free 2 parse/bulan ditegakkan di SQL, jadi biaya provider tidak bisa dipicu tanpa batas oleh satu akun. Throttle per-IP membatasi penyalahgunaan lintas akun dari satu jaringan.
- Kalau saldo DeepSeek habis, provider membalas 402; handler menerjemahkannya jadi 502 `upstream` dan **mengembalikan** kuota pengguna lewat `refund_ai_parse`. Perilaku ini sudah diuji di unit test, bukan asumsi.
- Rotasi kunci: jalankan ulang `AI_API_KEY=… bash scripts/set-ai-provider.sh`. Skrip melakukan `rm` lalu `add`, jadi tidak menumpuk nilai lama.

Untuk mengganti provider, cukup isi `AI_BASE_URL`/`AI_MODEL` lain selama endpoint-nya OpenAI-compatible dan mendukung `response_format: json_object`. Kosongkan `AI_REASONING_EFFORT` bila provider menolak field tersebut.
