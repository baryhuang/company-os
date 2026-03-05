# Technical Documentation

## Architecture

### Telegram Bot Flow

```
iPhone -> Send voice memo on Telegram -> Telegram Bot API (polling)
                                                  |
                                          telegram_bot.py
                                                  |
                            download .ogg -> convert to WAV -> AssemblyAI
                                                  |
                                    transcript reply in Telegram
```

### Google Drive Watcher Flow

```
iPhone Voice Memo -> Share to Google Drive shared folder
                              |
        Linux cron: rclone copy (pull new files every 60s)
                              |
                    /srv/transcribe/inbox/
                              |
            drive_watcher.py (polling local dir)
                              |
            transcribe -> .transcript.json + .transcript.txt
                              |
        Linux cron: rclone copy (push results back to Drive)
```

## Project Structure

```
transcribe.py           # CLI entry point for manual transcription
telegram_bot.py         # Telegram voice memo bot
drive_watcher.py        # Daemon that watches inbox for new files
src/
  transcription/
    transcriber.py      # AssemblyAI integration, speaker diarization
  models/
    transcription.py    # TranscriptionSegment data class
data/reports/data/      # Atlas JSON files (local source of truth)
  dimensions.json       # Metadata for all decision dimensions
  market.json           # Tree data per dimension (market, product, etc.)
  competitor.json       # Competitive landscape evolution stages
  ...                   # 14 JSON files total
web/                    # React + Vite + Bun frontend (Decision Atlas)
  src/api.ts            # Data layer: local files (dev) / database (prod)
  src/insforge.ts       # InsForge SDK client
  vite.config.ts        # Serves /data/ from local JSON in dev mode
scripts/
  sync-atlas-to-db.ts   # Sync changed JSON files to InsForge database
  rclone-sync.sh        # Pull from / push to Google Drive
Dockerfile              # Container image
docker-compose.yml      # One-command self-hosting
railway.toml            # Railway PaaS config
.github/workflows/
  deploy-ecs.yml        # GitHub Actions -> AWS ECS Fargate
systemd/                # Linux service files
setup_server.sh         # One-command server setup (Google Drive)
```

## Configuration

Copy `.env.example` to `.env` and fill in:

```
# Required
ASSEMBLY_API_KEY=your_key_here

# Telegram bot
TELEGRAM_BOT_TOKEN=your_bot_token

# Google Drive watcher
RCLONE_REMOTE=gdrive
GDRIVE_FOLDER=VoiceMemos
LOCAL_INBOX_DIR=/srv/transcribe/inbox
```

## Language Detection

Cascading strategy:

1. **Explicit flag**: `--language-code en`
2. **Filename suffix**: `meeting_en.m4a` -> detected as English
3. **Auto-detect**: AssemblyAI automatic language detection (99 languages)

## CLI Reference

```bash
# Single file
uv run transcribe.py -i recording.m4a

# Folder of files
uv run transcribe.py -f /path/to/recordings/

# Force re-transcription
uv run transcribe.py -i recording.m4a --force-overwrite

# Drive watcher daemon
uv run drive_watcher.py

# Dry run (list unprocessed files)
uv run drive_watcher.py --dry-run

# Telegram bot
uv run telegram_bot.py
```

## Google Drive Watcher Setup

### Prerequisites

- Linux server
- rclone configured with Google Drive remote

### Steps

```bash
chmod +x setup_server.sh && ./setup_server.sh
```

The setup script installs dependencies, opens browser for Google auth, configures `.env`, and installs systemd services.

### Service Management

```bash
sudo systemctl start drive-watcher rclone-sync.timer
systemctl status drive-watcher rclone-sync.timer
journalctl -u drive-watcher -f
```

## Deployment

### Docker Compose (simplest)

```bash
docker compose up -d
```

Works on any machine with Docker — a $5 VPS, Raspberry Pi, or your laptop. The bot uses polling (no inbound ports needed).

### Railway (one-click PaaS)

Click "Deploy on Railway" from the README, set your env vars in the dashboard, done.

### AWS ECS Fargate (via GitHub Actions)

Fork the repo, add these GitHub secrets, and push to `main`:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `ASSEMBLY_API_KEY`
- `TELEGRAM_BOT_TOKEN`

The workflow at `.github/workflows/deploy-ecs.yml` handles everything: ECR repo, ECS cluster, task definition, Fargate service. Estimated cost: ~$3-5/month.

### Any Docker host

The only requirement is outbound internet access (Telegram API + AssemblyAI). No inbound ports, no load balancer, no SSL certificate needed.

## Decision Atlas Data Layer

### Architecture

Atlas data lives in two places:

- **Local JSON files** (`data/reports/data/*.json`) — source of truth, edited directly
- **InsForge database** (`atlas_documents` table) — serves production frontend

```
data/reports/data/*.json  (edit here)
        |
        |  bun scripts/sync-atlas-to-db.ts
        v
atlas_documents table (user_id='__default__', doc_key, data JSONB)
        |
        |  web/src/api.ts (dbSelect with __default__ fallback)
        v
Production frontend at https://gx2m4dge.insforge.site
```

### Database Schema

```sql
CREATE TABLE atlas_documents (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  doc_key TEXT NOT NULL,           -- e.g. "dimensions", "market", "competitor"
  data JSONB NOT NULL,             -- full JSON content
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, doc_key)
);
```

14 doc_keys: `bizmodel`, `competitor`, `data`, `dimensions`, `gtm`, `market`, `messaging`, `moat`, `network`, `org`, `people`, `product`, `sales`, `validation`.

### Dev vs Production

- **Dev** (`bun run dev`): `api.ts` fetches from `/data/*.json` served by Vite plugin directly from `data/reports/data/`. No database needed.
- **Production**: `api.ts` queries `atlas_documents` via InsForge SDK. Falls back to `user_id='__default__'` rows if no user-specific data exists.

### Syncing JSON to Database

After editing local JSON files, sync changes to the production database:

```bash
# Auto-detect changed files via git diff
INSFORGE_API_KEY=xxx bun scripts/sync-atlas-to-db.ts

# Sync specific files by name
INSFORGE_API_KEY=xxx bun scripts/sync-atlas-to-db.ts market moat people

# Force sync all 14 files
INSFORGE_API_KEY=xxx bun scripts/sync-atlas-to-db.ts --all
```

The script uses PostgREST upsert (`Prefer: resolution=merge-duplicates`) so it's safe to run repeatedly — changed rows are updated, unchanged rows are left alone.

### Build and Deploy

```bash
cd web && bun run build                    # build frontend
# Then deploy via InsForge MCP tool: create-deployment with sourceDirectory=web/
```

## API Dependencies

- **AssemblyAI** — transcription with speaker diarization (`ASSEMBLY_API_KEY`)
- **Telegram Bot API** — receive/send messages (free, unlimited)
- **InsForge** — database + hosting for Decision Atlas (`INSFORGE_API_KEY`, `VITE_INSFORGE_BASE_URL`, `VITE_INSFORGE_ANON_KEY`)
