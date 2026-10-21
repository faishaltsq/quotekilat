#!/usr/bin/env bash
# Pasang provider AI nyata ke QuoteKilat di Vercel Production, lalu deploy + verifikasi.
#
# Pakai:
#   AI_BASE_URL="https://api.contoh.com/v1" AI_MODEL="nama-model" AI_API_KEY="sk-..." \
#     bash scripts/set-ai-provider.sh
#
# Tanpa argumen, skrip hanya menampilkan status env yang sekarang terpasang.
set -euo pipefail

need() { [ -n "${!1:-}" ] || { echo "MISSING $1" >&2; exit 1; }; }

if [ -z "${AI_BASE_URL:-}" ] && [ -z "${AI_MODEL:-}" ] && [ -z "${AI_API_KEY:-}" ]; then
  echo "Status env AI di Production (nama saja, nilai tidak dicetak):"
  vercel env ls production 2>/dev/null | grep -E '^(AI_BASE_URL|AI_MODEL|AI_API_KEY)\b' || echo "  (belum ada satu pun)"
  echo
  echo "Isi ketiganya lalu jalankan ulang:"
  echo '  AI_BASE_URL="…/v1" AI_MODEL="…" AI_API_KEY="…" bash scripts/set-ai-provider.sh'
  exit 0
fi

need AI_BASE_URL
need AI_MODEL
need AI_API_KEY

echo "==> Set AI_BASE_URL / AI_MODEL / AI_API_KEY (production)"
# vercel env add bersifat idempotent hanya lewat rm+add; nilai dibaca dari stdin, tidak masuk riwayat shell.
for pair in "AI_BASE_URL:$AI_BASE_URL" "AI_MODEL:$AI_MODEL" "AI_API_KEY:$AI_API_KEY"; do
  name="${pair%%:*}"; value="${pair#*:}"
  vercel env rm "$name" production --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | vercel env add "$name" production >/dev/null
  echo "    $name ok"
done

# Optional: reasoning models spend output budget on hidden reasoning tokens before
# emitting JSON. "low" keeps a parse inside the 30s function limit.
if [ -n "${AI_REASONING_EFFORT:-}" ]; then
  vercel env rm AI_REASONING_EFFORT production --yes >/dev/null 2>&1 || true
  printf '%s' "$AI_REASONING_EFFORT" | vercel env add AI_REASONING_EFFORT production >/dev/null
  echo "    AI_REASONING_EFFORT ok ($AI_REASONING_EFFORT)"
fi

echo "==> Deploy production"
vercel deploy --prod --yes | tail -2

echo "==> Smoke endpoint"
BASE="https://quotekilat.vercel.app"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/ai/parse")
echo "    GET  $BASE/api/ai/parse -> $code (harap 405)"
body=$(curl -s -X POST "$BASE/api/ai/parse" -H 'content-type: application/json' -d '{"text":"tes"}')
echo "    POST tanpa token -> $body"
echo
echo "Selesai. Parse nyata tetap butuh sesi login (401 tanpa token)."
echo "Setelah login, panel Smart Input harus mengembalikan hasil asli (bukan mock)."
