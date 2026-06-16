#!/usr/bin/env bash
# Rebuild ODA postal/city/street centroids from StatCan CSVs (no address re-import).
set -euo pipefail
cd "$(dirname "$0")/.."

rebuild_province() {
  local province="$1"
  local attempt=1
  local max_attempts=5
  while true; do
    echo "========== Centroids ${province} (attempt ${attempt}) $(date -u +%Y-%m-%dT%H:%M:%SZ) =========="
    if npm run import:oda -- --download --provinces "${province}" --remote --skip-schema --centroids-only; then
      rm -rf ".oda-import/${province}" 2>/dev/null || true
      echo "========== Done centroids ${province} =========="
      return 0
    fi
    if [[ "${attempt}" -ge "${max_attempts}" ]]; then
      echo "========== Failed centroids ${province} ==========" >&2
      return 1
    fi
    attempt=$((attempt + 1))
    rm -f ".oda-import/${province}"/*.sql 2>/dev/null || true
    sleep 60
  done
}

# Smaller provinces first; ON last (largest CSV)
for province in PE NT SK MB NB NS AB BC QC ON; do
  rebuild_province "${province}"
done

echo "Centroid rebuild complete $(date -u +%Y-%m-%dT%H:%M:%SZ)"
wrangler d1 execute oda-addresses --remote --command \
  "SELECT province, COUNT(*) as cnt FROM oda_postal_centroids GROUP BY province ORDER BY province;"
