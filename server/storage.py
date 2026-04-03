"""Shared storage helpers — local + S3 file saving and BubbleLab webhook."""

import datetime
import json
import logging
import os
from pathlib import Path

import boto3

logger = logging.getLogger(__name__)

# Unified local storage root — mirrors S3 key structure exactly
DATA_DIR = Path(__file__).parent.parent / "data"


def get_s3_client():
    """Get S3 client if bucket is configured."""
    bucket = os.getenv('S3_BUCKET')
    if not bucket:
        return None, None
    region = os.getenv('AWS_REGION', 'us-east-1')
    s3 = boto3.client('s3', region_name=region)
    return s3, bucket


def storage_prefix(bot_name: str, username: str, timestamp: str) -> str:
    """Build the relative path prefix used for both local and S3 storage.

    Returns e.g.: transcribe-bot/2026/02/19/143022_Alice
    """
    now = datetime.datetime.now()
    return f"{bot_name}/{now.strftime('%Y/%m/%d')}/{timestamp}_{username}"


def trigger_bubblelab_webhook(s3_bucket: str, s3_file_path: str):
    """Trigger Bubble Lab webhook to sync the uploaded S3 file to Google Drive.

    Fires synchronously (fire-and-forget style with a short timeout).
    Requires BUBBLELAB_WEBHOOK_URL env var. Additional env vars for the payload:
      S3_URL, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
      ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET,
      GOOGLE_DRIVE_FOLDER_ID
    """
    webhook_url = os.getenv('BUBBLELAB_WEBHOOK_URL')
    if not webhook_url:
        return

    import urllib.request
    import urllib.error

    region = os.getenv('AWS_REGION', 'us-east-1')
    s3_url = os.getenv('S3_URL', f"https://{s3_bucket}.s3.{region}.amazonaws.com/")

    payload = json.dumps({
        "s3Url": s3_url,
        "s3FilePath": s3_file_path,
        "s3AccessKeyId": os.getenv('S3_ACCESS_KEY_ID', os.getenv('AWS_ACCESS_KEY_ID', '')),
        "s3SecretAccessKey": os.getenv('S3_SECRET_ACCESS_KEY', os.getenv('AWS_SECRET_ACCESS_KEY', '')),
        "zoomAccountId": os.getenv('ZOOM_ACCOUNT_ID', ''),
        "zoomClientId": os.getenv('ZOOM_CLIENT_ID', ''),
        "zoomClientSecret": os.getenv('ZOOM_CLIENT_SECRET', ''),
        "googleDriveFolderId": os.getenv('GOOGLE_DRIVE_FOLDER_ID', ''),
    }).encode('utf-8')

    req = urllib.request.Request(
        webhook_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode('utf-8', errors='replace')
            logger.info(f"Bubble Lab webhook triggered for {s3_file_path}: {resp.status} {body[:200]}")
    except urllib.error.HTTPError as e:
        logger.warning(f"Bubble Lab webhook HTTP error for {s3_file_path}: {e.code} {e.read().decode('utf-8', errors='replace')[:200]}")
    except Exception as e:
        logger.warning(f"Bubble Lab webhook failed for {s3_file_path}: {e}")


def save_file(s3_client, s3_bucket: str | None, prefix: str, filename: str, data: bytes | str):
    """Save a file locally under data/{prefix}/{filename} and optionally to S3."""
    body = data.encode('utf-8') if isinstance(data, str) else data

    # Always save locally
    local_path = DATA_DIR / prefix / filename
    local_path.parent.mkdir(parents=True, exist_ok=True)
    local_path.write_bytes(body)
    logger.info(f"Saved locally: {local_path}")

    # Also upload to S3 if configured
    if s3_client and s3_bucket:
        key = f"{prefix}/{filename}"
        content_type = 'text/plain; charset=utf-8' if isinstance(data, str) else 'application/octet-stream'
        s3_client.put_object(Bucket=s3_bucket, Key=key, Body=body, ContentType=content_type)
        logger.info(f"Uploaded to s3://{s3_bucket}/{key}")

        # Trigger Bubble Lab webhook to sync file to Google Drive
        trigger_bubblelab_webhook(s3_bucket, key)

    return str(local_path)
