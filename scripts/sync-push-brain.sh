#!/bin/bash
# Push local brain files to S3
#
# Source: ~/company-os/peakmojo/brain/
# Dest:   s3://peakmojo-company-os/peakmojo/brain/

set -euo pipefail

BUCKET="peakmojo-company-os"
LOCAL_BASE="${HOME}/company-os/peakmojo"

echo "[$(date -Iseconds)] sync-push-brain: starting"

aws s3 sync \
    "${LOCAL_BASE}/brain/" \
    "s3://${BUCKET}/peakmojo/brain/" \
    --size-only \
    --quiet

echo "[$(date -Iseconds)] sync-push-brain: done"
