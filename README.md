# ai-meeting-notes-agent

> I kept losing decisions my co-founder and I made in conversation. So I built this.

My co-founder and I argued for 20 minutes about what we agreed on in a meeting. We were both there. We both remembered it differently. Nobody wrote it down.

This happens constantly at early-stage startups. Six meetings a day — investors, customers, advisors, co-founder syncs. The most important decisions are made out loud. Code goes in GitHub. Tasks go in Linear. But verbal decisions? Customer insights from discovery calls? That idea you voice-memo'd yourself at midnight? There's no system of record for any of it.

**So I built one.** A Telegram bot — record a voice memo, send it, get a transcript back with speaker labels. Then ask it questions across every conversation you've ever recorded: *"What did we agree on pricing?"* *"What did the customer say about onboarding?"* *"What did the investor say about our TAM?"*

I open-sourced it because I think builders should show their work, not just talk about AI. This is production code my team actually uses.

## Self-hosted. Your conversations stay yours.

Your most sensitive recordings — investor negotiations, co-founder disagreements, customer deal terms — should never live on someone else's server. Self-host with your own API keys. Free forever. MIT licensed.

<img width="1327" height="672" alt="Screenshot 2026-02-19 at 12 16 31 PM" src="https://github.com/user-attachments/assets/f7da764c-5df2-4a10-b6d9-7bf2d09c4d9c" />

https://github.com/user-attachments/assets/d9013853-9d44-43d6-b1a4-dfdad1989480

## Why I Built This

- **I kept losing decisions.** My co-founder and I would agree on something in a call. A week later, neither of us remembered the details. Nobody wrote it down.
- **Customer insights vanished.** We'd do 8 discovery calls in a week. By Friday, I couldn't remember which customer said what about onboarding vs. pricing.
- **Voice memos were a dead end.** iPhone Voice Memos is the best recorder ever made — one tap from the lock screen. But I had hundreds of recordings I'd never listen to again.
- **Recording apps solve the wrong problem.** Granola, Otter, Fireflies — they want you to download their app, and your recordings live on their servers. I'm a CTO. I don't buy SaaS tools when I can build them.
- **What was missing was the bridge.** Transcription that feeds into an AI agent with memory of every conversation my team has had.

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

## Built By

I'm a startup CTO building AI for healthcare at [PeakMojo](https://peakmojo.com). I solve real problems with AI and I build in the open. This is one of several internal tools I've open-sourced — if you're a founder who ships, star the repo or just steal the code. That's what open source is for.

## Technical Details

See [TECHNICAL.md](TECHNICAL.md) for detailed architecture, configuration, Google Drive watcher, and deployment instructions.
