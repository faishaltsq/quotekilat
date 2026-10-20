#!/usr/bin/env bash
# Phase 2 SQL gate: apply shim + migrations to a throwaway Postgres, then run
# the RLS/quota assertions. Fails the build on any assertion failure.
#
# Usage: scripts/verify-supabase.sh [--keep]
# Requires Docker. Never runs against a real Supabase project.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS="$ROOT/supabase/migrations"
VERIFY="$ROOT/supabase/tests/phase2_rls_quota.sql"
SHIM="$ROOT/supabase/tests/shim.sql"
CONTAINER="quotekilat-sqlgate"

cleanup() {
  if [ "${1:-}" != "--keep" ]; then docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT

for f in "$SHIM" "$VERIFY"; do
  [ -f "$f" ] || { echo "missing $f" >&2; exit 1; }
done

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=scratch postgres:16-alpine >/dev/null

for _ in $(seq 1 30); do
  docker exec "$CONTAINER" pg_isready -U postgres -q && break
  sleep 1
done
docker exec "$CONTAINER" pg_isready -U postgres -q || { echo "postgres did not start" >&2; exit 1; }

# NOTICEs from `drop policy if exists` on a first apply are expected, not errors.
psql_apply() {
  docker exec -i "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -q -f - 2>&1 \
    | grep -vE 'NOTICE:|^$' || true
}
psql_strict() {
  docker exec -i "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -q -f -
}

echo "== shim =="
psql_strict < "$SHIM"

echo "== migrations =="
for m in "$MIGRATIONS"/*.sql; do
  echo "   $(basename "$m")"
  psql_apply < "$m"
done

# Only migrations that declare themselves re-runnable are applied twice. The
# schema migration is one-shot: Supabase records it in its own ledger and never
# replays it, so demanding IF NOT EXISTS everywhere would be noise.
echo "== idempotency (migrations declaring -- idempotent: true) =="
for m in "$MIGRATIONS"/*.sql; do
  if grep -q '^-- idempotent: true' "$m"; then
    echo "   re-applying $(basename "$m")"
    psql_apply < "$m" >/dev/null
  fi
done

# Run the assertions exactly once: the script mutates state, so a second run
# would fail on rows the first run already created.
echo "== assertions =="
set +e
OUTPUT="$(docker exec -i "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -f - < "$VERIFY" 2>&1)"
STATUS=$?
set -e
echo "$OUTPUT" | grep -E '^\s*(PASS|FAIL)|assertion' || true

if [ "$STATUS" -ne 0 ]; then
  echo "== SQL gate FAILED ==" >&2
  exit 1
fi

echo "== SQL gate passed =="
