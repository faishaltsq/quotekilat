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

Env Vercel Production yang sudah diset: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `AI_IP_PEPPER`, `VITE_FEATURE_AI_PARSE=true`.

Karena `AI_API_KEY`/`AI_BASE_URL` belum diisi, provider jalan di **mode mock**: parse mengembalikan 200 berlabel `mock: true` tanpa menyentuh kuota dan tanpa memanggil model eksternal — demo bisa dicoba pengguna yang sudah masuk, dan tidak ada biaya.

### Jebakan yang pernah terjadi di sini

1. ESM vs CommonJS function — lihat bagian "Format modul fungsi".
2. Panel ter-mount **di luar** `<FormProvider>` di `QuoteBuilder` (blok smart-input ada setelah `</form></FormProvider>`), sehingga `useFormContext()` bernilai `null` dan seluruh halaman mati dengan `Cannot read properties of null (reading 'control')` begitu flag dinyalakan. Tes sebelumnya selalu jalan dengan flag mati sehingga lolos. Perbaikan: `</FormProvider>` dipindah ke setelah blok panel; regresi dijaga `QuoteBuilder.test.tsx` (file dijalankan dengan flag ter-mock menyala).

### Sisa sebelum parse asli (berbayar kuota) jalan

1. ~~Terapkan `0003_phase3_ai_quota.sql`~~ — **selesai**. Diterapkan ke project live lewat Supabase CLI (`supabase migration repair --status applied 0001 0002` lalu `supabase db push`). Riwayat migrasi remote kini `0001, 0002, 0003`; verifikasi SQL langsung: fungsi `ai_parse_limit`, `ai_parse_remaining`, `begin_ai_parse`, `refund_ai_parse` ada, tabel `ai_parse_log` + `ai_ip_throttle` ada.
2. ~~Isi Site URL / Redirect URLs Supabase~~ — **selesai**. `supabase/config.toml` kini memuat `site_url = "https://quotekilat.vercel.app"` dan tujuh `additional_redirect_urls` (`/reset-password` untuk prod, `localhost`/`127.0.0.1` port 3000/4173/5173). Diterapkan dengan `supabase config push`; `supabase config diff` sesudahnya `total: 0`, dan `config pull` melaporkan `changes: []` — remote identik dengan file.
3. Set `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` di Vercel Production, lalu deploy ulang. Tanpa ini tetap mode mock.

   Jalur cepat (nama env saja yang ditampilkan, nilai tidak pernah dicetak):

   ```bash
   bash scripts/set-ai-provider.sh                 # cek status sekarang
   AI_BASE_URL="…/v1" AI_MODEL="…" AI_API_KEY="…" \
     bash scripts/set-ai-provider.sh               # set + deploy + smoke
   ```

   Kenapa belum terisi: kredensial provider yang ada di mesin ini tidak layak dipakai produksi.

   | Kredensial | Hasil probe |
   | --- | --- |
   | `RUVICODE_API_KEY` | `/v1/models` 200, tapi `chat/completions` → **402 saldo habis** |
   | `OPENROUTER_API_KEY` | kunci sehat ($49,98 dari $50), tetapi kredit workspace hanya cukup ~52 token → tidak bisa melayani parse |
   | `OPENAI_API_KEY` | kosong/tidak valid |
   | `DASHSCOPE_API_KEY`, `GROQ_API_KEY`, `TOKENROUTER_API_KEY`, `SILICONFLOW_API_KEY` | `chat/completions` → **401 invalid API-key** |
   | 9router lokal (`localhost:20128`) | jalan, tetapi hanya bisa diakses dari mesin ini (tunnel `abc-tunnel.us` → 530) — tidak bisa dipakai Vercel |

   Pilihan termurah: isi ulang Ruvicode (kunci sudah ada), atau buat kunci gratis Google AI Studio / Groq lalu set `AI_BASE_URL` + `AI_MODEL` sesuai penyedia tersebut.
