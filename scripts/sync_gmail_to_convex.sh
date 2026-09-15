#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

: "${CONVEX_URL:?Missing CONVEX_URL. Copy .env.example to .env.local for local use and export it before running.}"
export CONVEX_URL
FAIL_STATE="data/sync-fail-state.local.json"
PYTHON="${PYTHON:-python3}"
NODE="${NODE:-node}"

fail() {
  local msg="$1"
  "$NODE" scripts/record_sync_error.mjs "$msg" >/dev/null 2>&1 || true
  echo "1" > "$FAIL_STATE"
  echo "⚠️ Opportunity Radar sync failed: ${msg}" >&2
  exit 1
}

"$PYTHON" scripts/gmail_backfill.py --days "${DAYS:-14}" --out data/opportunities.local.json --max "${MAX_RESULTS:-200}" \
  || fail "Gmail backfill failed"
if [[ "${ENABLE_GDOC_ENRICHMENT:-0}" == "1" ]]; then
  : "${GDOC_ID:?Missing GDOC_ID while ENABLE_GDOC_ENRICHMENT=1}"
  "$PYTHON" scripts/gdoc_intel.py \
    --doc-id "$GDOC_ID" \
    --input data/opportunities.local.json \
    --output data/opportunities.enriched.local.json \
    || fail "Google Docs enrichment failed"
  "$NODE" scripts/push_to_convex.mjs data/opportunities.enriched.local.json || fail "Convex push failed"
else
  "$NODE" scripts/push_to_convex.mjs data/opportunities.local.json || fail "Convex push failed"
fi
"$NODE" scripts/cleanup_convex_board.mjs || fail "Cleanup failed"
rm -f "$FAIL_STATE"
