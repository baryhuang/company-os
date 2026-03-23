#!/bin/bash
# Sync daemon — runs all sync jobs in a loop every 5 minutes.
# Can be run directly or as a systemd service.
#
# Usage:
#   ./sync-all.sh              # run loop (default 300s interval)
#   ./sync-all.sh --once       # run once and exit
#   SYNC_INTERVAL=60 ./sync-all.sh  # custom interval in seconds

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCAL_BASE="${HOME}/company-os/peakmojo"
SYNC_INTERVAL="${SYNC_INTERVAL:-300}"

sync_once() {
    echo "[$(date -Iseconds)] sync: starting"

    # Copy latest agent CLAUDE.md from repo to workspace
    cp "${SCRIPT_DIR}/agent-CLAUDE.md" "${LOCAL_BASE}/CLAUDE.md"

    "${SCRIPT_DIR}/sync-transcripts.sh"
    "${SCRIPT_DIR}/sync-pull.sh"
    "${SCRIPT_DIR}/sync-push-brain.sh"

    echo "[$(date -Iseconds)] sync: done"
}

if [ "${1:-}" = "--once" ]; then
    sync_once
    exit 0
fi

echo "Starting sync daemon (interval: ${SYNC_INTERVAL}s)"
while true; do
    sync_once || echo "[$(date -Iseconds)] sync: ERROR (continuing)"
    sleep "${SYNC_INTERVAL}"
done
