#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${CONVEX_URL:=https://secret-ladybug-592.convex.cloud}"
export CONVEX_URL
python scripts/gmail_backfill.py --days "${DAYS:-60}" --out data/opportunities.local.json --max "${MAX_RESULTS:-200}"
if [[ "${ENABLE_GDOC_ENRICHMENT:-0}" == "1" ]] && python scripts/gdoc_intel.py \
  --doc-id "${GDOC_ID:-18gDt1KVMPnONbrQdZ_ulOMBecA11_VfiDI1mYasVcDw}" \
  --input data/opportunities.local.json \
  --output data/opportunities.enriched.local.json; then
  node scripts/push_to_convex.mjs data/opportunities.enriched.local.json
else
  node scripts/push_to_convex.mjs data/opportunities.local.json
fi
