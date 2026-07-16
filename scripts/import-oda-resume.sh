#!/usr/bin/env bash
# Resume remaining ODA imports after disk/network interruption.
set -euo pipefail
cd "$(dirname "$0")/.."

import_province() {
  local province="$1"
  shift
  local attempt=1
  local max_attempts=5
  while true; do
    echo "========== Importing ${province} (attempt ${attempt}) $(date -u +%Y-%m-%dT%H:%M:%SZ) =========="
    if bun run import:oda -- --download --provinces "${province}" --remote --skip-schema "$@"; then
      echo "========== Done ${province} =========="
      return 0
    fi
    if [[ "${attempt}" -ge "${max_attempts}" ]]; then
      echo "========== Failed ${province} after ${max_attempts} attempts ==========" >&2
      return 1
    fi
    attempt=$((attempt + 1))
    rm -f .oda-import/${province}-addresses-*.sql 2>/dev/null || true
    echo "========== Retrying ${province} in 60s (attempt ${attempt}/${max_attempts}) =========="
    sleep 60
  done
}

for province in AB BC; do
  import_province "${province}" --resume
done

import_province QC

import_province ON --resume

echo "All remaining imports complete $(date -u +%Y-%m-%dT%H:%M:%SZ)"
wrangler d1 execute oda-addresses --remote --command \
  "SELECT province, COUNT(*) as cnt FROM oda_addresses GROUP BY province ORDER BY province;"
