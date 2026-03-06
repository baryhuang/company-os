#!/usr/bin/env bun
/**
 * One-time migration: read dimension JSON files and insert flat rows
 * into `atlas_nodes` with user_id = '__default__'.
 *
 * Usage:
 *   bun scripts/migrate-atlas-to-nodes.ts
 *   bun scripts/migrate-atlas-to-nodes.ts --dry-run   # print rows without inserting
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { flattenTree, type TreeNode } from './lib/flatten-tree';

const DATA_DIR = join(import.meta.dir, '../data/reports/data');
const API_KEY = process.env.INSFORGE_API_KEY;
const BASE_URL = process.env.INSFORGE_BASE_URL || 'https://gx2m4dge.us-east.insforge.app';
const USER_ID = '__default__';
const dryRun = process.argv.includes('--dry-run');

if (!API_KEY && !dryRun) {
  console.error('Set INSFORGE_API_KEY env var (or use --dry-run)');
  process.exit(1);
}

// Dimension IDs that are tree-structured (not competitor/dimensions)
const TREE_DIMENSIONS = [
  'market', 'product', 'bizmodel', 'org', 'gtm', 'messaging',
  'moat', 'people', 'network', 'validation', 'data', 'build',
  'human_ai_teaming',
];

let totalRows = 0;
const allRows: ReturnType<typeof flattenTree> = [];

for (const dim of TREE_DIMENSIONS) {
  const file = join(DATA_DIR, `${dim}.json`);
  try {
    const tree = JSON.parse(readFileSync(file, 'utf-8')) as TreeNode;
    const rows = flattenTree(dim, tree, USER_ID);
    allRows.push(...rows);
    totalRows += rows.length;
    console.log(`  ${dim}: ${rows.length} nodes`);
  } catch (err) {
    console.warn(`  SKIP ${dim}: ${err}`);
  }
}

console.log(`\nTotal: ${totalRows} rows from ${TREE_DIMENSIONS.length} dimensions`);

if (dryRun) {
  console.log('\n--- DRY RUN: sample rows ---');
  for (const row of allRows.slice(0, 5)) {
    console.log(`  [${row.dimension}] ${row.path} (depth=${row.depth}, sort=${row.sort_order})`);
  }
  process.exit(0);
}

// Bulk upsert via PostgREST
const BATCH_SIZE = 100;
const start = performance.now();
let inserted = 0;

for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
  const batch = allRows.slice(i, i + BATCH_SIZE);
  const resp = await fetch(`${BASE_URL}/api/database/records/atlas_nodes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(batch),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`Batch ${i / BATCH_SIZE + 1} failed: ${resp.status} ${text}`);
    process.exit(1);
  }
  inserted += batch.length;
  console.log(`  Inserted batch ${Math.floor(i / BATCH_SIZE) + 1} (${inserted}/${totalRows})`);
}

const elapsed = ((performance.now() - start) / 1000).toFixed(2);
console.log(`\nDone: ${inserted} rows migrated in ${elapsed}s`);
