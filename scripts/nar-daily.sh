#!/usr/bin/env bash
#
# Refresh the next city from the NAR queue. Intended for cron or a systemd timer.
#
# Environment:
#   CLOUDFLARE_ACCOUNT_ID   required — account that owns the oda-addresses database
#   CLOUDFLARE_API_TOKEN    optional — otherwise the wrangler OAuth session is used
#   NAR_REPO_DIR            optional — repo root (default: this script's parent directory)
#   NAR_LOG_DIR             optional — log directory (default: <repo>/.nar-import)
#   NAR_ALERT_WEBHOOK       optional — POSTed a JSON {"text": ...} on failure (Slack-style)
#
# Exits non-zero on failure. Safe to re-run: the refresh is idempotent.

set -uo pipefail

REPO="${NAR_REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$REPO" || exit 1

LOG_DIR="${NAR_LOG_DIR:-$REPO/.nar-import}"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/nar-daily.log"

# Keep the log bounded without depending on logrotate being configured.
if [ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt 5242880 ]; then
  mv -f "$LOG" "$LOG.1"
fi

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "CLOUDFLARE_ACCOUNT_ID is not set" >&2
  exit 1
fi
export CLOUDFLARE_ACCOUNT_ID

echo "=== $(date -u +%FT%TZ) nar-daily start ===" >> "$LOG"
npx tsx scripts/import-nar.ts --next --remote >> "$LOG" 2>&1
status=$?
echo "=== $(date -u +%FT%TZ) nar-daily exit $status ===" >> "$LOG"

if [ "$status" -ne 0 ]; then
  message="NAR daily refresh FAILED (exit $status) on $(hostname) at $(date -u +%FT%TZ). See $LOG"
  echo "$message" >&2
  if [ -n "${NAR_ALERT_WEBHOOK:-}" ]; then
    curl -fsS -m 10 -X POST -H 'Content-Type: application/json' \
      --data "$(printf '{"text":%s}' "$(printf '%s' "$message" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')")" \
      "$NAR_ALERT_WEBHOOK" >/dev/null 2>&1 || true
  fi
fi

exit "$status"
