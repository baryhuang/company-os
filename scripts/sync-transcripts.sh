#!/bin/bash
# Sync transcripts from notesly-transcripts to peakmojo-company-os
# Copies only new files (--size-only avoids re-uploading unchanged files)
#
# Source: s3://notesly-transcripts/by-dates/
# Dest:   s3://peakmojo-company-os/peakmojo/by-dates/

set -euo pipefail

SRC_BUCKET="notesly-transcripts"
DST_BUCKET="peakmojo-company-os"
SRC_PREFIX="by-dates/"
DST_PREFIX="peakmojo/by-dates/"

echo "[$(date -Iseconds)] sync-transcripts: starting"

aws s3 sync \
    "s3://${SRC_BUCKET}/${SRC_PREFIX}" \
    "s3://${DST_BUCKET}/${DST_PREFIX}" \
    --size-only \
    --quiet

echo "[$(date -Iseconds)] sync-transcripts: done"
