# ai-meeting-notes-agent

> A system of record for everything your founding team says out loud.

Startup teams make their most important decisions in conversation — investor calls, customer discovery, co-founder debates, advisor sessions. Code goes in GitHub. Tasks go in Linear. But verbal decisions, customer insights, and midnight ideas? They live nowhere. They were said out loud and they're gone.

This bot is the bridge. Send a voice memo to Telegram, get a transcript back. Then ask questions across everything you've ever recorded: *"What did the investor say about our TAM?"* *"What did we agree on pricing last Tuesday?"* *"What did the customer say was their biggest blocker?"*

Your recordings stop being a graveyard and start being your startup's searchable memory.

## Open source. Self-hosted. Your conversations stay yours.

Your most sensitive recordings — investor negotiations, co-founder disagreements, customer deal terms — should never live on someone else's server. Self-host with your own API keys. Free forever. MIT licensed.

<img width="1327" height="672" alt="Screenshot 2026-02-19 at 12 16 31 PM" src="https://github.com/user-attachments/assets/f7da764c-5df2-4a10-b6d9-7bf2d09c4d9c" />

https://github.com/user-attachments/assets/d9013853-9d44-43d6-b1a4-dfdad1989480

## The Problem

- **Founders talk faster than they write.** Six meetings a day. Decisions made verbally. Customer insights landing in conversation. Context switching kills memory.
- **iPhone Voice Memos is the best recorder.** One tap from the lock screen. Nothing else comes close. But it's a dead end — recordings go in, nothing comes out.
- **Recording apps solve the wrong problem.** Granola, Otter, Fireflies — they replace Voice Memos instead of building on it. And your recordings live on their servers.
- **AI assistants don't know your context.** ChatGPT is powerful, but it can't search last Tuesday's customer call or find what your co-founder said about the pivot.
- **What's missing is the bridge.** Transcription that feeds into an AI agent with memory of every conversation your team has had.

## What It Does

Send anything to the Telegram bot. It figures out what to do.

| You send | Bot does |
|----------|----------|
| Voice memo or audio/video file | Transcribes with speaker labels + timestamps. Long recordings get an AI summary. |
| Text message | AI chat — ask questions, get help, have a conversation. |
| *"What did we discuss yesterday?"* | Searches your stored transcripts and files, answers with context. |
| Any other file (PDF, image, doc...) | Stores it for the AI agent. Ask about it later. |

All files — audio, transcripts, uploads — stored locally and optionally synced to S3. Survives container restarts.

## How It Works

1. **Record** with Apple Voice Memos (or any recorder on your phone)
2. **Share** the recording to Telegram — no new app, no exporting, no emailing yourself
3. **Read** the full transcript with speaker labels and timestamps, right in the chat
4. **Ask** questions across everything you've ever recorded

Works with any language. Handles multiple speakers. Transcripts come back in under a minute.

## Getting Started

### 1. Create a Telegram Bot (2 minutes)

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Pick a name for your bot (e.g., "My Transcriber")
4. Pick a username (e.g., `my_transcriber_bot`)
5. BotFather gives you an API token — copy it

### 2. Run the Bot

```bash
git clone <repo-url> && cd ai-meeting-notes-agent
cp .env.example .env
```

Edit `.env` and fill in your API keys:
```
ASSEMBLY_API_KEY=your_assemblyai_key
TELEGRAM_BOT_TOKEN=your_bot_token
```

Start the bot:
```bash
uv run telegram_bot.py
```

That's it. Send a voice memo to your bot on Telegram and get a transcript back.

### Prerequisites

You need two API keys to get started. Both are free:

| Key | What it's for | Where to get it | Cost |
|-----|--------------|-----------------|------|
| `TELEGRAM_BOT_TOKEN` | Receive and reply to messages | Message [@BotFather](https://t.me/BotFather) on Telegram, send `/newbot` | Free |
| `ASSEMBLY_API_KEY` | Transcription with speaker labels | [assemblyai.com/app/account](https://www.assemblyai.com/app/account) | Free tier included |

### Optional keys (unlock more features)

| Key | What it unlocks |
|-----|----------------|
| `OPENAI_API_KEY` | AI chat + summarization. Works with any OpenAI-compatible API (OpenAI, OpenRouter, DigitalOcean, etc.) |
| `OPENAI_BASE_URL` | Custom endpoint (default: `https://api.openai.com/v1`) |
| `OPENAI_MODEL` | Model for chat + summarization (default: `gpt-4o-mini`) |
| `GLM_API_KEY` | File analysis via [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-python). Ask questions about your stored files. |
| `GLM_MODEL` | Model for file analysis (default: `glm-4-plus`) |
| `ANTHROPIC_BASE_URL` | Anthropic-compatible endpoint (default: `https://api.z.ai/api/anthropic`). Works with Z.AI, Anthropic, or any compatible provider. |
| `S3_BUCKET` | S3 storage sync — all files mirrored to S3, restored on container restart |
| `BOT_NAME` | Storage prefix (default: `transcribe-bot`) |

## Deploy

### Docker (any server)

```bash
docker compose up -d
```

The bot uses polling (no inbound ports needed), so it runs anywhere Docker runs — a $5 VPS, a Raspberry Pi, or your laptop.

### AWS ECS (via GitHub Actions)

Fork this repo, add secrets in GitHub repo settings, and push. It deploys automatically.

**Required secrets:**

| GitHub Secret | Value |
|---------------|-------|
| `AWS_ACCESS_KEY_ID` | Your AWS access key |
| `AWS_SECRET_ACCESS_KEY` | Your AWS secret key |
| `ASSEMBLY_API_KEY` | Your AssemblyAI key |
| `TELEGRAM_BOT_TOKEN` | Your bot token from BotFather |

**Optional secrets (for AI + storage features):**

| GitHub Secret | Value |
|---------------|-------|
| `OPENAI_API_KEY` | OpenAI-compatible API key for chat + summarization |
| `OPENAI_BASE_URL` | Custom endpoint URL |
| `OPENAI_MODEL` | Model name |
| `GLM_API_KEY` | API key for file analysis |
| `GLM_MODEL` | Model name for file analysis |
| `ANTHROPIC_BASE_URL` | Anthropic-compatible endpoint URL |
| `S3_BUCKET` | S3 bucket name for file sync |
| `BOT_NAME` | Storage prefix |

Every push to `main` builds and deploys to ECS Fargate. You can also trigger it manually from the Actions tab.

### Railway (one click)

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/new?repo=your-repo-url)

Set your API keys as environment variables in the Railway dashboard.

### Already have a backlog?

Got a folder full of voice memos you never transcribed? Do them all at once:

```bash
uv run transcribe.py -f /path/to/recordings/
```

## Supported Formats

Voice notes from Telegram, iPhone Voice Memos, and any standard audio/video format: `.m4a`, `.mp3`, `.ogg`, `.wav`, `.mp4`, `.mov`, and more.

## Architecture

- **Telegram bot** (`telegram_bot.py`) — message router: voice to transcription, text to conversation, files to storage
- **Transcription** — AssemblyAI with speaker diarization, auto language detection, multi-format support
- **Conversation** — OpenAI-compatible LLM for chat, summarization, and Q&A
- **Claude Code Agent** — autonomous agent (via Claude Agent SDK) that reads your stored files and answers questions with full context
- **Storage** — unified `data/{bot_name}/YYYY/MM/DD/` structure, identical paths locally and on S3
- **S3 sync** — bidirectional: pulls from S3 on startup, pushes after every write
- **Web dashboard** — React dashboard showing module status, deployment info, and live configuration

## What's Next

- **Team workspaces** — shared memory across your founding team
- **Cross-conversation search** — "What have customers said about pricing?" across every recording
- **Calendar integration** — auto-match recordings to meetings
- **Personalized notes** — each participant gets notes relevant to them

## Technical Details

See [TECHNICAL.md](TECHNICAL.md) for detailed architecture, configuration, Google Drive watcher, and deployment instructions.
