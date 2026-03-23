#!/bin/bash
# Run all sync jobs in sequence:
# 1. Copy new transcripts from notesly-transcripts → peakmojo-company-os
# 2. Pull by-dates + context from S3 → local
# 3. Push brain from local → S3

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

"${SCRIPT_DIR}/sync-transcripts.sh"
"${SCRIPT_DIR}/sync-pull.sh"
"${SCRIPT_DIR}/sync-push-brain.sh"
