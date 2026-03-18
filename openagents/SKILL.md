---
name: company-brain
description: >
  Company operating system — turns raw meeting transcripts into a structured day-by-day
  founder journey across strategic dimensions, then drives operational follow-through via Linear.
  Use this skill whenever the user asks to: process transcripts ("处理 XX-XX"), update dimension/journey
  files, create or update Linear tasks from meeting insights, review what happened on a specific date,
  or anything involving the intersection of transcripts, dimension JSON files, and operational planning.
  Also trigger when the user mentions specific dimensions (market, product, bizmodel, gtm, validation,
  okr, kpi, strategic partners, vision, etc.) in context of meetings or company strategy. This skill is the ONLY way to process transcripts
  and manage the founder journey — always use it, even if the task seems simple.
---

# Founder Journey Operating System

Your company brain. Every meeting gets recorded and transcribed. This skill turns those raw transcripts into a structured, searchable, day-by-day founder journey — and then drives operational follow-through.

The system has three layers:

1. **Record** — Process transcripts into 16 dimension JSON files (the structured journey)
2. **Reflect** — The dimension trees become a queryable strategic memory (UI renders them as interactive timelines)
3. **Act** — Insights and decisions from transcripts become Linear tasks that drive operations

## Company Context

Add your company context here. Include:
- Company name, stage, and active business lines
- Critical rules about what content to include/exclude
- Core team members with their roles, transcript labels, and notes
- Speaker identification tips for common meeting patterns

## Architecture

### File Locations

In the Cowork workspace, files are organized into two directories (synced from S3):

| What | Workspace Path | S3 Source |
|------|---------------|-----------|
| Transcripts root (`$TRANSCRIPTS`) | `meetings/` | `s3://notesly-transcripts/by-dates/` |
| Dimension files (`$BRAIN`) | `company-os/` | `s3://notesly-transcripts/Company Brain/` |

| What | Relative to |
|------|-------------|
| Transcripts per day | `$TRANSCRIPTS/YYYY-MM-DD/` — `.vtt` or `.transcript.txt` per meeting |
| Dimension trees | `$BRAIN/<dimension>/` — each dimension is a directory |
| Dimension index | `$BRAIN/<dimension>/_index.md` — lightweight tree outline |
| Node detail files | `$BRAIN/<dimension>/<node-slug>.md` — full node content |
| Transcript archive | Spans 2025-09-09 to present |

### The 16 Dimensions

Each dimension is a **directory** containing an `_index.md` (the tree outline) and individual `.md` files for nodes with substantial content. Together they form the complete founder journey.

```
$BRAIN/
  market/
    _index.md
    target-segment-analysis.md
  product/
    _index.md
    product-roadmap.md
  validation/
    _index.md
    pivot-decisions.md
    ...
  ...
```

| Dimension directory | What it tracks |
|---------------------|---------------|
| `market/` | 市场选择 — target market, ICP, TAM/SAM, industry focus shifts |
| `product/` | 产品范围 — product features, roadmap, IP structure, philosophy |
| `bizmodel/` | 商业模式 — revenue models, pricing, unit economics, "default alive" strategy |
| `org/` | 组织结构 — forprofit/nonprofit hybrid structure, legal entities |
| `gtm/` | 销售与获客 — sales activity, BD strategy, channels, partner model |
| `messaging/` | 对外定位 — pitch evolution, Techstars coaching sessions, positioning narrative |
| `moat/` | 护城河 — competitive analysis, defensibility, why us |
| `people-network/` | 团队与人脉 — team members, advisors, morale, role shifts, Techstars mentors/alumni, field contacts, facility relationships, partnership intros |
| `validation/` | 验证与转型 — demand signals, three key pivots (Sales→Healthcare, Student→Facility payer, CNA→Full Workforce), PMF evidence, field research |
| `data/` | 数据资产 — data collection strategy, datasets (violation citations, curriculum), content pipeline |
| `build/` | 产品建设进度 — what's built, what's in progress, distance to customer-ready |
| `human_ai_teaming/` | Human-AI协作分工 — human vs AI vs robotics role division, care enablement layer |
| `strategic-partners/` | 战略合作伙伴 — key partnerships, partnership terms, joint initiatives |
| `okr_kpi/` | OKR与KPI — objectives and key results, metrics tracking, milestones, success criteria |
| `vision_execution_map/` | 愿景执行路线图 — high-level vision to execution mapping, strategic alignment, phase transitions |
| `progress/` | 产品建设进度追踪 — ISO dates, owner/supervisor fields, build progress by person |

### Special Files

| File | Notes |
|------|-------|
| `$BRAIN/dimensions.json` | UI config — do NOT edit |
| `$BRAIN/landscape.json` | Competitive landscape structure |
| `$BRAIN/competitor.json` | Competitor details |
| `$BRAIN/seed_atlas_documents.json` | Array of document references |

**Known overlap**: `build/` and `product/` have overlapping content. `build/` = "what's built, build status." `product/` = "product vision, features, strategy." Check both before editing either.

### Two-Layer Storage

The filesystem tree has two layers. This design leverages Claude's strongest operating mode — navigating directories, reading files, editing files — instead of surgical edits inside large JSON blobs.

**Layer 1: `_index.md`** — The tree outline for one dimension. Lightweight (a few KB). Contains all nodes in a nested Markdown list with inline metadata. Load this first to understand the dimension's structure.

Format:
```markdown
# market

- **Target Market A** | date: Mar 12 | status: chosen
  - **Site Visit Discovery** | date: Feb 17 | status: chosen
- **Original ICP** | date: Feb 23 | status: abandoned
  - **New Market Pivot** | date: Feb 24 | status: chosen
```

Each line: `- **Node Name** | date: <MMM DD or YYYY-MM-DD> | status: <status>`
Nesting = indentation (2 spaces per level). Nodes with detail files add: `| file: <slug>.md`

**Layer 2: `<slug>.md`** — Full node content for nodes with substantial detail. One file per "heavy" node (those with rich desc, quotes, or deep children). Not every node needs its own file — lightweight nodes live entirely in the `_index.md` line.

Format:
```markdown
# Site Visit — [Location]

- **date**: Feb 17
- **status**: chosen
- **verified**: true

## desc

Visited 4 sites. Key findings per site with specific numbers, names, and actionable insights...

## quotes

- "Speaker A (Feb 17): Direct quote with specific details..."
- "Speaker A (Feb 17): Another quote capturing a key insight..."

## children

- **Site A Discovery** | date: Feb 17 | status: chosen
  Key facts: size, ownership type, turnover rate, needs
- **Site B Discovery** | date: Feb 17 | status: chosen
  Key facts: size, staffing challenges, training needs
```

### Field Rules

**Node names** — Short, descriptive, searchable. Use the original language from the transcript — if the discussion was in Chinese, write the name in Chinese; if English, write in English. The team naturally mixes languages, so follow their lead. Examples: `"定价策略内部讨论"`, `"Bay Area Facility走访"`, `"Three-Phase Roadmap"`.

**Slug** — The filename for a detail file. Derived from the node name: lowercase, hyphens for spaces, no special chars. E.g., `"Bay Area Site Visit"` → `bay-area-site-visit.md`.

**date** — Only two formats allowed: `"MMM DD"` (e.g. `"Mar 12"`) or `"YYYY-MM-DD"` (e.g. `"2026-03-12"`). No other text allowed in the date field — the UI's `parseDateOrdinal` only understands these two formats.
- No extra text: `"Mar 12 内部讨论"` → date: `"Mar 12"`, move "内部讨论" to desc opening in parentheses: `"(内部讨论) ..."`
- Multiple dates / ranges: take the latest one. `"Feb 17 - Mar 12"` → `"Mar 12"`
- Pure year `"2019"` → `"2019-01-01"` (ISO format)
- Year range `"2012-2013"` → `"2013-01-01"` (take end year)
- No date available (e.g. `"undisclosed"`) → `""` (empty string), move explanation to desc

**status** — One of: `origin` (root), `chosen` (active), `abandoned` (dropped — capture WHY), `partial` (exploring), `final` (crystallized), `excluded` (ruled out).

**desc** — Maximum information density. Use the original language from the transcript — Chinese transcript → Chinese desc, English → English. Include: specific numbers, names, decisions, disagreements. This is NOT a summary paragraph — it's a compressed knowledge node.

**quotes** — Direct from transcripts. Format: `"Speaker (Date context): quote text"`. Preserve original language. Select quotes with signal: decisions, numbers, disagreements, insights, memorable framings.

**verified** — `true` when content comes directly from transcripts you read.

### When to create a detail file vs keep inline

Create a `<slug>.md` when a node has: 3+ quotes, a desc longer than ~200 chars, or 2+ levels of children. Otherwise, keep the node as a single line in `_index.md` — no need to create a file for every small node.

### Operations

**Adding a node**: Add a line to `_index.md` at the right indent level. If it's a heavy node, also create `<slug>.md` and add `| file: <slug>.md` to the index line.

**Editing a node**: Open the detail `.md` file directly and edit. No more searching through large JSON.

**Reading a dimension**: `cat $BRAIN/market/_index.md` to see the full tree. `cat $BRAIN/market/site-visit-notes.md` to dive into a specific node.

**Listing all dimensions**: `ls $BRAIN/` — each directory is a dimension.

## Layer 1: Processing Transcripts (Record)

### The 10 Commandments

1. **Process day by day.** Only the date(s) specified. "处理 02-17" = ONLY Feb 17. Never mix dates.

2. **Don't skip any transcript.** Read ALL files in the day's folder. Even 31-line no-shows. Even short prep calls.

3. **ALL business content gets included.** Every product line matters equally. 不要省略任何商业内容.

4. **Work on dimension directories only.** Edit `_index.md` and node `.md` files inside `$BRAIN/<dimension>/`. Don't touch `dimensions.json` or `seed_atlas_documents.json`.

5. **Every node needs a date.** UI renders as timeline. Dateless = useless.

6. **Use original language from the transcript.** 中文transcript → 中文 name/desc. English transcript → English name/desc. Mixed-language transcripts → preserve the original language for each piece of content as-is. Never translate Chinese to English or vice versa — the JSON nodes should read like the source material.

7. **Don't exceed the transcript day.** No future-referencing content.

8. **Never delete nodes or details.** Only add or extend. If a later meeting contradicts, add a NEW node — don't edit the old one. Node counts only go up.

9. **Owner attribution follows transcript.** Quote who actually spoke.

10. **Date format consistency.** Only `"MMM DD"` or `"YYYY-MM-DD"`. No extra text in date field — move descriptions to desc in parentheses.

### Content → Dimension Mapping

A single transcript often touches 3-7 dimensions. A single topic can hit multiple dimensions.

| Content Type | Primary Dimension(s) | Also Consider |
|---|---|---|
| Pricing discussions | `bizmodel.json`, `gtm.json` | `validation.json` if customer reacts |
| Product features / demos | `product.json` | `build.json` for status |
| Sales activity / demos | `gtm.json` | `validation.json`, `product.json`, `bizmodel.json`, `people-network.json` |
| Customer/market validation | `validation.json` | `market.json` for ICP shifts |
| Field visits / site visits | `validation.json`, `people-network.json` | `market.json` |
| New contacts / relationships | `people-network.json` | — |
| Team dynamics / morale | `people-network.json` | — |
| Competitive intel | `moat.json` | `market.json` |
| Data/content pipeline | `data.json` | `build.json` |
| Build progress | `build.json` | `product.json`, `progress.json` |
| Market sizing / ICP shifts | `market.json` | `validation.json` |
| Pitch / narrative | `messaging.json` | — |
| Org / entity decisions | `org.json` | — |
| Human vs AI division | `human_ai_teaming.json` | `product.json` |
| Strategy crystallization | `validation.json` | the dimension being crystallized |
| Advisor feedback | relevant dimension(s) | `people-network.json`, `validation.json` |
| Techstars sessions | `messaging.json`, `validation.json` | depends on content |
| Partnership discussions | `strategic-partners.json` | `people-network.json`, `gtm.json` |
| Goals / metrics / OKRs | `okr_kpi.json` | `build.json`, `progress.json` |
| Vision / strategy alignment | `vision_execution_map.json` | `validation.json` |

### Meeting Type Patterns

**No-show meetings** — Still note: `"desc": "No-show meeting. Holiday/Lunar New Year. No substantive content."`

**Recap/debrief meetings** — Extremely rich. Someone reporting back from field. Probing questions in these often yield the deepest insights. Treat as primary source.

**External sales demos** — Map to 4-5 dimensions: gtm + product + validation + bizmodel + people-network. These are gold mines.

**Internal prep meetings** — Contains the team's internal reasoning and disagreements that don't appear in the external meeting. Capture the thinking, not just the conclusion.

**Internal strategy sessions** — Look for crystallization: `partial` → `chosen`, `chosen` → `final`. These status transitions are the most valuable nodes.

**Advisor sessions** — Domain expertise + external validation. Advisor quotes carry weight as evidence.

### Processing Workflow

**Step 1**: List and read ALL transcripts for the day.

**Step 2**: Analyze — identify speakers, topics, affected dimensions, key quotes. Mental map: "This transcript touches gtm, product, bizmodel, validation."

**Step 3**: Read `_index.md` of affected dimensions BEFORE editing. `cat $BRAIN/market/_index.md` etc. Critical to avoid duplicates and understand where new nodes belong.

**Step 4**: Edit dimensions. Add lines to `_index.md` → create `<slug>.md` for heavy nodes → update parent dates if needed.

**Step 5**: Validate modified dimensions:
```bash
cd "$BRAIN"
for dim in <modified dimensions>; do
  echo "=== $dim ==="
  # Count nodes in _index.md (each "- **" line is a node)
  nodes=$(grep -c '^\s*- \*\*' "$dim/_index.md" 2>/dev/null || echo 0)
  # Count detail files
  details=$(ls "$dim"/*.md 2>/dev/null | grep -v _index.md | wc -l)
  # Max depth (indentation levels)
  maxd=$(grep '^\s*- \*\*' "$dim/_index.md" | sed 's/[^ ].*//' | awk '{print length/2}' | sort -rn | head -1)
  echo "  Nodes: $nodes, Detail files: $details, Max depth: $maxd"
done
```

**Step 6**: Report — transcripts processed, files updated (with node counts), key content summary.

**Step 7** (NEW): Create or update `.processing-log.json`.
- First-time: Create full log with all files
- Re-processing: Merge new/changed file entries into existing log, update `last_processed` timestamp
- Include `dimensions_updated` array with before/after node counts

### Processing Log (增量处理机制)

每个日期文件夹中保存 `.processing-log.json`，记录已处理文件的状态。每次处理时先检查log，只处理新增或变化的文件。

**Log Schema**:
```json
{
  "date": "2026-03-13",
  "last_processed": "2026-03-12T23:30:00Z",
  "processor_notes": "3 files: 1 transcript + 2 notes. Main content summary.",
  "files": {
    "transcribe-bot_2026_03_13_025026_489_Risen_transcript.txt": {
      "size": 6151,
      "md5": "81d7e9fabce5c42479fb91337186a985",
      "status": "processed",
      "summary": "One-line content summary"
    }
  },
  "dimensions_updated": [
    {"file": "build.json", "nodes_before": 35, "nodes_after": 37, "changes": "+WABON node description"}
  ]
}
```

**File Entry Fields**:

| Field | Description |
|-------|-------------|
| `size` | File size in bytes |
| `md5` | MD5 checksum of file content (用于检测文件是否被修改) |
| `status` | `processed` / `skipped` (skipped = could not read or trivial) |
| `summary` | One-line content summary for quick reference |

**Processing Workflow (Updated)**:

**Step 0** (NEW): Check for `.processing-log.json` in the day's folder.
- If log exists: Run diff script to compare current files vs log. Only read/process files that are:
  - New: filename not in log
  - Changed: same filename but different `md5`
  - Previously skipped: `status: "skipped"` (retry)
- If no log exists: This is first-time processing. Process all files, then create log.

**Diff script**:
```bash
cd "$TRANSCRIPTS/YYYY-MM-DD/"  # the mounted By Dates path
python3 << 'PYEOF'
import json, hashlib, os

log_path = ".processing-log.json"
with open(log_path) as f:
    log = json.load(f)

logged_files = log["files"]
current_files = {}
for fn in os.listdir("."):
    if fn.endswith("_transcript.txt") or fn.endswith("_note.txt"):
        size = os.path.getsize(fn)
        md5 = hashlib.md5(open(fn, "rb").read()).hexdigest()
        current_files[fn] = {"size": size, "md5": md5}

new_files = [(fn, current_files[fn]["size"]) for fn in sorted(current_files) if fn not in logged_files]
changed_files = [(fn, logged_files[fn]["size"], current_files[fn]["size"]) for fn in sorted(current_files) if fn in logged_files and current_files[fn]["md5"] != logged_files[fn]["md5"]]

print(f"Total current: {len(current_files)}, Logged: {len(logged_files)}")
if new_files:
    print("NEW FILES:")
    for fn, size in new_files:
        print(f"  + {fn} ({size} bytes)")
else:
    print("No new files.")
if changed_files:
    print("CHANGED FILES:")
    for fn, old_size, new_size in changed_files:
        print(f"  ~ {fn} ({old_size} → {new_size} bytes)")
else:
    print("No changed files.")
PYEOF
```

**Log Rules**:
1. Log file lives in the day's folder: `$TRANSCRIPTS/YYYY-MM-DD/.processing-log.json`
2. Dot-prefix: `.processing-log.json` (hidden file, won't interfere with transcript listing)
3. Never delete log entries: Only add or update. If a file was processed before, keep its entry even when re-checking.
4. md5 is the source of truth: File size alone is not reliable — use md5 to detect content changes.
5. Update log AFTER successful processing: Don't write the log entry until the file has been fully processed and dimension files validated.

## Layer 2: Strategic Memory (Reflect)

The dimension files aren't just a log — they're the company's queryable strategic memory. Useful for:

- **"What did we decide about X?"** — Search across dimensions for the topic, trace the decision journey from `partial` → `chosen` → `final` (or `abandoned`)
- **"When did we pivot?"** — `validation/` tracks key pivots with dates and rationale
- **"Who said what about pricing?"** — Quotes with speaker attribution are searchable evidence
- **"What's the current state of our product?"** — `build/` + `progress/` show what's built vs planned
- **"Prepare for a meeting with X"** — Pull relevant context from `$BRAIN/people-network/`, previous interaction history

## Layer 3: Operations (Act)

Transcripts contain action items, decisions, and commitments. These need to flow into Linear to drive execution.

### Linear Integration

Use the Linear MCP tools to create and manage tasks. Key rules:

- **Use original words as much as possible** — don't auto-expand or rephrase the user's language when creating Linear tasks. Preserve the original phrasing from the transcript.
- **Link back to the journey** — when a Linear task comes from a transcript insight, note the date and context in the description
- **Team**: Identify the correct Linear team before creating issues (use `list_teams` if unsure)
- **Assignee**: Map transcript owners to Linear users (use `list_users` or `get_user`)

### Common Linear Operations

**Creating tasks from transcripts**: When processing reveals action items, decisions, or commitments, create Linear tasks preserving the original phrasing.

**Updating task status**: When a transcript shows progress on an existing task, update the Linear issue.

**Linking related work**: Use `relatedTo`, `blocks`, `blockedBy` to connect related Linear issues.

## Quality Examples

### Good node

A good node is dense with specifics (numbers, names, key findings). Quotes are attributed. Multiple data points. Not a summary — a compressed field report. Example structure:

```json
{
  "name": "Site Visit — [Location]",
  "date": "Feb 17",
  "status": "chosen",
  "desc": "Visited 4 sites. Key findings per site with specific numbers, names, ownership types, and actionable insights.",
  "quotes": [
    "Speaker (Date): Direct quote with specific details...",
    "Speaker (Date): Another quote capturing a key insight..."
  ],
  "verified": true
}
```

### Anti-patterns

- **Vague desc**: `"Team discussed pricing"` — WHERE are the numbers? WHO said what?
- **Skipping content**: Demos from one product line skipped as "not the main direction" — WRONG. All business content.
- **Over-summarizing**: Specific numbers compressed into `"discussed pricing"`
- **Missing quotes**: Notable statements without capture = lost evidence
- **Wrong dimension**: Pricing only in `product.json` instead of `bizmodel.json` + `gtm.json`

## Processing History

Tracks which dates have been processed to avoid re-processing. Check `.processing-log.json` files in each date folder.

Node counts only go up. Decrease = something went wrong.

## Troubleshooting

**Edit tool "string not found"** — File modified by linter/user since last read. Use `Grep` to find actual text, re-read, then edit.

**Linter/user modifications** — System reminders noting file changes are INTENTIONAL. Don't revert. Read current state and work from there.

**Long transcripts (1000+ lines)** — Read in full. Don't truncate. Long transcripts are often the richest.

**Ambiguous speakers** — Cross-reference meeting title + context. When truly ambiguous, note uncertainty.

**Content already exists** — Check before adding. If already captured from another date, add date-specific detail to existing node rather than duplicate.
