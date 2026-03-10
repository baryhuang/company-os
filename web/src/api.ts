import type { DimensionMeta, TreeNode, CompetitorData, LandscapeData, LandscapeMeta, CompetitorRow, LinearTask, AIQueryResult, AppointmentsData } from './types';
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

export async function fetchAppointmentsData(userId: string): Promise<AppointmentsData> {
  if (isDev) return fetchLocalJson<AppointmentsData>('appointments-glance.json');
  return dbSelect<AppointmentsData>(userId, 'appointments-glance');
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

// ── Task search ───────────────────────────────────────────────────

export async function searchTasks(
  query: string,
  filters?: { status?: string; priority?: string; project?: string; excludeStatuses?: string[]; limit?: number },
): Promise<LinearTask[]> {
  // 1. Get embedding for query
  const embResp = await insforge.ai.embeddings.create({
    model: 'openai/text-embedding-3-small',
    input: query,
  });
  const embedding = embResp.data[0].embedding as number[];

  // 2. Call Postgres function via SDK rpc
  const { data, error } = await insforge.database.rpc('search_tasks', {
    query_embedding: `[${embedding.join(',')}]`,
    filter_status: filters?.status ?? null,
    filter_priority: filters?.priority ?? null,
    filter_project: filters?.project ?? null,
    exclude_statuses: filters?.excludeStatuses ?? null,
    result_limit: filters?.limit ?? 20,
  });

  if (error) throw new Error(`Search failed: ${error.message}`);
  return data as LinearTask[];
}

// ── AI competitor query ───────────────────────────────────────────

const DO_AI_URL = 'https://inference.do-ai.run/v1/chat/completions';
const DO_AI_KEY = 'sk-do-kmxZD-ppFWcJmT8VINxRs83Osa6Kh-Il5ttBjM69adhUFDqzBGigWzY45Q';

export async function queryCompetitorsAI(query: string, competitors: CompetitorRow[]): Promise<AIQueryResult> {
  // Prepare slim competitor data for the AI context
  const compactData = competitors.map(c => ({
    name: c.name,
    section: c.section,
    subcategory: c.subcategory,
    category: c.category,
    threat: c.threat,
    primary_focus: c.primary_focus,
    target_customer: c.target_customer,
    pricing_model: c.pricing_model,
    price_range: c.price_range,
    funding: c.funding,
    uses_ai: c.uses_ai,
    serves_cna: c.serves_cna,
    serves_rn: c.serves_rn,
    key_differentiator: c.key_differentiator,
    relevance: c.relevance,
    website: c.website,
  }));

  const resp = await fetch(DO_AI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DO_AI_KEY}`,
    },
    body: JSON.stringify({
      model: 'anthropic-claude-4.5-sonnet',
      messages: [
        {
          role: 'system',
          content: `You are a competitive intelligence analyst. You have access to a competitor landscape database. Given a user query, analyze the competitors and return relevant results using the display_companies tool. Choose the most informative columns (max 5) based on the query. Always include the company name as the first column. Be concise in cell values.`,
        },
        {
          role: 'user',
          content: `Query: ${query}\n\nCompetitor database (${compactData.length} companies):\n${JSON.stringify(compactData, null, 0)}`,
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'display_companies',
            description: 'Display a structured table of companies matching the query',
            parameters: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Short title describing the results' },
                columns: {
                  type: 'array',
                  description: 'Table columns (max 5). Each has header (display name) and key (data key).',
                  items: {
                    type: 'object',
                    properties: {
                      header: { type: 'string' },
                      key: { type: 'string' },
                    },
                    required: ['header', 'key'],
                  },
                  maxItems: 5,
                },
                rows: {
                  type: 'array',
                  description: 'Row data. Each row is an object with keys matching column keys.',
                  items: {
                    type: 'object',
                    additionalProperties: { type: 'string' },
                  },
                },
                summary: { type: 'string', description: 'Brief analytical summary of the findings' },
              },
              required: ['title', 'columns', 'rows'],
            },
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'display_companies' } },
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`AI query failed: ${resp.status} ${errText}`);
  }

  const data = await resp.json();
  const choice = data.choices?.[0];
  const toolCall = choice?.message?.tool_calls?.[0];

  if (!toolCall || toolCall.function.name !== 'display_companies') {
    // Fallback: if AI returned text instead of tool call
    const content = choice?.message?.content || '';
    return {
      title: 'AI Response',
      columns: [{ header: 'Response', key: 'response' }],
      rows: [{ response: content }],
    };
  }

  const args = JSON.parse(toolCall.function.arguments);
  return {
    title: args.title || 'Results',
    columns: args.columns || [],
    rows: args.rows || [],
    summary: args.summary,
  };
}

function mapCompetitorRows(rows: Record<string, unknown>[]): CompetitorRow[] {
  return rows.map(r => {
    const { added_date, ...rest } = r as Record<string, unknown> & { added_date?: string };
    return { ...rest, date: added_date ?? undefined } as unknown as CompetitorRow;
  });
}

async function fetchCompetitorRows(userId: string): Promise<CompetitorRow[]> {
  const { data, error } = await insforge.database
    .from(COMP_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });

  if (!error && data && data.length > 0) {
    return mapCompetitorRows(data);
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
  return mapCompetitorRows(fallback);
}
