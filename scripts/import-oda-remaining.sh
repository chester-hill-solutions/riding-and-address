#!/usr/bin/env bash
# Import remaining StatCan ODA provinces to remote D1 (run after PE/NT/NB/NS pilot).
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
    echo "========== Retrying ${province} in 60s (attempt ${attempt}/${max_attempts}) =========="
    sleep 60
  done
}

# Wait for any in-flight NB import to finish (optional lock file)
for province in NS SK MB AB BC; do
  import_province "${province}" --resume
done

# QC had only 2 rows — full re-import without resume
import_province QC

# ON partial (~4M of ~6M) — resume
import_province ON --resume

echo "All remaining imports complete $(date -u +%Y-%m-%dT%H:%M:%SZ)"
wrangler d1 execute oda-addresses --remote --command \
  "SELECT province, COUNT(*) as cnt FROM oda_addresses GROUP BY province ORDER BY province;"
