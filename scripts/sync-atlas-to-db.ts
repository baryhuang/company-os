#!/usr/bin/env bun
/**
 * Diff-based sync of atlas JSON files to the database.
 * Flattens trees into per-node rows, compares with existing DB rows,
 * and only INSERTs, UPDATEs, or DELETEs changed nodes.
 *
 * Also syncs non-tree documents (dimensions, competitor) to atlas_documents.
 *
 * Usage:
 *   bun scripts/sync-atlas-to-db.ts           # sync git-dirty files only
 *   bun scripts/sync-atlas-to-db.ts --all     # force sync all files
 *   bun scripts/sync-atlas-to-db.ts market moat  # sync specific keys
 */

import { execSync } from 'child_process';
import { readFileSync, readdirSync } from 'fs';
import { basename, join } from 'path';
import { flattenTree, type AtlasNodeRow, type TreeNode } from './lib/flatten-tree';
import { createSnapshot } from './snapshot-atlas';

const DATA_DIR = process.env.ATLAS_DATA_DIR || '/Users/buryhuang/Library/CloudStorage/GoogleDrive-bary@peakmojo.com/Shared drives/Peakmojo/Company Brain';
const API_KEY = process.env.INSFORGE_API_KEY;
const BASE_URL = process.env.INSFORGE_BASE_URL || 'https://gx2m4dge.us-east.insforge.app';
const USER_ID = process.env.ATLAS_USER_ID || '586de5aa-b322-4236-8480-7f5d4ce9c39c';

// These are stored as JSONB blobs in atlas_documents, not as flat nodes
const DOC_KEYS = new Set(['dimensions', 'landscape', 'appointments-glance']);

if (!API_KEY) {
  console.error('Set INSFORGE_API_KEY env var');
  process.exit(1);
}

// ── Helpers ────────────────────────────────────────────────────────

function getChangedKeys(): string[] {
  const out = execSync(
    'git diff --name-only HEAD -- data/reports/data/*.json; git diff --name-only -- data/reports/data/*.json',
    { cwd: join(import.meta.dir, '..'), encoding: 'utf-8' },
  );
  const files = [...new Set(out.trim().split('\n').filter(Boolean))];
  return files.map((f) => basename(f, '.json'));
}

function getAllKeys(): string[] {
  return readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'seed_atlas_documents.json')
    .map((f) => basename(f, '.json'));
}

async function restFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE_URL}/api/database/records/${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      ...opts.headers,
    },
  });
}

// ── Document sync (dimensions, competitor) ─────────────────────────

async function syncDocuments(keys: string[]): Promise<number> {
  const docKeys = keys.filter((k) => DOC_KEYS.has(k));
  if (docKeys.length === 0) return 0;

  const now = new Date().toISOString();
  const rows = docKeys.map((key) => {
    const file = join(DATA_DIR, `${key}.json`);
    const json = JSON.parse(readFileSync(file, 'utf-8'));
    return { user_id: USER_ID, doc_key: key, data: json, updated_at: now };
  });

  // Upsert each document using POST with merge-duplicates
  for (const row of rows) {
    const postResp = await restFetch('atlas_documents?on_conflict=user_id,doc_key', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify([row]),
    });

    if (!postResp.ok) {
      console.error(`  Doc upsert failed for ${row.doc_key}: ${postResp.status} ${await postResp.text()}`);
      return 0;
    }
  }
  console.log(`  Synced ${docKeys.length} document(s): ${docKeys.join(', ')}`);
  return docKeys.length;
}

// ── Competitor rows sync (landscape.json → atlas_competitors) ──────

interface LandscapeCategory {
  name: string;
  best_owner?: string;
  companies?: Record<string, unknown>[];
  subcategories?: { name: string; companies: Record<string, unknown>[] }[];
}

async function syncCompetitorRows(keys: string[]): Promise<number> {
  if (!keys.includes('landscape')) return 0;

  const file = join(DATA_DIR, 'landscape.json');
  const raw = JSON.parse(readFileSync(file, 'utf-8')) as { categories: LandscapeCategory[] };
  if (!raw.categories) return 0;

  // Flatten categories → competitor rows
  const rows: Record<string, unknown>[] = [];
  let sortOrder = 0;
  for (const cat of raw.categories) {
    if (cat.companies) {
      for (const c of cat.companies) {
        rows.push({
          user_id: USER_ID,
          section: cat.name,
          best_owner: cat.best_owner || null,
          subcategory: null,
          name: c.name,
          website: c.website || null,
          category: c.category || null,
          primary_focus: c.primary_focus || null,
          target_customer: c.target_customer || null,
          pricing_model: c.pricing_model || null,
          price_range: c.price_range || null,
          funding: c.funding || null,
          serves_cna: c.serves_cna || false,
          serves_rn: c.serves_rn || false,
          uses_ai: c.uses_ai || false,
          key_differentiator: c.key_differentiator || null,
          relevance: c.relevance || null,
          threat: c.threat || 'low',
          transcript_quotes: c.transcript_quotes || null,
          added_date: c.date || null,
          sort_order: sortOrder++,
          updated_at: new Date().toISOString(),
        });
      }
    }
    if (cat.subcategories) {
      for (const sub of cat.subcategories) {
        for (const c of sub.companies) {
          rows.push({
            user_id: USER_ID,
            section: cat.name,
            best_owner: cat.best_owner || null,
            subcategory: sub.name,
            name: c.name,
            website: c.website || null,
            category: c.category || null,
            primary_focus: c.primary_focus || null,
            target_customer: c.target_customer || null,
            pricing_model: c.pricing_model || null,
            price_range: c.price_range || null,
            funding: c.funding || null,
            serves_cna: c.serves_cna || false,
            serves_rn: c.serves_rn || false,
            uses_ai: c.uses_ai || false,
            key_differentiator: c.key_differentiator || null,
            relevance: c.relevance || null,
            threat: c.threat || 'low',
            transcript_quotes: c.transcript_quotes || null,
            added_date: c.date || null,
            sort_order: sortOrder++,
            updated_at: new Date().toISOString(),
          });
        }
      }
    }
  }

  if (rows.length === 0) return 0;

  // Delete existing rows for this user, then insert fresh
  const delResp = await restFetch(`atlas_competitors?user_id=eq.${USER_ID}`, { method: 'DELETE' });
  if (!delResp.ok) {
    console.error(`  Delete old competitors failed: ${delResp.status} ${await delResp.text()}`);
    return 0;
  }

  // Insert in batches of 50
  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const resp = await restFetch('atlas_competitors', {
      method: 'POST',
      body: JSON.stringify(batch),
    });
    if (!resp.ok) {
      console.error(`  Competitor insert batch ${i / BATCH + 1} failed: ${resp.status} ${await resp.text()}`);
      return 0;
    }
  }

  console.log(`  Synced ${rows.length} competitor rows to atlas_competitors`);
  return rows.length;
}

// ── Node diff sync ─────────────────────────────────────────────────

function rowKey(r: { dimension: string; path: string }): string {
  return `${r.dimension}::${r.path}`;
}

function sortedStringify(obj: unknown): string {
  return JSON.stringify(obj, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.keys(v).sort().reduce((o: Record<string, unknown>, k) => { o[k] = (v as Record<string, unknown>)[k]; return o; }, {})
      : v,
  );
}

function rowsEqual(a: AtlasNodeRow, b: AtlasNodeRow): boolean {
  return (
    a.name === b.name &&
    a.status === b.status &&
    a.date === b.date &&
    a.description === b.description &&
    a.sort_order === b.sort_order &&
    a.depth === b.depth &&
    a.parent_path === b.parent_path &&
    a.verified === b.verified &&
    JSON.stringify(a.quotes) === JSON.stringify(b.quotes) &&
    sortedStringify(a.extra) === sortedStringify(b.extra)
  );
}

async function syncNodes(keys: string[], syncAll: boolean): Promise<{ inserted: number; updated: number; deleted: number }> {
  const nodeKeys = keys.filter((k) => !DOC_KEYS.has(k));
  if (nodeKeys.length === 0) return { inserted: 0, updated: 0, deleted: 0 };

  // 1. Flatten local JSON into rows
  const localRows = new Map<string, AtlasNodeRow>();
  for (const dim of nodeKeys) {
    const file = join(DATA_DIR, `${dim}.json`);
    try {
      const tree = JSON.parse(readFileSync(file, 'utf-8')) as TreeNode;
      for (const row of flattenTree(dim, tree, USER_ID)) {
        localRows.set(rowKey(row), row);
      }
    } catch (err) {
      console.warn(`  SKIP ${dim}: ${err}`);
    }
  }

  // 2. Fetch existing DB rows for those dimensions
  // Build filter: dimension in (...)
  const dimFilter = nodeKeys.map((k) => `"${k}"`).join(',');
  const resp = await restFetch(
    `atlas_nodes?user_id=eq.${USER_ID}&dimension=in.(${dimFilter})&select=*`,
  );

  if (!resp.ok) {
    console.error(`  Fetch existing nodes failed: ${resp.status} ${await resp.text()}`);
    return { inserted: 0, updated: 0, deleted: 0 };
  }

  const existing = (await resp.json()) as AtlasNodeRow[];
  const existingMap = new Map<string, AtlasNodeRow>();
  for (const row of existing) {
    existingMap.set(rowKey(row), row);
  }

  // 3. Diff
  const toInsert: AtlasNodeRow[] = [];
  const toUpdate: AtlasNodeRow[] = [];
  const toDelete: { user_id: string; dimension: string; path: string }[] = [];

  for (const [key, localRow] of localRows) {
    const dbRow = existingMap.get(key);
    if (!dbRow) {
      toInsert.push(localRow);
    } else if (!rowsEqual(localRow, dbRow)) {
      toUpdate.push(localRow);
    }
  }

  for (const [key, dbRow] of existingMap) {
    if (!localRows.has(key)) {
      toDelete.push({ user_id: dbRow.user_id, dimension: dbRow.dimension, path: dbRow.path });
    }
  }

  console.log(`  Diff: +${toInsert.length} new, ~${toUpdate.length} changed, -${toDelete.length} removed`);
  let deleted = toDelete.length;

  // 4. Execute changes
  // Upsert (handles both insert and update)
  const upsertRows = [...toInsert, ...toUpdate];
  if (upsertRows.length > 0) {
    const upsertResp = await restFetch('atlas_nodes', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(upsertRows.map((r) => ({ ...r, updated_at: new Date().toISOString() }))),
    });
    if (!upsertResp.ok) {
      console.error(`  Upsert failed: ${upsertResp.status} ${await upsertResp.text()}`);
    }
  }

  // Delete removed nodes
  for (const del of toDelete) {
    const delResp = await restFetch(
      `atlas_nodes?user_id=eq.${del.user_id}&dimension=eq.${del.dimension}&path=eq.${encodeURIComponent(del.path)}`,
      { method: 'DELETE' },
    );
    if (!delResp.ok) {
      console.error(`  Delete failed [${del.path}]: ${delResp.status}`);
    }
  }

  // Clean up stale dimensions that no longer exist on disk (only when syncing --all)
  if (syncAll) {
    const allDimsResp = await fetch(`${BASE_URL}/api/database/advance/rawsql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        query: `SELECT DISTINCT dimension FROM atlas_nodes WHERE user_id = $1`,
        params: [USER_ID],
      }),
    });
    if (allDimsResp.ok) {
      const allDimsData = await allDimsResp.json() as { rows: { dimension: string }[] };
      const dbDims = allDimsData.rows.map((r) => r.dimension);
      const staleDims = dbDims.filter((d) => !nodeKeys.includes(d));
      if (staleDims.length > 0) {
        const staleResp = await fetch(`${BASE_URL}/api/database/advance/rawsql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({
            query: `DELETE FROM atlas_nodes WHERE dimension = ANY($1::text[])`,
            params: [staleDims],
          }),
        });
        if (staleResp.ok) {
          const result = await staleResp.json() as { rowCount: number };
          console.log(`  Cleaned up ${staleDims.length} stale dimension(s): ${staleDims.join(', ')} (${result.rowCount} rows)`);
          deleted += result.rowCount;
        }
      }
    }
  }

  return { inserted: toInsert.length, updated: toUpdate.length, deleted };
}

// ── Main ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const syncAllFlag = args.includes('--all');
let keys: string[];

if (syncAllFlag) {
  keys = getAllKeys();
  console.log(`Syncing ALL ${keys.length} files`);
} else if (args.length > 0 && !args[0].startsWith('-')) {
  keys = args;
  console.log(`Syncing specified: ${keys.join(', ')}`);
} else {
  keys = getChangedKeys();
  if (keys.length === 0) {
    console.log('No changed JSON files detected. Use --all to force sync.');
    process.exit(0);
  }
  console.log(`Syncing ${keys.length} changed files: ${keys.join(', ')}`);
}

const start = performance.now();

// Create a snapshot before syncing so we can recover if needed
try {
  const label = `pre-sync ${new Date().toISOString().slice(0, 10)}`;
  await createSnapshot(USER_ID, label);
} catch (err) {
  console.warn(`Warning: snapshot failed, proceeding with sync: ${err}`);
}

const docCount = await syncDocuments(keys);
const compCount = await syncCompetitorRows(keys);
const { inserted, updated, deleted } = await syncNodes(keys, syncAllFlag);

// ── Propagate changes to all user scopes ──────────────────────────
// Users get a copy of __default__ on first login. After that, syncs only
// update __default__. This step backfills any new/changed nodes to all
// existing user scopes so they stay in sync.

async function propagateToUsers(keys: string[]): Promise<number> {
  // Find all user_ids that have their own copy (excluding __default__)
  const userResp = await restFetch(`atlas_nodes?user_id=neq.${USER_ID}&select=user_id&limit=1`, {
    headers: { 'Accept': 'application/json' },
  });
  if (!userResp.ok) return 0;

  const userRows = await userResp.json() as { user_id: string }[];
  const userIds = [...new Set(userRows.map((r: { user_id: string }) => r.user_id))];
  if (userIds.length === 0) return 0;

  // For each user, get their full distinct user_id list
  const allUsersResp = await fetch(`${BASE_URL}/api/database/advance/rawsql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      query: `SELECT DISTINCT user_id FROM atlas_nodes WHERE user_id != $1`,
      params: [USER_ID],
    }),
  });
  if (!allUsersResp.ok) return 0;
  const allUsersData = await allUsersResp.json() as { rows: { user_id: string }[] };
  const allUserIds = allUsersData.rows.map((r) => r.user_id);
  if (allUserIds.length === 0) return 0;

  console.log(`\nPropagating to ${allUserIds.length} user scope(s)...`);
  let totalPropagated = 0;

  for (const uid of allUserIds) {
    // Insert missing nodes from __default__ into this user's scope
    const propResp = await fetch(`${BASE_URL}/api/database/advance/rawsql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        query: `
          INSERT INTO atlas_nodes (user_id, dimension, path, parent_path, depth, sort_order, name, status, date, description, quotes, verified, extra, updated_at)
          SELECT $1, dimension, path, parent_path, depth, sort_order, name, status, date, description, quotes, verified, extra, NOW()
          FROM atlas_nodes
          WHERE user_id = $2
            AND (dimension, path) NOT IN (
              SELECT dimension, path FROM atlas_nodes WHERE user_id = $1
            )
          ON CONFLICT (user_id, dimension, path) DO NOTHING
        `,
        params: [uid, USER_ID],
      }),
    });

    if (propResp.ok) {
      const result = await propResp.json() as { rowCount: number };
      if (result.rowCount > 0) {
        console.log(`  ${uid}: +${result.rowCount} nodes backfilled`);
        totalPropagated += result.rowCount;
      }
    }

    // Also propagate document updates
    const docKeys = keys.filter((k) => DOC_KEYS.has(k));
    for (const docKey of docKeys) {
      await fetch(`${BASE_URL}/api/database/advance/rawsql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          query: `
            INSERT INTO atlas_documents (user_id, doc_key, data, updated_at)
            SELECT $1, doc_key, data, NOW()
            FROM atlas_documents
            WHERE user_id = $2 AND doc_key = $3
            ON CONFLICT (user_id, doc_key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
          `,
          params: [uid, USER_ID, docKey],
        }),
      });
    }

    // Also propagate competitor rows
    if (keys.includes('landscape')) {
      await fetch(`${BASE_URL}/api/database/advance/rawsql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          query: `
            DELETE FROM atlas_competitors WHERE user_id = $1;
            INSERT INTO atlas_competitors
            SELECT $1 as user_id, section, best_owner, subcategory, name, website, category,
                   primary_focus, target_customer, pricing_model, price_range, funding,
                   serves_cna, serves_rn, uses_ai, key_differentiator, relevance, threat,
                   transcript_quotes, added_date, sort_order, NOW() as updated_at
            FROM atlas_competitors WHERE user_id = $2
          `,
          params: [uid, USER_ID],
        }),
      });
    }
  }

  return totalPropagated;
}

const propagated = await propagateToUsers(keys);

const elapsed = ((performance.now() - start) / 1000).toFixed(2);
const total = docCount + compCount + inserted + updated + deleted;

if (total > 0 || propagated > 0) {
  console.log(`\nDone in ${elapsed}s: ${docCount} docs, ${compCount} competitors, +${inserted} nodes, ~${updated} updated, -${deleted} deleted` +
    (propagated > 0 ? `, ${propagated} propagated to users` : ''));
} else {
  console.log(`\nNo changes to sync (${elapsed}s)`);
}
