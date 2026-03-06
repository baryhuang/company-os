#!/usr/bin/env bun
/**
 * Atlas data snapshot management — create, list, restore, and prune snapshots.
 *
 * Snapshots capture the full state of atlas_documents and atlas_nodes for a user,
 * enabling point-in-time recovery when syncs introduce bad data.
 *
 * Usage:
 *   bun scripts/snapshot-atlas.ts                          # create snapshot for __default__
 *   bun scripts/snapshot-atlas.ts --label "before rewrite" # create with custom label
 *   bun scripts/snapshot-atlas.ts --user <uid>             # snapshot a specific user
 *   bun scripts/snapshot-atlas.ts --list                   # list recent snapshots
 *   bun scripts/snapshot-atlas.ts --restore <id>           # restore from snapshot
 *   bun scripts/snapshot-atlas.ts --prune --keep 20        # delete old snapshots, keep latest N
 */

const API_KEY = process.env.INSFORGE_API_KEY;
const BASE_URL = process.env.INSFORGE_BASE_URL || 'https://gx2m4dge.us-east.insforge.app';
const DEFAULT_USER = '__default__';

if (!API_KEY) {
  console.error('Set INSFORGE_API_KEY env var');
  process.exit(1);
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

async function sqlFetch(query: string, params: unknown[] = []): Promise<unknown[]> {
  const resp = await fetch(`${BASE_URL}/api/database/sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ query, params }),
  });
  if (!resp.ok) {
    throw new Error(`SQL failed: ${resp.status} ${await resp.text()}`);
  }
  const data = await resp.json();
  return data.rows ?? data;
}

// ── Create snapshot ──────────────────────────────────────────────────

export async function createSnapshot(userId: string, label: string): Promise<number> {
  // Fetch all documents for this user
  const docsResp = await restFetch(`atlas_documents?user_id=eq.${encodeURIComponent(userId)}&select=doc_key,data`);
  if (!docsResp.ok) throw new Error(`Failed to fetch documents: ${docsResp.status}`);
  const documents = await docsResp.json();

  // Fetch all nodes for this user
  const nodesResp = await restFetch(`atlas_nodes?user_id=eq.${encodeURIComponent(userId)}&select=*`);
  if (!nodesResp.ok) throw new Error(`Failed to fetch nodes: ${nodesResp.status}`);
  const nodes = await nodesResp.json();

  // Insert snapshot
  const insertResp = await restFetch('atlas_snapshots', {
    method: 'POST',
    headers: { 'Prefer': 'return=representation' },
    body: JSON.stringify([{
      user_id: userId,
      label,
      documents: JSON.stringify(documents),
      nodes: JSON.stringify(nodes),
    }]),
  });

  if (!insertResp.ok) {
    throw new Error(`Failed to insert snapshot: ${insertResp.status} ${await insertResp.text()}`);
  }

  const [created] = await insertResp.json();
  console.log(`Snapshot #${created.id} created: ${documents.length} docs, ${nodes.length} nodes [${label}]`);
  return created.id;
}

// ── List snapshots ───────────────────────────────────────────────────

async function listSnapshots(userId: string): Promise<void> {
  const rows = await sqlFetch(
    `SELECT id, user_id, label,
            jsonb_array_length(documents) as doc_count,
            jsonb_array_length(nodes) as node_count,
            created_at
     FROM atlas_snapshots
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 25`,
    [userId],
  ) as Array<{ id: number; user_id: string; label: string; doc_count: number; node_count: number; created_at: string }>;

  if (rows.length === 0) {
    console.log(`No snapshots found for user "${userId}"`);
    return;
  }

  console.log(`\nSnapshots for user "${userId}" (${rows.length} shown):\n`);
  console.log('  ID  | Docs | Nodes | Label                      | Created');
  console.log('------+------+-------+----------------------------+-------------------------');
  for (const r of rows) {
    const id = String(r.id).padStart(4);
    const docs = String(r.doc_count).padStart(4);
    const nodes = String(r.node_count).padStart(5);
    const label = r.label.padEnd(26).slice(0, 26);
    const date = new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 19);
    console.log(`  ${id} | ${docs} | ${nodes} | ${label} | ${date}`);
  }
  console.log();
}

// ── Restore from snapshot ────────────────────────────────────────────

async function restoreSnapshot(snapshotId: number): Promise<void> {
  // 1. Fetch the snapshot
  const snapResp = await restFetch(`atlas_snapshots?id=eq.${snapshotId}&select=*`);
  if (!snapResp.ok) throw new Error(`Failed to fetch snapshot: ${snapResp.status}`);
  const snapshots = await snapResp.json();
  if (snapshots.length === 0) {
    console.error(`Snapshot #${snapshotId} not found`);
    process.exit(1);
  }

  const snap = snapshots[0];
  const userId = snap.user_id;
  const documents: Array<{ doc_key: string; data: unknown }> = typeof snap.documents === 'string' ? JSON.parse(snap.documents) : snap.documents;
  const nodes: Array<Record<string, unknown>> = typeof snap.nodes === 'string' ? JSON.parse(snap.nodes) : snap.nodes;

  console.log(`Restoring snapshot #${snapshotId} for user "${userId}": ${documents.length} docs, ${nodes.length} nodes`);

  // 2. Create a safety snapshot of current state before restoring
  await createSnapshot(userId, `pre-restore from #${snapshotId}`);

  // 3. Delete current documents and nodes for this user
  const delDocsResp = await restFetch(`atlas_documents?user_id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' });
  if (!delDocsResp.ok) console.warn(`  Warning: delete docs returned ${delDocsResp.status}`);

  const delNodesResp = await restFetch(`atlas_nodes?user_id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' });
  if (!delNodesResp.ok) console.warn(`  Warning: delete nodes returned ${delNodesResp.status}`);

  // 4. Re-insert documents
  if (documents.length > 0) {
    const now = new Date().toISOString();
    const docRows = documents.map((d) => ({
      user_id: userId,
      doc_key: d.doc_key,
      data: d.data,
      updated_at: now,
    }));
    const insDocsResp = await restFetch('atlas_documents', {
      method: 'POST',
      body: JSON.stringify(docRows),
    });
    if (!insDocsResp.ok) {
      console.error(`  Failed to restore documents: ${insDocsResp.status} ${await insDocsResp.text()}`);
    }
  }

  // 5. Re-insert nodes (in batches of 500 to avoid payload limits)
  if (nodes.length > 0) {
    const BATCH = 500;
    for (let i = 0; i < nodes.length; i += BATCH) {
      const batch = nodes.slice(i, i + BATCH);
      const insNodesResp = await restFetch('atlas_nodes', {
        method: 'POST',
        body: JSON.stringify(batch),
      });
      if (!insNodesResp.ok) {
        console.error(`  Failed to restore nodes batch ${i / BATCH + 1}: ${insNodesResp.status} ${await insNodesResp.text()}`);
      }
    }
  }

  console.log(`Restore complete.`);
}

// ── Prune old snapshots ──────────────────────────────────────────────

async function pruneSnapshots(userId: string, keep: number): Promise<void> {
  const result = await sqlFetch(
    `DELETE FROM atlas_snapshots
     WHERE user_id = $1
       AND id NOT IN (
         SELECT id FROM atlas_snapshots
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2
       )
     RETURNING id`,
    [userId, keep],
  ) as Array<{ id: number }>;

  console.log(`Pruned ${result.length} old snapshot(s), kept latest ${keep}`);
}

// ── CLI (only when run directly) ─────────────────────────────────────

if (import.meta.main) {
const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

const userId = getArg('--user') ?? DEFAULT_USER;

if (args.includes('--list')) {
  await listSnapshots(userId);
} else if (args.includes('--restore')) {
  const id = getArg('--restore');
  if (!id || isNaN(Number(id))) {
    console.error('Usage: --restore <snapshot-id>');
    process.exit(1);
  }
  await restoreSnapshot(Number(id));
} else if (args.includes('--prune')) {
  const keep = Number(getArg('--keep') ?? '20');
  await pruneSnapshots(userId, keep);
} else {
  // Default: create a snapshot
  const label = getArg('--label') ?? `manual ${new Date().toISOString().slice(0, 10)}`;
  await createSnapshot(userId, label);
}
} // end if (import.meta.main)
