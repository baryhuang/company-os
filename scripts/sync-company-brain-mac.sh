#!/bin/bash
# S3 → Google Drive sync for Mac
# Pulls company brain from S3 to the local Google Drive shared folder.
# Intended to run via cron every 5 minutes.
#
# Setup:
#   cp scripts/sync-company-brain-mac.sh ~/scripts/sync-company-brain.sh
#   chmod +x ~/scripts/sync-company-brain.sh
#   (crontab -l 2>/dev/null; echo "*/5 * * * * $HOME/scripts/sync-company-brain.sh") | crontab -

export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH

LOG_FILE="/tmp/company-brain-sync.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

S3_SOURCE="${S3_BRAIN_SOURCE:?Set S3_BRAIN_SOURCE to your S3 brain path (e.g. s3://bucket/org/brain/)}"
LOCAL_DEST="${BRAIN_LOCAL_DIR:?Set BRAIN_LOCAL_DIR to your local Company Brain directory}"

echo "[$TIMESTAMP] Starting S3 sync..." >> "$LOG_FILE"

OUTPUT=$(aws s3 sync "$S3_SOURCE" "$LOCAL_DEST" 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    if [ -z "$OUTPUT" ]; then
        echo "[$TIMESTAMP] Sync complete. No changes." >> "$LOG_FILE"
    else
        echo "[$TIMESTAMP] Sync complete. Changes:" >> "$LOG_FILE"
        echo "$OUTPUT" >> "$LOG_FILE"
    fi
else
    echo "[$TIMESTAMP] ERROR (exit code $EXIT_CODE):" >> "$LOG_FILE"
    echo "$OUTPUT" >> "$LOG_FILE"
fi
