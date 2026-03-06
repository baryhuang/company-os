# CLAUDE.md

## Project Overview

Telegram voice memo transcription bot with a Decision Atlas web dashboard. Users send voice memos or files via Telegram, the bot transcribes with AssemblyAI (speaker diarization, auto language detection), and optionally syncs to S3. Text messages are saved as notes. The React + Bun frontend renders the Decision Atlas (markmap overview, D3 tree views, competitor analysis, executive report).

## Key Commands

```bash
# Run bot + dashboard (port 8080)
uv run server/telegram_bot.py

# Manual transcription (standalone CLI, stays in root)
source .venv/bin/activate
python transcribe.py -i recording.m4a
python transcribe.py -f /path/to/recordings/
python transcribe.py -i recording.m4a --force-overwrite

# Drive watcher (standalone daemon, stays in root)
python drive_watcher.py              # daemon mode
python drive_watcher.py --dry-run    # list unprocessed files

# Frontend dev
cd web && bun install && bun run dev  # dashboard on :5173, proxies /api to :8080

# Frontend build
cd web && bun run build               # outputs to web/dist/

# Docker
docker compose up --build             # bot + dashboard on :8080

# Atlas data sync (requires INSFORGE_API_KEY)
bun scripts/sync-atlas-to-db.ts           # sync git-dirty files (auto-snapshots first)
bun scripts/sync-atlas-to-db.ts --all     # force sync all files
bun scripts/sync-atlas-to-db.ts market moat  # sync specific keys

# Atlas snapshots (requires INSFORGE_API_KEY)
bun scripts/snapshot-atlas.ts                          # create snapshot for __default__
bun scripts/snapshot-atlas.ts --label "before rewrite" # create with custom label
bun scripts/snapshot-atlas.ts --list                   # list recent snapshots
bun scripts/snapshot-atlas.ts --restore <id>           # restore from snapshot
bun scripts/snapshot-atlas.ts --prune --keep 20        # delete old, keep latest 20

# Server setup (Linux)
chmod +x setup_server.sh && ./setup_server.sh
```

## Architecture

### Server (`server/`)
- `server/telegram_bot.py` — Main entry point: Telegram bot + FastAPI on port 8080
- `server/api_server.py` — FastAPI app (`/api/status`, `/api/health`, `/api/atlas/*`, SPA serving)
- `server/bot_state.py` — Shared state singleton (module status, counters, errors)
- `server/src/transcription/transcriber.py` — AssemblyAI integration, speaker diarization, transcript caching
- `server/src/models/transcription.py` — TranscriptionSegment data class

### Web (`web/`) — React + Vite + Bun
- `web/src/App.tsx` — Main app with view state machine (overview, d3, competitor, executive-report)
- `web/src/hooks/useAtlasData.ts` — Data fetching hook for atlas dimensions + JSON data
- `web/src/components/MarkmapView.tsx` — Markmap mindmap overview
- `web/src/components/D3TreeView.tsx` — D3 tree renderer for individual dimensions
- `web/src/components/CompetitorView.tsx` — Competitor evolution stage view
- `web/src/components/ExecutiveReport.tsx` — 13-slide executive report deck
- `web/src/components/Sidebar.tsx` — Navigation sidebar
- `web/src/components/TopBar.tsx` — Title bar with level buttons
- `web/vite.config.ts` — Proxy `/api` to `:8080` in dev mode

### Atlas Data (`data/reports/data/`)
- `dimensions.json` — Metadata for all 8 decision dimensions
- `market.json`, `product.json`, etc. — Tree data for each dimension
- `competitor.json` — Competitive landscape evolution stages

### Scripts (`scripts/`)
- `scripts/sync-atlas-to-db.ts` — Diff-based sync of local JSON files to DB (auto-snapshots before sync)
- `scripts/snapshot-atlas.ts` — Atlas data versioning: create, list, restore, prune snapshots
- `scripts/migrate-atlas-to-nodes.ts` — One-time migration to flat node schema
- `scripts/lib/flatten-tree.ts` — Shared tree flatten/assemble utilities, `AtlasNodeRow` type
- `scripts/rclone-sync.sh` — Pull files from / push transcripts to Google Drive

### Root (standalone tools)
- `transcribe.py` — CLI entry point, handles language detection and file discovery
- `drive_watcher.py` — Daemon polling local inbox dir, calls transcribe for new files
- `systemd/` — Service files for Linux deployment

## API Endpoints

- `GET /api/health` — Health check
- `GET /api/status` — Bot status, counters, deployment info
- `GET /api/atlas/dimensions` — Atlas dimensions metadata
- `GET /api/atlas/data/{name}` — Atlas dimension data (e.g., market, product, competitor)
- `PUT /api/atlas/data/{name}` — Update atlas dimension data

## API Dependencies

- `ASSEMBLY_API_KEY` — AssemblyAI for transcription with speaker diarization
- `TELEGRAM_BOT_TOKEN` — Telegram Bot API
- `OPENAI_API_KEY` (optional) — Summarization
- `S3_BUCKET` (optional) — S3 sync for file storage
- `ATLAS_DATA_DIR` (optional) — Override atlas data directory (defaults to `data/reports/data/`)

## Database Tables (InsForge/Postgres)

- `atlas_documents` — JSONB blobs for non-tree data (dimensions, competitor), keyed by `(user_id, doc_key)`
- `atlas_nodes` — Flat per-node rows for tree dimensions, keyed by `(user_id, dimension, path)`
- `atlas_snapshots` — Point-in-time backups of all documents + nodes for a user. Auto-created before each sync, can be manually created/restored/pruned via `scripts/snapshot-atlas.ts`

## Language Detection

Cascading: explicit `--language-code` > filename suffix (`_en`, `_zh`) > AssemblyAI auto-detection
