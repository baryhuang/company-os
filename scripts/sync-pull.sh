#!/bin/bash
# Pull by-dates, context, and skills from S3 to local
#
# Source: s3://peakmojo-company-os/peakmojo/
# Dest:   ~/company-os/peakmojo/

set -euo pipefail

BUCKET="peakmojo-company-os"
LOCAL_BASE="${HOME}/company-os/peakmojo"

echo "[$(date -Iseconds)] sync-pull: starting"

# Pull transcripts
aws s3 sync \
    "s3://${BUCKET}/peakmojo/by-dates/" \
    "${LOCAL_BASE}/by-dates/" \
    --size-only \
    --quiet

# Pull context + skills
aws s3 sync \
    "s3://${BUCKET}/peakmojo/context/" \
    "${LOCAL_BASE}/context/" \
    --size-only \
    --quiet

echo "[$(date -Iseconds)] sync-pull: done"
