#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Telegram voice memo transcription bot + web dashboard.

Send a voice memo to the bot, get a summary + full transcript file back.
Send text to save it as a note.
Send any other file and it gets stored for you.

All files are stored locally under data/{bot_name}/... and optionally
synced to S3 with the exact same path structure.

Usage:
    uv run server/telegram_bot.py
"""

import asyncio
import base64
import os
import sys
import io
import json
import logging
import datetime
from pathlib import Path

# Ensure the project root is on sys.path so "server.*" imports work
# regardless of how this script is invoked.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import boto3
import uvicorn
from dotenv import load_dotenv

from server.bot_state import state as bot_state

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Unified local storage root — mirrors S3 key structure exactly
DATA_DIR = Path(__file__).parent.parent / "data"

# Short transcripts are sent inline, long ones get summary + file
INLINE_CHAR_LIMIT = 2000


def _get_digitalocean_ai_client():
    """Get DigitalOcean AI (OpenAI-compatible) client if API key is configured."""
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        return None
    from openai import OpenAI
    base_url = os.getenv('OPENAI_BASE_URL', 'https://api.openai.com/v1')
    return OpenAI(api_key=api_key, base_url=base_url)


def _get_openrouter_ai_client():
    """Get OpenRouter client for vision/OCR tasks."""
    api_key = os.getenv('OPENROUTER_API_KEY')
    if not api_key:
        return None
    from openai import OpenAI
    base_url = os.getenv('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1')
    return OpenAI(api_key=api_key, base_url=base_url)


def _get_s3_client():
    """Get S3 client if bucket is configured."""
    bucket = os.getenv('S3_BUCKET')
    if not bucket:
        return None, None
    region = os.getenv('AWS_REGION', 'us-east-1')
    s3 = boto3.client('s3', region_name=region)
    return s3, bucket



def _sync_s3_prefix_to_local(s3_client, bucket: str, prefix: str, local_dir: Path):
    """Download all S3 objects under prefix to local_dir, skipping same-size files."""
    local_dir.mkdir(parents=True, exist_ok=True)
    paginator = s3_client.get_paginator('list_objects_v2')
    count = 0
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get('Contents', []):
            key = obj['Key']
            # Strip prefix to get relative path
            rel = key[len(prefix):].lstrip('/')
            if not rel:
                continue
            local_path = local_dir / rel
            if local_path.exists() and local_path.stat().st_size == obj['Size']:
                continue
            local_path.parent.mkdir(parents=True, exist_ok=True)
            s3_client.download_file(bucket, key, str(local_path))
            count += 1
    return count



def _sync_from_s3(s3_client, bucket: str, bot_name: str):
    """On startup, sync bot data from S3."""
    logger.info(f"Syncing bot data from s3://{bucket}/{bot_name}/ ...")
    count = _sync_s3_prefix_to_local(s3_client, bucket, f"{bot_name}/", DATA_DIR / bot_name)
    logger.info(f"Bot data sync: {count} files downloaded")



def _storage_prefix(bot_name: str, username: str, timestamp: str) -> str:
    """Build the relative path prefix used for both local and S3 storage.

    Returns e.g.: transcribe-bot/2026/02/19/143022_Alice
    """
    now = datetime.datetime.now()
    return f"{bot_name}/{now.strftime('%Y/%m/%d')}/{timestamp}_{username}"


def _trigger_bubblelab_webhook(s3_bucket: str, s3_file_path: str):
    """Trigger Bubble Lab webhook to sync the uploaded S3 file to Google Drive.

    Fires asynchronously (fire-and-forget) so it doesn't block the bot response.
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

    # Build the S3 URL from bucket name and region
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


def _save_file(s3_client, s3_bucket: str | None, prefix: str, filename: str, data: bytes | str):
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
        s3_client.put_object(Bucket=s3_bucket, Key=key, Body=body)
        logger.info(f"Uploaded to s3://{s3_bucket}/{key}")

        # Trigger Bubble Lab webhook to sync file to Google Drive
        _trigger_bubblelab_webhook(s3_bucket, key)

    return str(local_path)


def _summarize(transcript_text: str) -> str | None:
    """Summarize a transcript using OpenAI-compatible API. Returns None if unavailable."""
    client = _get_digitalocean_ai_client()
    if not client:
        return None

    model = os.getenv('OPENAI_MODEL', 'gpt-4o-mini')

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": (
                    "You are a meeting notes assistant. Summarize the transcript below. "
                    "Output format:\n"
                    "1. A 2-3 sentence summary of what was discussed.\n"
                    "2. Key decisions made (if any).\n"
                    "3. Action items with owners (if identifiable).\n\n"
                    "Be concise. Use bullet points. Do not include timestamps."
                )},
                {"role": "user", "content": transcript_text}
            ],
            max_tokens=1024,
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.error(f"Summarization failed: {e}")
        return None


def main():
    token = os.getenv('TELEGRAM_BOT_TOKEN')
    if not token:
        logger.error("TELEGRAM_BOT_TOKEN not set in .env")
        sys.exit(1)

    if not os.getenv('ASSEMBLY_API_KEY'):
        logger.error("ASSEMBLY_API_KEY not set in .env")
        sys.exit(1)

    import assemblyai as aai
    aai.settings.api_key = os.getenv('ASSEMBLY_API_KEY')

    from telegram import Update
    from telegram.ext import Application, CommandHandler, MessageHandler, filters

    from server.src.transcription import transcribe_video

    # Ensure storage root exists
    DATA_DIR.mkdir(exist_ok=True)

    s3_client, s3_bucket = _get_s3_client()
    bot_name = os.getenv('BOT_NAME', 'transcribe-bot')

    ai_enabled = bool(_get_digitalocean_ai_client())
    if ai_enabled:
        logger.info("AI enabled (OPENAI_API_KEY configured) — summarization active")
    else:
        logger.info("AI disabled (no OPENAI_API_KEY). Summarization unavailable.")

    if s3_client:
        logger.info(f"S3 storage enabled (bucket: {s3_bucket}) — local + S3 sync")
        _sync_from_s3(s3_client, s3_bucket, bot_name)
    else:
        logger.info("S3 storage disabled (no S3_BUCKET). Saving files locally only.")

    # Populate shared state for the dashboard API
    bot_state.started_at = datetime.datetime.now()
    bot_state.bot_name = bot_name
    bot_state.s3_enabled = bool(s3_client)
    bot_state.s3_bucket = s3_bucket or ""

    logger.info(f"Local storage: {DATA_DIR.resolve()}/{bot_name}/")

    # ── Text buffering (1.5s debounce per user) ────────────────
    _text_buffers: dict[int, list[str]] = {}       # user_id → list of text chunks
    _text_timers: dict[int, asyncio.TimerHandle] = {}  # user_id → pending timer

    # ── Photo / media-group buffering (2s debounce) ───────────
    _photo_buffers: dict[str, list] = {}           # media_group_id → list of (file_id, file_unique_id)
    _photo_meta: dict[str, dict] = {}              # media_group_id → {msg, user, caption}
    _photo_timers: dict[str, asyncio.TimerHandle] = {}

    async def start(update: Update, context):
        features = [
            "Send me a *voice memo* or *audio/video file* — I'll transcribe it with speaker labels.",
            "Send me *text* — I'll save it as a note.",
            "Send me *any other file* — I'll store it for you.",
        ]

        await update.message.reply_text(
            "\n".join(features) + "\n\nSpeaker diarization and auto language detection included.",
            parse_mode="Markdown"
        )

    # Serialize transcription to avoid concurrent file conflicts
    _transcribe_lock = asyncio.Lock()

    # ── Transcript deduplication index ────────────────────────────
    _transcript_index_path = DATA_DIR / bot_name / "transcript_index.json"

    def _load_transcript_index() -> dict:
        if _transcript_index_path.exists():
            with open(_transcript_index_path, 'r') as f:
                return json.load(f)
        return {}

    def _save_transcript_index(index: dict):
        _transcript_index_path.parent.mkdir(parents=True, exist_ok=True)
        with open(_transcript_index_path, 'w') as f:
            json.dump(index, f)

    async def _transcribe_and_reply(msg, file, ext, file_unique_id=None):
        """Common transcription logic for voice/audio/video messages and documents."""
        user = msg.from_user
        username = user.first_name or str(user.id)

        # Check dedup index — return cached transcript if we've seen this file before
        if file_unique_id:
            index = _load_transcript_index()
            if file_unique_id in index:
                cached_prefix = index[file_unique_id]
                cached_transcript = DATA_DIR / cached_prefix / "transcript.txt"
                if cached_transcript.exists():
                    logger.info(f"Returning cached transcript for file_unique_id={file_unique_id}")
                    transcript_text = cached_transcript.read_text()
                    if len(transcript_text) <= INLINE_CHAR_LIMIT:
                        await msg.reply_text(transcript_text, parse_mode="Markdown")
                    else:
                        summary = _summarize(transcript_text)
                        reply_text = f"*Summary:*\n\n{summary}" if summary else transcript_text[:1500] + "\n\n_(full transcript attached as file)_"
                        await msg.reply_text(reply_text, parse_mode="Markdown")
                        transcript_filename = f"{datetime.datetime.now().strftime('%Y-%m-%d')}_{username}.txt"
                        file_bytes = io.BytesIO(transcript_text.encode('utf-8'))
                        file_bytes.name = transcript_filename
                        await msg.reply_document(
                            document=file_bytes,
                            filename=transcript_filename,
                            caption="Full transcript with speaker labels and timestamps (cached)."
                        )
                    bot_state.transcription_count += 1
                    bot_state.record_activity()
                    return

        # Include message ID for uniqueness when multiple files arrive at the same second
        timestamp = f"{datetime.datetime.now().strftime('%H%M%S')}_{msg.message_id}"
        prefix = _storage_prefix(bot_name, username, timestamp)

        processing_msg = await msg.reply_text("Transcribing... this may take a minute.")

        # Download audio to the unified storage location
        audio_filename = f"audio{ext}"
        local_audio = DATA_DIR / prefix / audio_filename
        local_audio.parent.mkdir(parents=True, exist_ok=True)
        await file.download_to_drive(str(local_audio))
        logger.info(f"Downloaded audio to {local_audio}")

        try:
            async with _transcribe_lock:
                segments = await asyncio.get_event_loop().run_in_executor(
                    None, transcribe_video, str(local_audio)
                )

            if not segments:
                await processing_msg.edit_text("Sorry, I couldn't transcribe that audio. It might be too short or unclear.")
                return

            transcript_text = _format_transcript(segments)

            # Save audio + transcript (audio already on disk, just sync to S3)
            with open(local_audio, 'rb') as f:
                audio_bytes = f.read()
            _save_file(s3_client, s3_bucket, prefix, audio_filename, audio_bytes)
            _save_file(s3_client, s3_bucket, prefix, "transcript.txt", transcript_text)

            # Update dedup index
            if file_unique_id:
                index = _load_transcript_index()
                index[file_unique_id] = prefix
                _save_transcript_index(index)
                _save_file(s3_client, s3_bucket, bot_name,
                           "transcript_index.json", json.dumps(index))

            # Reply
            if len(transcript_text) <= INLINE_CHAR_LIMIT:
                await processing_msg.edit_text(transcript_text, parse_mode="Markdown")
            else:
                await processing_msg.edit_text("Transcription done. Generating summary...")

                summary = _summarize(transcript_text)

                if summary:
                    reply_text = f"*Summary:*\n\n{summary}"
                else:
                    preview = transcript_text[:1500] + "\n\n_(full transcript attached as file)_"
                    reply_text = preview

                await processing_msg.edit_text(reply_text, parse_mode="Markdown")

                transcript_filename = f"{datetime.datetime.now().strftime('%Y-%m-%d')}_{timestamp}_{username}.txt"
                file_bytes = io.BytesIO(transcript_text.encode('utf-8'))
                file_bytes.name = transcript_filename
                await msg.reply_document(
                    document=file_bytes,
                    filename=transcript_filename,
                    caption="Full transcript with speaker labels and timestamps."
                )

            bot_state.transcription_count += 1
            bot_state.record_activity()
            logger.info(f"Sent transcript to {username} ({len(segments)} segments)")

        except Exception as e:
            logger.error(f"Transcription failed for {username}: {e}", exc_info=True)
            bot_state.record_error(f"Transcription failed for {username}: {str(e)[:200]}")
            await processing_msg.edit_text(f"Sorry, transcription failed. Please try again.\nError: {str(e)[:200]}")

    async def handle_voice(update: Update, context):
        """Handle voice notes, audio files, and video files → transcribe."""
        msg = update.message
        user = msg.from_user
        logger.info(f"Received voice memo from {user.first_name} ({user.id})")

        if msg.voice:
            file = await msg.voice.get_file()
            ext = ".ogg"
            file_unique_id = msg.voice.file_unique_id
        elif msg.audio:
            file = await msg.audio.get_file()
            ext = _mime_to_ext(msg.audio.mime_type or "audio/ogg")
            file_unique_id = msg.audio.file_unique_id
        elif msg.video:
            file = await msg.video.get_file()
            ext = ".mp4"
            file_unique_id = msg.video.file_unique_id
        elif msg.video_note:
            file = await msg.video_note.get_file()
            ext = ".mp4"
            file_unique_id = msg.video_note.file_unique_id
        else:
            return

        await _transcribe_and_reply(msg, file, ext, file_unique_id)

    async def handle_text(update: Update, context):
        """Handle text messages → buffer and flush after 1.5s of silence."""
        msg = update.message
        user = msg.from_user
        text = msg.text.strip()

        if not text:
            return

        uid = user.id
        logger.info(f"Buffering text from {user.first_name} ({uid}): {text[:80]}...")

        # Append to buffer
        _text_buffers.setdefault(uid, []).append(text)

        # Cancel existing timer for this user
        if uid in _text_timers:
            _text_timers[uid].cancel()

        # Schedule flush after 1.5s of silence
        loop = asyncio.get_event_loop()
        _text_timers[uid] = loop.call_later(
            1.5,
            lambda u=user, m=msg: asyncio.ensure_future(_flush_text_buffer(u, m)),
        )

    async def _flush_text_buffer(user, last_msg):
        """Flush buffered text messages into a single note.txt."""
        uid = user.id
        chunks = _text_buffers.pop(uid, [])
        _text_timers.pop(uid, None)

        if not chunks:
            return

        combined = "\n".join(chunks)
        username = user.first_name or str(uid)
        timestamp = datetime.datetime.now().strftime("%H%M%S")
        prefix = _storage_prefix(bot_name, username, timestamp)

        logger.info(f"Flushing {len(chunks)} buffered text(s) from {username} ({len(combined)} chars)")

        try:
            _save_file(s3_client, s3_bucket, prefix, "note.txt", combined)
            bot_state.file_count += 1
            bot_state.record_activity()
            await last_msg.reply_text(
                f"Note saved ({len(chunks)} message{'s' if len(chunks) > 1 else ''}).",
                parse_mode="Markdown",
            )
        except Exception as e:
            logger.error(f"Note save failed for {username}: {e}", exc_info=True)
            bot_state.record_error(f"Note save failed for {username}: {str(e)[:200]}")
            await last_msg.reply_text(f"Sorry, couldn't save the note.\nError: {str(e)[:200]}")

    async def _ocr_single_image(file_bytes: bytes, page_label: str | None = None) -> str:
        """Run OCR on a single image via OpenRouter vision model."""
        client = _get_openrouter_ai_client()
        if not client:
            raise RuntimeError("OpenRouter not configured (OPENROUTER_API_KEY missing) — OCR unavailable")

        model = os.getenv('OPENROUTER_MODEL', 'google/gemini-2.5-flash-lite')
        b64 = base64.b64encode(file_bytes).decode('ascii')

        prompt = "Extract all text from this image. Preserve the original formatting, layout, and language as much as possible. Output only the extracted text, no commentary."
        if page_label:
            prompt = f"[Page {page_label}] " + prompt

        resp = client.chat.completions.create(
            model=model,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                ],
            }],
            max_tokens=4096,
        )
        return resp.choices[0].message.content or ""

    async def _merge_ocr_pages(pages: list[str]) -> str:
        """Use AI to merge multi-page OCR results into a clean document."""
        client = _get_openrouter_ai_client()
        if not client or len(pages) <= 1:
            return "\n\n".join(pages)

        model = os.getenv('OPENROUTER_MODEL', 'google/gemini-2.5-flash-lite')
        combined = "\n\n---\n\n".join(f"[Page {i+1}]\n{p}" for i, p in enumerate(pages))

        try:
            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": (
                        "You are a document assembly assistant. The user provides OCR text from "
                        "multiple pages of the same document. Merge them into one clean, coherent "
                        "document. Fix obvious OCR errors, remove duplicate headers/footers, "
                        "and preserve the original structure. Output only the merged text."
                    )},
                    {"role": "user", "content": combined},
                ],
                max_tokens=8192,
            )
            return resp.choices[0].message.content or "\n\n".join(pages)
        except Exception as e:
            logger.error(f"OCR merge failed: {e}")
            return "\n\n".join(pages)

    async def handle_photo(update: Update, context):
        """Handle photo messages → OCR via OpenRouter vision, save as note."""
        msg = update.message
        user = msg.from_user
        media_group_id = msg.media_group_id

        if media_group_id:
            # Part of a media group — buffer and debounce
            photo = msg.photo[-1]  # largest resolution
            _photo_buffers.setdefault(media_group_id, []).append(photo.file_id)
            _photo_meta[media_group_id] = {"msg": msg, "user": user, "caption": msg.caption}

            if media_group_id in _photo_timers:
                _photo_timers[media_group_id].cancel()

            loop = asyncio.get_event_loop()
            _photo_timers[media_group_id] = loop.call_later(
                2.0,
                lambda gid=media_group_id: asyncio.ensure_future(_flush_photo_group(gid)),
            )
            return

        # Single photo
        logger.info(f"Received single photo from {user.first_name} ({user.id})")
        processing_msg = await msg.reply_text("Processing image...")

        try:
            photo = msg.photo[-1]
            file = await photo.get_file()
            file_data = await file.download_as_bytearray()

            ocr_text = await _ocr_single_image(bytes(file_data))

            username = user.first_name or str(user.id)
            timestamp = datetime.datetime.now().strftime("%H%M%S")
            prefix = _storage_prefix(bot_name, username, timestamp)

            # Prepend caption if provided
            if msg.caption:
                ocr_text = f"{msg.caption}\n\n---\n\n{ocr_text}"

            _save_file(s3_client, s3_bucket, prefix, "note.txt", ocr_text)
            bot_state.file_count += 1
            bot_state.record_activity()

            preview = ocr_text[:500] + ("..." if len(ocr_text) > 500 else "")
            await processing_msg.edit_text(f"Image text extracted and saved.\n\n{preview}")

        except Exception as e:
            logger.error(f"Photo OCR failed for {user.first_name}: {e}", exc_info=True)
            bot_state.record_error(f"Photo OCR failed for {user.first_name}: {str(e)[:200]}")
            await processing_msg.edit_text(f"Sorry, couldn't process the image.\nError: {str(e)[:200]}")

    async def _flush_photo_group(media_group_id: str):
        """Flush a media group: OCR each photo, merge, save as note."""
        file_ids = _photo_buffers.pop(media_group_id, [])
        meta = _photo_meta.pop(media_group_id, {})
        _photo_timers.pop(media_group_id, None)

        if not file_ids or not meta:
            return

        msg = meta["msg"]
        user = meta["user"]
        caption = meta.get("caption")

        logger.info(f"Processing media group {media_group_id}: {len(file_ids)} photos from {user.first_name}")
        processing_msg = await msg.reply_text(f"Processing {len(file_ids)} images...")

        try:
            # Download and OCR each photo
            pages = []
            for i, file_id in enumerate(file_ids):
                file = await msg.get_bot().get_file(file_id)
                file_data = await file.download_as_bytearray()
                page_text = await _ocr_single_image(bytes(file_data), page_label=str(i + 1))
                pages.append(page_text)

            # Merge pages
            merged = await _merge_ocr_pages(pages)

            username = user.first_name or str(user.id)
            timestamp = datetime.datetime.now().strftime("%H%M%S")
            prefix = _storage_prefix(bot_name, username, timestamp)

            if caption:
                merged = f"{caption}\n\n---\n\n{merged}"

            _save_file(s3_client, s3_bucket, prefix, "note.txt", merged)
            bot_state.file_count += 1
            bot_state.record_activity()

            preview = merged[:500] + ("..." if len(merged) > 500 else "")
            await processing_msg.edit_text(
                f"Extracted text from {len(file_ids)} images and saved.\n\n{preview}"
            )

        except Exception as e:
            logger.error(f"Photo group OCR failed for {user.first_name}: {e}", exc_info=True)
            bot_state.record_error(f"Photo group OCR failed for {user.first_name}: {str(e)[:200]}")
            await processing_msg.edit_text(f"Sorry, couldn't process the images.\nError: {str(e)[:200]}")

    async def handle_document(update: Update, context):
        """Handle document uploads — route audio/video to transcription, store everything else."""
        msg = update.message
        user = msg.from_user
        doc = msg.document

        if not doc:
            return

        mime = doc.mime_type or ""

        # Audio/video documents → transcribe
        if mime.startswith("audio/") or mime.startswith("video/"):
            logger.info(f"Received audio/video document from {user.first_name} ({user.id})")
            file = await doc.get_file()
            ext = _mime_to_ext(mime) if mime.startswith("audio/") else ".mp4"
            await _transcribe_and_reply(msg, file, ext, doc.file_unique_id)
            return

        # All other documents → store
        logger.info(f"Received file from {user.first_name}: {doc.file_name} ({mime})")

        processing_msg = await msg.reply_text("Saving your file...")

        try:
            file = await doc.get_file()
            filename = doc.file_name or f"file_{msg.message_id}"
            username = user.first_name or str(user.id)
            timestamp = datetime.datetime.now().strftime("%H%M%S")
            prefix = _storage_prefix(bot_name, username, timestamp)

            file_data = await file.download_as_bytearray()
            _save_file(s3_client, s3_bucket, prefix, filename, bytes(file_data))

            bot_state.file_count += 1
            bot_state.record_activity()
            await processing_msg.edit_text(f"Saved: `{filename}`", parse_mode="Markdown")

        except Exception as e:
            logger.error(f"File save failed for {user.first_name}: {e}", exc_info=True)
            bot_state.record_error(f"File save failed for {user.first_name}: {str(e)[:200]}")
            await processing_msg.edit_text(f"Sorry, couldn't save the file.\nError: {str(e)[:200]}")

    def _mime_to_ext(mime_type: str) -> str:
        mapping = {
            "audio/ogg": ".ogg",
            "audio/mpeg": ".mp3",
            "audio/mp4": ".m4a",
            "audio/aac": ".aac",
            "audio/wav": ".wav",
            "audio/x-wav": ".wav",
            "audio/opus": ".ogg",
            "video/mp4": ".mp4",
            "video/quicktime": ".mov",
        }
        return mapping.get(mime_type.split(";")[0].strip(), ".ogg")

    def _format_transcript(segments) -> str:
        lines = []
        current_speaker = None
        for seg in sorted(segments, key=lambda x: x.start):
            timestamp = f"{int(seg.start//60):02d}:{int(seg.start%60):02d}"
            if seg.speaker and seg.speaker != current_speaker:
                current_speaker = seg.speaker
                lines.append(f"\n*Speaker {current_speaker}:*")
            lines.append(f"[{timestamp}] {seg.text}")
        return "\n".join(lines).strip()

    # Build Telegram app — order matters: more specific filters first
    builder = (
        Application.builder()
        .token(token)
        .read_timeout(60)
        .write_timeout(60)
        .connect_timeout(30)
        .get_updates_read_timeout(10)
    )
    telegram_api_server = os.getenv("TELEGRAM_API_SERVER")
    if telegram_api_server:
        builder = (
            builder
            .base_url(f"{telegram_api_server}/bot")
            .base_file_url(f"{telegram_api_server}/file/bot")
            .local_mode(True)
        )
        logger.info(f"Using local Telegram Bot API server: {telegram_api_server} (up to 2GB files)")
    else:
        logger.info("Using default Telegram Bot API (20MB file limit)")
    tg_app = builder.build()
    tg_app.add_handler(CommandHandler("start", start))
    tg_app.add_handler(MessageHandler(
        filters.VOICE | filters.AUDIO | filters.VIDEO | filters.VIDEO_NOTE,
        handle_voice
    ))
    tg_app.add_handler(MessageHandler(filters.PHOTO, handle_photo))
    tg_app.add_handler(MessageHandler(filters.Document.ALL, handle_document))
    tg_app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))

    async def run_all():
        """Run Telegram bot polling and FastAPI web server concurrently."""
        from server.api_server import app as fastapi_app

        # Configure uvicorn
        config = uvicorn.Config(
            fastapi_app,
            host="0.0.0.0",
            port=int(os.getenv("WEB_PORT", "8080")),
            log_level="info",
        )
        web_server = uvicorn.Server(config)

        # Wait for local Telegram Bot API sidecar if configured
        if telegram_api_server:
            import httpx
            for attempt in range(30):
                try:
                    async with httpx.AsyncClient() as client:
                        resp = await client.get(f"{telegram_api_server}", timeout=2)
                    logger.info(f"Local Telegram Bot API server is ready (attempt {attempt + 1})")
                    break
                except Exception:
                    logger.info(f"Waiting for local Telegram Bot API server... (attempt {attempt + 1}/30)")
                    await asyncio.sleep(2)
            else:
                logger.warning("Local Telegram Bot API server not reachable after 60s, proceeding anyway")

        # Start Telegram bot
        async with tg_app:
            await tg_app.updater.start_polling()
            await tg_app.start()
            logger.info("Bot started. Listening for voice memos, text, and files...")
            logger.info(f"Dashboard available at http://0.0.0.0:{config.port}")

            # Run web server (blocks until shutdown)
            await web_server.serve()

            # Cleanup
            await tg_app.updater.stop()
            await tg_app.stop()

    asyncio.run(run_all())


if __name__ == '__main__':
    main()
