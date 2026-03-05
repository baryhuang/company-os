#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Telegram voice memo transcription bot + web dashboard.

Send a voice memo to the bot, get a summary + full transcript file back.
Send text to chat with the AI assistant.
Send any other file and it gets stored for you.

All files are stored locally under data/{bot_name}/... and optionally
synced to S3 with the exact same path structure.

Usage:
    uv run server/telegram_bot.py
"""

import asyncio
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

# Per-user conversation history (persisted to disk + S3)
_chat_histories: dict[int, list[dict]] = {}
MAX_HISTORY = 20
_HISTORY_FILENAME = "chat_history.json"


def _load_chat_histories(bot_name: str):
    """Load chat histories from disk (synced from S3 on startup)."""
    global _chat_histories
    history_path = DATA_DIR / bot_name / _HISTORY_FILENAME
    if history_path.exists():
        try:
            data = json.loads(history_path.read_text())
            # JSON keys are strings, convert back to int user IDs
            _chat_histories = {int(k): v for k, v in data.items()}
            logger.info(f"Loaded chat histories for {len(_chat_histories)} users")
        except Exception as e:
            logger.error(f"Failed to load chat histories: {e}")
            _chat_histories = {}


def _save_chat_histories(bot_name: str, s3_client=None, s3_bucket: str | None = None):
    """Save chat histories to disk and optionally S3."""
    history_path = DATA_DIR / bot_name / _HISTORY_FILENAME
    history_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        history_path.write_text(json.dumps(_chat_histories, ensure_ascii=False, indent=None))
        # Also sync to S3
        if s3_client and s3_bucket:
            key = f"{bot_name}/{_HISTORY_FILENAME}"
            s3_client.upload_file(str(history_path), s3_bucket, key)
    except Exception as e:
        logger.error(f"Failed to save chat histories: {e}")


def _get_openai_client():
    """Get OpenAI-compatible client if API key is configured."""
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        return None
    from openai import OpenAI
    base_url = os.getenv('OPENAI_BASE_URL', 'https://api.openai.com/v1')
    return OpenAI(api_key=api_key, base_url=base_url)


def _get_s3_client():
    """Get S3 client if bucket is configured."""
    bucket = os.getenv('S3_BUCKET')
    if not bucket:
        return None, None
    region = os.getenv('AWS_REGION', 'us-east-1')
    s3 = boto3.client('s3', region_name=region)
    return s3, bucket


def _ensure_claude_config():
    """Create minimal Claude config files if they don't exist.

    The Claude Code CLI expects ~/.claude.json and ~/.claude/ to exist.
    Without them it logs warnings and may fail.
    """
    config_file = Path.home() / ".claude.json"
    if not config_file.exists():
        config_file.write_text("{}")
        logger.info(f"Created minimal {config_file}")

    claude_dir = Path.home() / ".claude"
    claude_dir.mkdir(exist_ok=True)


async def _analyze_with_file_agent(question: str, bot_name: str, user_id: int = 0, s3_client=None, s3_bucket: str | None = None, progress_callback=None) -> str | None:
    """Run Claude Agent SDK pointed at GLM to autonomously analyze stored files.

    The agent gets Read, Glob, Grep tools and is pointed at the data/ directory.
    GLM's Anthropic-compatible endpoint is configured via the env parameter
    on ClaudeAgentOptions (passed directly to the CLI subprocess).
    """
    glm_key = os.getenv('GLM_API_KEY')
    if not glm_key:
        return None

    from claude_agent_sdk import (
        query, ClaudeAgentOptions,
        AssistantMessage, SystemMessage, ResultMessage, UserMessage,
        TextBlock, ToolUseBlock, ToolResultBlock,
        ProcessError,
    )

    _ensure_claude_config()

    bot_data_dir = DATA_DIR / bot_name
    bot_data_dir.mkdir(parents=True, exist_ok=True)
    data_path = str(bot_data_dir.resolve())

    # Build env dict for the CLI subprocess.
    # Set both ANTHROPIC_AUTH_TOKEN (Bearer) and ANTHROPIC_API_KEY (x-api-key)
    # to maximise compatibility across CLI versions.
    agent_env = {
        "ANTHROPIC_BASE_URL": os.getenv('ANTHROPIC_BASE_URL', "https://api.z.ai/api/anthropic"),
        "ANTHROPIC_AUTH_TOKEN": glm_key,
        "ANTHROPIC_API_KEY": glm_key,
        "API_TIMEOUT_MS": "120000",
    }
    glm_model = os.getenv('GLM_MODEL')
    if glm_model:
        agent_env["ANTHROPIC_DEFAULT_SONNET_MODEL"] = glm_model

    # Also inject into current process env so the subprocess inherits them
    for k, v in agent_env.items():
        os.environ[k] = v

    logger.info(f"Agent env: BASE_URL={agent_env['ANTHROPIC_BASE_URL']}, "
                f"MODEL={glm_model}, apiKeySource={'ANTHROPIC_API_KEY+AUTH_TOKEN'}")

    # Build system prompt — tell agent to read chat history file directly
    history_file = bot_data_dir / _HISTORY_FILENAME
    utc_now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
    system_prompt = (
        f"Current time: {utc_now}\n\n"
        "You are a file analysis assistant. The user is asking about their stored files "
        "(meeting transcripts, voice memo transcriptions, uploaded documents). "
        "Browse the current directory to discover files, read the relevant ones, "
        "and answer the user's question. Be concise and helpful. Use markdown formatting.\n\n"
        f"You must read the file '{history_file.resolve()}' to understand the conversation history "
        "before answering. This JSON file contains the chat history between you and the user, "
        "with each entry having 'role' (user/assistant) and 'content' fields. "
        "Use this context to understand what the user has previously asked about."
    )

    options = ClaudeAgentOptions(
        system_prompt=system_prompt,
        allowed_tools=["Read", "Glob", "Grep"],
        cwd=data_path,
        max_turns=20,
        env=agent_env,
    )

    try:
        result_parts = []
        final_answer = None
        turn_count = 0
        async for message in query(prompt=question, options=options):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        logger.info(f"Agent text: {block.text[:200]}")
                        result_parts.append(block.text)
                    elif isinstance(block, ToolUseBlock):
                        turn_count += 1
                        logger.info(f"Agent tool call: {block.name}({getattr(block, 'input', '')})")
                        if progress_callback:
                            tool_name = block.name
                            tool_input = getattr(block, 'input', {})
                            if tool_name == "Grep":
                                detail = f"Searching for: {tool_input.get('pattern', '')}"
                            elif tool_name == "Read":
                                path = tool_input.get('file_path', '')
                                detail = f"Reading: {Path(path).name}"
                            elif tool_name == "Glob":
                                detail = f"Finding files: {tool_input.get('pattern', '')}"
                            else:
                                detail = f"Using {tool_name}"
                            await progress_callback(f"🔍 Analyzing files... ({turn_count}) {detail}")
                    elif isinstance(block, ToolResultBlock):
                        content = str(getattr(block, 'content', ''))[:200]
                        logger.info(f"Agent tool result: {content}")
            elif isinstance(message, SystemMessage):
                logger.info(f"Agent system: {message}")
            elif isinstance(message, ResultMessage):
                logger.info(f"Agent result: {message}")
                # Prefer ResultMessage.result — it contains the complete final answer
                r = getattr(message, 'result', None)
                if r:
                    final_answer = r
            else:
                logger.info(f"Agent message ({type(message).__name__}): {str(message)[:200]}")

        # Prefer the final answer from ResultMessage; fall back to collected text parts
        return final_answer or ("\n".join(result_parts) if result_parts else None)

    except ProcessError as e:
        logger.error(f"Claude Agent SDK process failed (exit code {e.exit_code}): {e}")
        if hasattr(e, 'stderr'):
            logger.error(f"Agent stderr: {e.stderr}")
        if hasattr(e, 'stdout'):
            logger.error(f"Agent stdout: {e.stdout}")
        return None
    except Exception as e:
        logger.error(f"Claude Agent SDK (GLM) failed: {type(e).__name__}: {e}")
        return None

    finally:
        pass  # No S3 sync needed — agent sessions are stateless


# Tool definition for OpenAI function calling (intent detection)
_CHAT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_stored_files",
            "description": (
                "Search and analyze the user's stored files (transcripts, meeting notes, uploaded documents). "
                "Call this when the user asks about their past meetings, transcripts, uploaded files, "
                "or wants to find/analyze/summarize content from stored files. "
                "Examples: 'what did we discuss yesterday?', 'find my transcript from Monday', "
                "'summarize all meetings this week', 'what files have I uploaded?'"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "The user's question about their stored files"
                    }
                },
                "required": ["question"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_current_time",
            "description": "Get the current time in UTC. Call this when the user asks what time it is.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    }
]


CLAUDE_DIR = Path.home() / ".claude"


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


def _sync_local_to_s3_prefix(s3_client, bucket: str, prefix: str, local_dir: Path):
    """Upload all files under local_dir to S3 under prefix, skipping same-size files."""
    if not local_dir.exists():
        return 0
    # Build a set of existing S3 objects for size comparison
    existing = {}
    paginator = s3_client.get_paginator('list_objects_v2')
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get('Contents', []):
            existing[obj['Key']] = obj['Size']

    count = 0
    for f in local_dir.rglob("*"):
        if not f.is_file():
            continue
        rel = str(f.relative_to(local_dir))
        key = f"{prefix}{rel}"
        if key in existing and existing[key] == f.stat().st_size:
            continue
        s3_client.upload_file(str(f), bucket, key)
        count += 1
    return count


def _sync_from_s3(s3_client, bucket: str, bot_name: str):
    """On startup, sync bot data + Claude Agent session history from S3."""
    # Sync bot data files
    logger.info(f"Syncing bot data from s3://{bucket}/{bot_name}/ ...")
    count = _sync_s3_prefix_to_local(s3_client, bucket, f"{bot_name}/", DATA_DIR / bot_name)
    logger.info(f"Bot data sync: {count} files downloaded")

    # Note: Claude Agent SDK sessions are stateless (each question spawns a fresh agent),
    # so we don't sync ~/.claude/ to/from S3. Only bot data (transcripts, files) is synced.


def _sync_claude_history_to_s3(s3_client, bucket: str):
    """After an agent call, persist Claude session history back to S3."""
    count = _sync_local_to_s3_prefix(s3_client, bucket, ".claude/", CLAUDE_DIR)
    if count:
        logger.info(f"Synced {count} Claude Agent history files to S3")



def _storage_prefix(bot_name: str, username: str, timestamp: str) -> str:
    """Build the relative path prefix used for both local and S3 storage.

    Returns e.g.: transcribe-bot/2026/02/19/143022_Alice
    """
    now = datetime.datetime.now()
    return f"{bot_name}/{now.strftime('%Y/%m/%d')}/{timestamp}_{username}"


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

    return str(local_path)


def _summarize(transcript_text: str) -> str | None:
    """Summarize a transcript using OpenAI-compatible API. Returns None if unavailable."""
    client = _get_openai_client()
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


async def _chat(user_id: int, message: str, bot_name: str, s3_client=None, s3_bucket: str | None = None, progress_callback=None) -> str | None:
    """Chat with AI. Uses OpenAI tool calling to detect file analysis intent.

    Normal chat → OpenAI-compatible endpoint responds directly.
    File analysis → OpenAI detects intent via tool call → GLM Claude agent analyzes files.
    """
    client = _get_openai_client()
    if not client:
        return None

    model = os.getenv('OPENAI_MODEL', 'gpt-4o-mini')

    if user_id not in _chat_histories:
        _chat_histories[user_id] = []
    history = _chat_histories[user_id]

    history.append({"role": "user", "content": message})

    if len(history) > MAX_HISTORY:
        history[:] = history[-MAX_HISTORY:]

    # Save immediately so the Claude agent can read the latest history from disk
    _save_chat_histories(bot_name, s3_client=s3_client, s3_bucket=s3_bucket)

    try:
        utc_now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
        messages = [
            {"role": "system", "content": (
                f"Current time: {utc_now}\n\n"
                "You are a helpful assistant integrated into a Telegram bot. "
                "You help with meeting notes, transcription questions, and general tasks. "
                "Be concise and conversational. Use markdown formatting when helpful. "
                "When the user asks about their stored files, transcripts, or past meetings, "
                "use the search_stored_files tool to look up and analyze their data."
            )},
            *history
        ]

        # First call — may return a tool call or a direct response
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            tools=_CHAT_TOOLS,
            max_tokens=1024,
        )

        choice = response.choices[0]

        # Direct response — no tool call, normal chat
        if choice.finish_reason != "tool_calls" or not choice.message.tool_calls:
            reply = choice.message.content
            history.append({"role": "assistant", "content": reply})
            return reply

        # Tool call detected
        tool_call = choice.message.tool_calls[0]
        tool_name = tool_call.function.name
        args = json.loads(tool_call.function.arguments)

        if tool_name == "get_current_time":
            utc_time = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
            logger.info(f"Tool call: get_current_time → {utc_time}")
            # Feed tool result back to get a natural language response
            messages.append(choice.message.model_dump())
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": utc_time,
            })
            follow_up = client.chat.completions.create(
                model=model, messages=messages, max_tokens=1024,
            )
            reply = follow_up.choices[0].message.content
            history.append({"role": "assistant", "content": reply})
            return reply

        # search_stored_files — delegate to GLM Claude file agent
        question = args.get("question", message)
        logger.info(f"Intent: file analysis → delegating to GLM Claude agent (question={question!r})")

        if progress_callback:
            await progress_callback("🔍 Searching your files...")
        analysis = await _analyze_with_file_agent(question, bot_name, user_id=user_id, s3_client=s3_client, s3_bucket=s3_bucket, progress_callback=progress_callback)

        if analysis:
            reply = analysis
        else:
            reply = "Sorry, I couldn't analyze your files right now. Please try again."

        history.append({"role": "assistant", "content": reply})
        return reply

    except Exception as e:
        logger.error(f"Chat failed: {e}")
        history.pop()
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

    from server.src.transcription import transcribe_video, create_text_transcript

    # Ensure storage root exists
    DATA_DIR.mkdir(exist_ok=True)

    s3_client, s3_bucket = _get_s3_client()
    bot_name = os.getenv('BOT_NAME', 'transcribe-bot')

    ai_enabled = bool(_get_openai_client())
    if ai_enabled:
        logger.info("AI enabled (OPENAI_API_KEY configured) — chat + summarization active")
    else:
        logger.info("AI disabled (no OPENAI_API_KEY). Chat and summarization unavailable.")

    glm_enabled = bool(os.getenv('GLM_API_KEY'))
    if glm_enabled:
        logger.info("GLM Claude Agent enabled — file analysis via Claude Agent SDK + GLM backend")
    else:
        logger.info("GLM Claude Agent disabled (no GLM_API_KEY). File Q&A unavailable.")

    if s3_client:
        logger.info(f"S3 storage enabled (bucket: {s3_bucket}) — local + S3 sync")
        _sync_from_s3(s3_client, s3_bucket, bot_name)
    else:
        logger.info("S3 storage disabled (no S3_BUCKET). Saving files locally only.")

    # Restore conversation histories from disk (synced from S3 above)
    _load_chat_histories(bot_name)

    # Populate shared state for the dashboard API
    bot_state.started_at = datetime.datetime.now()
    bot_state.bot_name = bot_name
    bot_state.ai_enabled = ai_enabled
    bot_state.glm_enabled = glm_enabled
    bot_state.s3_enabled = bool(s3_client)
    bot_state.s3_bucket = s3_bucket or ""
    bot_state.openai_model = os.getenv('OPENAI_MODEL', 'gpt-4o-mini')
    bot_state.glm_model = os.getenv('GLM_MODEL', '')
    bot_state.anthropic_base_url = os.getenv('ANTHROPIC_BASE_URL', '')

    logger.info(f"Local storage: {DATA_DIR.resolve()}/{bot_name}/")

    async def start(update: Update, context):
        features = [
            "Send me a *voice memo* or *audio/video file* — I'll transcribe it with speaker labels.",
        ]
        if ai_enabled:
            features.append("Send me *text* — I'll chat with you as an AI assistant.")
        features.append("Send me *any other file* — I'll store it for you.")

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
        """Handle text messages → AI chat."""
        msg = update.message
        user = msg.from_user
        text = msg.text.strip()

        if not text:
            return

        logger.info(f"Chat from {user.first_name} ({user.id}): {text[:80]}...")

        if not ai_enabled:
            await msg.reply_text(
                "AI chat is not configured. Send me a voice memo or audio file to transcribe!"
            )
            return

        # Send a thinking message that we'll update with progress
        thinking_msg = await msg.reply_text("Thinking...")

        async def progress_callback(status_text: str):
            try:
                await thinking_msg.edit_text(status_text)
            except Exception:
                pass  # Ignore edit errors (e.g. message unchanged)

        reply = await _chat(user.id, text, bot_name, s3_client=s3_client, s3_bucket=s3_bucket, progress_callback=progress_callback)
        bot_state.chat_count += 1
        bot_state.record_activity()
        # Persist conversation history to disk + S3
        _save_chat_histories(bot_name, s3_client=s3_client, s3_bucket=s3_bucket)
        if reply:
            # Telegram has a 4096 char limit per message
            if len(reply) > 4000:
                reply = reply[:4000] + "\n\n_(truncated)_"
            # Sanitize markdown for Telegram (doesn't support ## headers, tables, ---)
            import re
            tg_reply = re.sub(r'^#{1,6}\s+', '', reply, flags=re.MULTILINE)  # strip headers
            tg_reply = re.sub(r'^\|.*\|$', lambda m: m.group(0).replace('|', ' '), tg_reply, flags=re.MULTILINE)  # strip table pipes
            tg_reply = re.sub(r'^[-]{3,}$', '', tg_reply, flags=re.MULTILINE)  # strip horizontal rules
            try:
                await thinking_msg.edit_text(tg_reply, parse_mode="Markdown")
            except Exception:
                # If markdown parsing fails, send as plain text
                try:
                    await thinking_msg.edit_text(tg_reply)
                except Exception as e:
                    logger.error(f"Failed to send reply: {e}")
                    await thinking_msg.edit_text("Sorry, the response was too complex to display. Please try a more specific question.")
        else:
            await thinking_msg.edit_text("Sorry, I couldn't process that. Please try again.")

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
