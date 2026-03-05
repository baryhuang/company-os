#!/usr/bin/env bun
/**
 * Sync changed atlas JSON files to the database.
 *
 * Usage:
 *   bun scripts/sync-atlas-to-db.ts           # sync git-dirty files only
 *   bun scripts/sync-atlas-to-db.ts --all     # force sync all files
 *   bun scripts/sync-atlas-to-db.ts market moat  # sync specific keys
 */

import { execSync } from 'child_process';
import { readFileSync, readdirSync } from 'fs';
import { basename, join } from 'path';

const DATA_DIR = join(import.meta.dir, '../data/reports/data');
const API_KEY = process.env.INSFORGE_API_KEY;
const BASE_URL = process.env.INSFORGE_BASE_URL || 'https://gx2m4dge.us-east.insforge.app';

if (!API_KEY) {
  console.error('Set INSFORGE_API_KEY env var');
  process.exit(1);
}

function getChangedKeys(): string[] {
  // git diff (staged + unstaged) for data/reports/data/*.json
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

async function upsertDoc(docKey: string, data: unknown): Promise<boolean> {
  // Use PostgREST upsert via REST API
  const url = `${BASE_URL}/rest/v1/atlas_documents`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': API_KEY!,
      'Authorization': `Bearer ${API_KEY}`,
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      user_id: '__default__',
      doc_key: docKey,
      data,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`  FAIL ${docKey}: ${resp.status} ${text}`);
    return false;
  }
  return true;
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

let ok = 0;
let fail = 0;

for (const key of keys) {
  const file = join(DATA_DIR, `${key}.json`);
  try {
    const json = JSON.parse(readFileSync(file, 'utf-8'));
    const success = await upsertDoc(key, json);
    if (success) {
      console.log(`  OK ${key} (${JSON.stringify(json).length} chars)`);
      ok++;
    } else {
      fail++;
    }
  } catch (err) {
    console.error(`  ERR ${key}: ${err}`);
    fail++;
  }
}

console.log(`\nDone: ${ok} synced, ${fail} failed`);
if (fail > 0) process.exit(1);
