#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Public-release guardrail. Scans tracked files and unignored working-tree files
# while excluding local-only data already covered by .gitignore.
patterns=(
  '[A-Za-z0-9._%+-]+@gmail\.com'
  'https://[a-z0-9-]+\.convex\.cloud'
  'CONVEX_DEPLOYMENT=dev:'
  'VITE_CONVEX_URL=https://'
  'CONVEX_URL=https://'
  '/Users/[A-Za-z0-9._-]+'
  'Dropbox'
  'google_token'
  'google_client_secret'
  'api[_-]?key\s*[:=]'
  'access[_-]?token\s*[:=]'
  'refresh[_-]?token\s*[:=]'
  'Bearer [A-Za-z0-9._-]{20,}'
  'PRIVATE KEY'
)
regex="$(IFS='|'; echo "${patterns[*]}")"

status=0
while IFS= read -r file; do
  [[ -f "$file" ]] || continue
  case "$file" in
    .gitignore|scripts/secret_scan.sh) continue ;;
  esac
  if grep -nEI "$regex" "$file" >/tmp/opportunity-radar-secret-scan-hit 2>/dev/null; then
    echo "Potential sensitive content in $file" >&2
    sed 's/^/  /' /tmp/opportunity-radar-secret-scan-hit >&2
    status=1
  fi
done < <(git ls-files --cached --others --exclude-standard)

rm -f /tmp/opportunity-radar-secret-scan-hit
if [[ "$status" -ne 0 ]]; then
  echo "Secret/PII scan failed. Redact the flagged content or add a safe exception with justification." >&2
  exit "$status"
fi

echo "Secret/PII scan passed."
