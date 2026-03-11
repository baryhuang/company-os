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

const DATA_DIR = join(import.meta.dir, '../data/reports/data');
const API_KEY = process.env.INSFORGE_API_KEY;
const BASE_URL = process.env.INSFORGE_BASE_URL || 'https://gx2m4dge.us-east.insforge.app';
const USER_ID = '__default__';

// These are stored as JSONB blobs in atlas_documents, not as flat nodes
const DOC_KEYS = new Set(['dimensions', 'competitor', 'progress', 'landscape', 'appointments-glance']);

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

// ── Node diff sync ─────────────────────────────────────────────────

function rowKey(r: { dimension: string; path: string }): string {
  return `${r.dimension}::${r.path}`;
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
    JSON.stringify(a.extra) === JSON.stringify(b.extra)
  );
}

async function syncNodes(keys: string[]): Promise<{ inserted: number; updated: number; deleted: number }> {
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

  return { inserted: toInsert.length, updated: toUpdate.length, deleted: toDelete.length };
}

// ── Main ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let keys: string[];

if (args.includes('--all')) {
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
const { inserted, updated, deleted } = await syncNodes(keys);

const elapsed = ((performance.now() - start) / 1000).toFixed(2);
const total = docCount + inserted + updated + deleted;

if (total > 0) {
  console.log(`\nDone in ${elapsed}s: ${docCount} docs, +${inserted} nodes, ~${updated} updated, -${deleted} deleted`);
} else {
  console.log(`\nNo changes to sync (${elapsed}s)`);
}
