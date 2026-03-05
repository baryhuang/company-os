import type { DimensionMeta, TreeNode, CompetitorData } from './types';
import { insforge } from './insforge';

const isDev = import.meta.env.DEV;
const TABLE = 'atlas_documents';

// ── Local file helpers (dev mode) ──────────────────────────────────

async function fetchLocalJson<T>(filename: string): Promise<T> {
  const resp = await fetch(`/data/${filename}`);
  if (!resp.ok) throw new Error(`Local fetch failed: /data/${filename}`);
  return resp.json() as Promise<T>;
}

// ── Database helpers (production) ──────────────────────────────────

async function dbSelect<T>(userId: string, docKey: string): Promise<T> {
  // Try user-specific row first, fall back to __default__
  const { data, error } = await insforge.database
    .from(TABLE)
    .select('data')
    .eq('user_id', userId)
    .eq('doc_key', docKey)
    .maybeSingle();

  if (!error && data) {
    return (data as { data: T }).data;
  }

  // Fallback to default data
  const { data: fallback, error: fbError } = await insforge.database
    .from(TABLE)
    .select('data')
    .eq('user_id', '__default__')
    .eq('doc_key', docKey)
    .single();

  if (fbError || !fallback) {
    throw new Error(`DB fetch failed [${docKey}]: ${fbError?.message ?? 'no data'}`);
  }
  return (fallback as { data: T }).data;
}

// ── Public API ─────────────────────────────────────────────────────

export async function initializeUserData(userId: string): Promise<void> {
  if (isDev) return; // local files need no init

  // Copy all __default__ rows into the user's namespace
  const { data: defaults, error } = await insforge.database
    .from(TABLE)
    .select('doc_key, data')
    .eq('user_id', '__default__');

  if (error || !defaults) {
    throw new Error(`Failed to load defaults: ${error?.message ?? 'no data'}`);
  }

  const rows = (defaults as { doc_key: string; data: unknown }[]).map((r) => ({
    user_id: userId,
    doc_key: r.doc_key,
    data: r.data,
  }));

  const { error: insertError } = await insforge.database
    .from(TABLE)
    .insert(rows);

  if (insertError) {
    throw new Error(`Failed to initialize user data: ${insertError.message}`);
  }
}

export async function fetchDimensions(userId: string): Promise<DimensionMeta[]> {
  if (isDev) return fetchLocalJson<DimensionMeta[]>('dimensions.json');
  return dbSelect<DimensionMeta[]>(userId, 'dimensions');
}

export async function fetchDimensionData(userId: string, name: string): Promise<TreeNode> {
  if (isDev) return fetchLocalJson<TreeNode>(`${name}.json`);
  return dbSelect<TreeNode>(userId, name);
}

export async function fetchCompetitorData(userId: string): Promise<CompetitorData> {
  if (isDev) return fetchLocalJson<CompetitorData>('competitor.json');
  return dbSelect<CompetitorData>(userId, 'competitor');
}
