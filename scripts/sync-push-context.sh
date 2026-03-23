#!/bin/bash
# Push local context/skills to S3
#
# Source: ~/company-os/peakmojo/context/
# Dest:   s3://peakmojo-company-os/peakmojo/context/

set -euo pipefail

BUCKET="peakmojo-company-os"
LOCAL_BASE="${HOME}/company-os/peakmojo"

echo "[$(date -Iseconds)] sync-push-context: starting"

aws s3 sync \
    "${LOCAL_BASE}/context/" \
    "s3://${BUCKET}/peakmojo/context/" \
    --size-only \
    --quiet

echo "[$(date -Iseconds)] sync-push-context: done"
