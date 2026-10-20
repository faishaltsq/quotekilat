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
| Server | `api/ai/parse-quote.ts`, `api/_lib/{provider,supabase,net}.ts` |
| Klien | `src/lib/ai/{schema,redact,diff,client,flag}.ts` |
| UI | `src/components/ai/SmartInputPanel.tsx`, `smart-input.css` |
| Konfig | `.env.server.example`, `.env.example`, `vercel.json`, `tsconfig.json` (`include` + `api`) |

## Gate

| Pemeriksaan | Hasil |
|---|---|
| `pnpm typecheck` | lulus |
| `pnpm lint` | lulus (0 warning) |
| `NODE_ENV=test pnpm test` | **369 tes / 26 file** lulus |
| `pnpm test:sql` | **66 assertion** lulus (37 Phase 2 + 29 Phase 3) |
| `apply-all.sql` di database kosong | diterapkan bersih, kedua suite lulus di atasnya |
| `pnpm build` | lulus, 6.84 s |
| `pnpm test:e2e` | **24 lulus** (desktop + mobile) |

Tes Phase 3 menyentuh: redaksi PII, normalisasi angka `Rp 60.000`/`7,5`, penolakan nilai mustahil, whitelist field, mapping per mode, diff/toggle tanpa mutasi, kontrak klien (401/409/429/offline/body rusak), provider (mode mock, JSON berpagar, timeout, key tidak pernah masuk body), handler (urutan charge → provider → refund, kuota tidak dipotong saat RPC gagal, redaksi sebelum kirim), panel (tidak ada request sebelum aksi, consent wajib, tick manual, dialog auth, pesan penolakan, label mock), serta batas rahasia (tidak ada `VITE_` di `api/`, template env terpisah).

## Yang masih harus dilakukan sebelum fitur ini menyala

1. Terapkan `supabase/migrations/0003_phase3_ai_quota.sql` ke project live (`xirgtbnvthgjrvgnfrsg`) lewat SQL Editor — akun MCP tidak punya akses ke project ini, jadi tidak bisa dijalankan dari sesi ini.
2. Set env server di Vercel Production: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`, `AI_IP_PEPPER`.
3. Set `VITE_FEATURE_AI_PARSE=true` lalu deploy ulang (flag dibaca saat build).
4. Isi Site URL / Redirect URLs Supabase agar reset password tidak salah arah.

Tanpa langkah 1–3 panel tetap tidak tampil dan tidak ada request keluar — kondisi produksi saat ini.
