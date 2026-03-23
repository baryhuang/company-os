#!/bin/bash
# Run all sync jobs in sequence:
# 1. Copy agent CLAUDE.md to workspace
# 2. Copy new transcripts from notesly-transcripts → peakmojo-company-os
# 3. Pull by-dates + context from S3 → local
# 4. Push brain from local → S3

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCAL_BASE="${HOME}/company-os/peakmojo"

# Copy latest agent CLAUDE.md from repo to workspace
cp "${SCRIPT_DIR}/agent-CLAUDE.md" "${LOCAL_BASE}/CLAUDE.md"

"${SCRIPT_DIR}/sync-transcripts.sh"
"${SCRIPT_DIR}/sync-pull.sh"
"${SCRIPT_DIR}/sync-push-brain.sh"
