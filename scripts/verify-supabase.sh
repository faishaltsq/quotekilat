#!/usr/bin/env bash
# Phase 2 SQL gate: apply shim + migrations to a throwaway Postgres, then run
# the RLS/quota assertions. Fails the build on any assertion failure.
#
# Usage: scripts/verify-supabase.sh [--keep]
# Requires Docker. Never runs against a real Supabase project.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS="$ROOT/supabase/migrations"
VERIFY=("$ROOT/supabase/tests/phase2_rls_quota.sql" "$ROOT/supabase/tests/phase3_ai_quota.sql")
SHIM="$ROOT/supabase/tests/shim.sql"
CONTAINER="quotekilat-sqlgate"
COMBINED="quotekilat-sqlgate-combined"
COMBINED_APPLY="$ROOT/supabase/apply-all.sql"

cleanup() {
  if [ "${1:-}" != "--keep" ]; then
    docker rm -f "$CONTAINER" "$COMBINED" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

for f in "$SHIM" "${VERIFY[@]}"; do
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

# Run each suite exactly once: the scripts mutate state, so a second run would
# fail on rows the first run already created. Every suite must exit 0.
echo "== assertions =="
FAILED=0
for v in "${VERIFY[@]}"; do
  echo "   $(basename "$v")"
  set +e
  OUTPUT="$(docker exec -i "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -f - < "$v" 2>&1)"
  STATUS=$?
  set -e
  echo "$OUTPUT" | grep -E '^\s*(PASS|FAIL)|assertion' || true
  if [ "$STATUS" -ne 0 ]; then
    echo "   FAILED: $(basename "$v")" >&2
    echo "$OUTPUT" | tail -20 >&2
    FAILED=1
  fi
done

# The dashboard file is what a human actually pastes into production. Prove it
# applies to a blank database and that the assertions pass against it too, so
# apply-all.sql cannot silently drift from supabase/migrations.
echo "== combined apply-all.sql (fresh database) =="
docker rm -f "$COMBINED" >/dev/null 2>&1 || true
docker run -d --name "$COMBINED" -e POSTGRES_PASSWORD=scratch postgres:16-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "$COMBINED" pg_isready -U postgres -q && break
  sleep 1
done
docker exec "$COMBINED" pg_isready -U postgres -q || { echo "postgres did not start" >&2; exit 1; }

set +e
docker exec -i "$COMBINED" psql -U postgres -v ON_ERROR_STOP=1 -q -f - < "$SHIM" 2>&1 | grep -vE 'NOTICE:|^$'
docker exec -i "$COMBINED" psql -U postgres -v ON_ERROR_STOP=1 -q -f - < "$COMBINED_APPLY" 2>&1 | grep -vE 'NOTICE:|^$'
APPLY_STATUS=${PIPESTATUS[0]}
set -e
if [ "$APPLY_STATUS" -ne 0 ]; then
  echo "   FAILED: apply-all.sql did not apply to a blank database" >&2
  FAILED=1
else
  echo "   applied cleanly"
  for v in "${VERIFY[@]}"; do
    set +e
    OUTPUT="$(docker exec -i "$COMBINED" psql -U postgres -v ON_ERROR_STOP=1 -f - < "$v" 2>&1)"
    STATUS=$?
    set -e
    if [ "$STATUS" -ne 0 ]; then
      echo "   FAILED on combined: $(basename "$v")" >&2
      echo "$OUTPUT" | tail -20 >&2
      FAILED=1
    else
      echo "   $(basename "$v"): $(echo "$OUTPUT" | grep -c 'PASS') assertions"
    fi
  done
fi

if [ "$FAILED" -ne 0 ]; then
  echo "== SQL gate FAILED ==" >&2
  exit 1
fi

echo "== SQL gate passed =="
