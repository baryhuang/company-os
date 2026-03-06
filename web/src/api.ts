import type { DimensionMeta, TreeNode, CompetitorData, LandscapeData, LandscapeMeta, CompetitorRow } from './types';
import { insforge } from './insforge';
import { assembleTree } from './assembleTree';

const isDev = import.meta.env.DEV;
const DOC_TABLE = 'atlas_documents';
const NODE_TABLE = 'atlas_nodes';

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
    .from(DOC_TABLE)
    .select('data')
    .eq('user_id', userId)
    .eq('doc_key', docKey)
    .maybeSingle();

  if (!error && data) {
    return (data as { data: T }).data;
  }

  // Fallback to default data
  const { data: fallback, error: fbError } = await insforge.database
    .from(DOC_TABLE)
    .select('data')
    .eq('user_id', '__default__')
    .eq('doc_key', docKey)
    .single();

  if (fbError || !fallback) {
    throw new Error(`DB fetch failed [${docKey}]: ${fbError?.message ?? 'no data'}`);
  }
  return (fallback as { data: T }).data;
}

async function dbSelectNodes(userId: string, dimension: string): Promise<TreeNode> {
  // Try user-specific rows first
  const { data, error } = await insforge.database
    .from(NODE_TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('dimension', dimension)
    .order('depth', { ascending: true })
    .order('sort_order', { ascending: true });

  if (!error && data && data.length > 0) {
    return assembleTree(data as Parameters<typeof assembleTree>[0]);
  }

  // Fallback to default data
  const { data: fallback, error: fbError } = await insforge.database
    .from(NODE_TABLE)
    .select('*')
    .eq('user_id', '__default__')
    .eq('dimension', dimension)
    .order('depth', { ascending: true })
    .order('sort_order', { ascending: true });

  if (fbError || !fallback || fallback.length === 0) {
    throw new Error(`DB fetch failed [${dimension}]: ${fbError?.message ?? 'no data'}`);
  }
  return assembleTree(fallback as Parameters<typeof assembleTree>[0]);
}

// ── Public API ─────────────────────────────────────────────────────

export async function initializeUserData(userId: string): Promise<void> {
  if (isDev) return; // local files need no init

  // Check if user already has documents — skip if so (idempotent)
  const { data: existing } = await insforge.database
    .from(DOC_TABLE)
    .select('doc_key')
    .eq('user_id', userId)
    .limit(1);

  if (!existing || existing.length === 0) {
    const { data: defaults, error } = await insforge.database
      .from(DOC_TABLE)
      .select('doc_key, data')
      .eq('user_id', '__default__');

    if (error || !defaults) {
      throw new Error(`Failed to load defaults: ${error?.message ?? 'no data'}`);
    }

    const docRows = (defaults as { doc_key: string; data: unknown }[]).map((r) => ({
      user_id: userId,
      doc_key: r.doc_key,
      data: r.data,
    }));

    const { error: docInsertError } = await insforge.database
      .from(DOC_TABLE)
      .insert(docRows);

    if (docInsertError) {
      throw new Error(`Failed to initialize user documents: ${docInsertError.message}`);
    }
  }

  // Check if user already has nodes — skip if so
  const { data: existingNodes } = await insforge.database
    .from(NODE_TABLE)
    .select('path')
    .eq('user_id', userId)
    .limit(1);

  if (!existingNodes || existingNodes.length === 0) {
    const { data: defaultNodes, error: nodesError } = await insforge.database
      .from(NODE_TABLE)
      .select('*')
      .eq('user_id', '__default__');

    if (nodesError || !defaultNodes) {
      throw new Error(`Failed to load default nodes: ${nodesError?.message ?? 'no data'}`);
    }

    type NodeRow = Record<string, unknown>;
    const nodeRows = (defaultNodes as NodeRow[]).map((r) => ({
      ...r,
      user_id: userId,
      created_at: undefined,
      updated_at: undefined,
    }));

    for (const row of nodeRows) {
      delete row.created_at;
      delete row.updated_at;
    }

    const { error: nodeInsertError } = await insforge.database
      .from(NODE_TABLE)
      .insert(nodeRows);

    if (nodeInsertError) {
      throw new Error(`Failed to initialize user nodes: ${nodeInsertError.message}`);
    }
  }
}

export async function fetchDimensions(userId: string): Promise<DimensionMeta[]> {
  if (isDev) return fetchLocalJson<DimensionMeta[]>('dimensions.json');
  return dbSelect<DimensionMeta[]>(userId, 'dimensions');
}

export async function fetchDimensionData(userId: string, name: string): Promise<TreeNode> {
  if (isDev) return fetchLocalJson<TreeNode>(`${name}.json`);
  return dbSelectNodes(userId, name);
}

export async function fetchCompetitorData(userId: string): Promise<CompetitorData> {
  if (isDev) return fetchLocalJson<CompetitorData>('competitor.json');
  return dbSelect<CompetitorData>(userId, 'competitor');
}

export async function fetchProgressData(userId: string): Promise<TreeNode> {
  if (isDev) return fetchLocalJson<TreeNode>('progress.json');
  return dbSelect<TreeNode>(userId, 'progress');
}

const COMP_TABLE = 'atlas_competitors';

export async function fetchLandscapeData(userId: string): Promise<LandscapeData> {
  if (isDev) {
    // In dev, build from landscape.json
    const raw = await fetchLocalJson<{
      title: string; subtitle: string; last_update?: string;
      our_position: string; white_space: string;
      categories: { name: string; best_owner?: string; companies?: CompetitorRow[]; subcategories?: { name: string; companies: CompetitorRow[] }[] }[];
    }>('landscape.json');
    const competitors: CompetitorRow[] = [];
    let sortOrder = 0;
    for (const cat of raw.categories) {
      if (cat.companies) {
        for (const c of cat.companies) {
          competitors.push({ ...c, section: cat.name, best_owner: cat.best_owner, sort_order: sortOrder++ });
        }
      }
      if (cat.subcategories) {
        for (const sub of cat.subcategories) {
          for (const c of sub.companies) {
            competitors.push({ ...c, section: cat.name, best_owner: cat.best_owner, subcategory: sub.name, sort_order: sortOrder++ });
          }
        }
      }
    }
    return {
      meta: { title: raw.title, subtitle: raw.subtitle, last_update: raw.last_update, our_position: raw.our_position, white_space: raw.white_space },
      competitors,
    };
  }

  // Production: fetch metadata doc + competitor rows in parallel
  const [meta, competitors] = await Promise.all([
    dbSelect<LandscapeMeta>(userId, 'landscape'),
    fetchCompetitorRows(userId),
  ]);
  return { meta, competitors };
}

async function fetchCompetitorRows(userId: string): Promise<CompetitorRow[]> {
  const { data, error } = await insforge.database
    .from(COMP_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });

  if (!error && data && data.length > 0) {
    return data as CompetitorRow[];
  }

  // Fallback to defaults
  const { data: fallback, error: fbError } = await insforge.database
    .from(COMP_TABLE)
    .select('*')
    .eq('user_id', '__default__')
    .order('sort_order', { ascending: true });

  if (fbError || !fallback || fallback.length === 0) {
    throw new Error(`DB fetch failed [competitors]: ${fbError?.message ?? 'no data'}`);
  }
  return fallback as CompetitorRow[];
}
