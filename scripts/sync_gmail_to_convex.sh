#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${CONVEX_URL:=https://secret-ladybug-592.convex.cloud}"
export CONVEX_URL
python scripts/gmail_backfill.py --days "${DAYS:-60}" --out data/opportunities.local.json --max "${MAX_RESULTS:-200}"
node scripts/push_to_convex.mjs data/opportunities.local.json
