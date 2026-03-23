#!/bin/bash
# Push local brain and users files to S3
#
# Source: ~/company-os/peakmojo/brain/ and ~/company-os/peakmojo/users/
# Dest:   s3://peakmojo-company-os/peakmojo/brain/ and s3://peakmojo-company-os/peakmojo/users/

set -euo pipefail

BUCKET="peakmojo-company-os"
LOCAL_BASE="${HOME}/company-os/peakmojo"

echo "[$(date -Iseconds)] sync-push: starting"

# Push brain
aws s3 sync \
    "${LOCAL_BASE}/brain/" \
    "s3://${BUCKET}/peakmojo/brain/" \
    --size-only \
    --quiet

# Push users
aws s3 sync \
    "${LOCAL_BASE}/users/" \
    "s3://${BUCKET}/peakmojo/users/" \
    --size-only \
    --quiet

echo "[$(date -Iseconds)] sync-push: done"
