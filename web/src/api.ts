import type { DimensionMeta, TreeNode, CompetitorData, LandscapeData, LandscapeMeta, CompetitorRow, LinearTask, AIQueryResult, AppointmentsData, WorkspaceMember } from './types';
import { insforge } from './insforge';
import { assembleTree } from './assembleTree';

const DOC_TABLE = 'atlas_documents';
const NODE_TABLE = 'atlas_nodes';

// ── Database helpers ──────────────────────────────────────────────

async function dbSelect<T>(userId: string, docKey: string): Promise<T> {
  const { data, error } = await insforge.database
    .from(DOC_TABLE)
    .select('data')
    .eq('user_id', userId)
    .eq('doc_key', docKey)
    .single();

  if (error || !data) {
    throw new Error(`DB fetch failed [${docKey}]: ${error?.message ?? 'no data'}`);
  }
  return (data as { data: T }).data;
}

async function dbSelectNodes(userId: string, dimension: string): Promise<TreeNode> {
  const { data, error } = await insforge.database
    .from(NODE_TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('dimension', dimension)
    .order('depth', { ascending: true })
    .order('sort_order', { ascending: true });

  if (error || !data || data.length === 0) {
    throw new Error(`DB fetch failed [${dimension}]: ${error?.message ?? 'no data'}`);
  }
  return assembleTree(data as Parameters<typeof assembleTree>[0], dimension);
}

async function dbUpsert(userId: string, docKey: string, data: unknown): Promise<void> {
  const { error } = await insforge.database
    .from(DOC_TABLE)
    .upsert(
      { user_id: userId, doc_key: docKey, data },
      { onConflict: 'user_id,doc_key' },
    );
  if (error) throw new Error(`DB upsert failed [${docKey}]: ${error.message}`);
}

async function dbSelectOptional<T>(userId: string, docKey: string): Promise<T | null> {
  const { data, error } = await insforge.database
    .from(DOC_TABLE)
    .select('data')
    .eq('user_id', userId)
    .eq('doc_key', docKey)
    .single();

  if (error || !data) return null;
  return (data as { data: T }).data;
}

// ── Node status update ────────────────────────────────────────────

export async function updateNodeStatus(
  userId: string,
  dimension: string,
  path: string,
  status: string,
): Promise<void> {
  const { error } = await insforge.database
    .from(NODE_TABLE)
    .update({ status, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('dimension', dimension)
    .eq('path', path);

  if (error) throw new Error(`Status update failed: ${error.message}`);
}

// ── Chat thread persistence ───────────────────────────────────────

export interface ChatThreadData {
  channelName: string;
  lastSeenId: string | null;
  masterAgent: string | undefined;
  createdAt: number;
}

const CHAT_THREAD_KEY = 'chat_thread';

export async function loadChatThread(userId: string): Promise<ChatThreadData | null> {
  return dbSelectOptional<ChatThreadData>(userId, CHAT_THREAD_KEY);
}

export async function saveChatThread(userId: string, data: ChatThreadData): Promise<void> {
  return dbUpsert(userId, CHAT_THREAD_KEY, data);
}

export async function deleteChatThread(userId: string): Promise<void> {
  const { error } = await insforge.database
    .from(DOC_TABLE)
    .delete()
    .eq('user_id', userId)
    .eq('doc_key', CHAT_THREAD_KEY);
  if (error) throw new Error(`DB delete failed [${CHAT_THREAD_KEY}]: ${error.message}`);
}

// ── S3 file access ────────────────────────────────────────────────

const PRESIGN_URL = `${import.meta.env.VITE_INSFORGE_BASE_URL}/functions/s3-presign`;

export async function getS3PresignedUrl(s3Key: string, mode: 'view' | 'download' = 'view'): Promise<string> {
  const res = await fetch(`${PRESIGN_URL}?key=${encodeURIComponent(s3Key)}&mode=${mode}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.url;
}

// ── Public API ─────────────────────────────────────────────────────

// No default data initialization — each user's data is managed via sync scripts

export async function fetchDimensions(userId: string): Promise<DimensionMeta[]> {
  return dbSelect<DimensionMeta[]>(userId, 'dimensions');
}

export async function fetchDimensionData(userId: string, name: string): Promise<TreeNode> {
  return dbSelectNodes(userId, name);
}

export async function fetchCompetitorData(userId: string): Promise<CompetitorData> {
  return dbSelect<CompetitorData>(userId, 'competitor');
}

export async function fetchProgressData(userId: string): Promise<TreeNode> {
  return dbSelect<TreeNode>(userId, 'progress');
}

export async function fetchAppointmentsData(userId: string): Promise<AppointmentsData> {
  return dbSelect<AppointmentsData>(userId, 'appointments-glance');
}

const COMP_TABLE = 'atlas_competitors';

export async function fetchLandscapeData(userId: string): Promise<LandscapeData> {
  // Fetch metadata doc + competitor rows in parallel
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

export async function queryConversationsAI(query: string, conversations: { date: string; name: string; time?: string; type?: string; participants?: string; desc?: string }[]): Promise<AIQueryResult> {
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
          content: `You are a meeting intelligence analyst. You have access to a conversation/meeting log database. Given a user query, analyze the conversations and return relevant results using the display_conversations tool. Choose the most informative columns (max 5) based on the query. Always include the conversation name as the first column. Be concise in cell values. Answer in the same language as the query.`,
        },
        {
          role: 'user',
          content: `Query: ${query}\n\nConversation database (${conversations.length} conversations):\n${JSON.stringify(conversations, null, 0)}`,
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'display_conversations',
            description: 'Display a structured table of conversations matching the query',
            parameters: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Short title describing the results' },
                columns: {
                  type: 'array',
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
                  items: { type: 'object', additionalProperties: { type: 'string' } },
                },
                summary: { type: 'string', description: 'Brief analytical summary of the findings' },
              },
              required: ['title', 'columns', 'rows'],
            },
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'display_conversations' } },
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`AI query failed: ${resp.status} ${errText}`);
  }

  const data = await resp.json();
  const choice = data.choices?.[0];
  const toolCall = choice?.message?.tool_calls?.[0];

  if (!toolCall || toolCall.function.name !== 'display_conversations') {
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

  if (error || !data || data.length === 0) {
    throw new Error(`DB fetch failed [competitors]: ${error?.message ?? 'no data'}`);
  }
  return mapCompetitorRows(data);
}

// ── Workspace sharing ─────────────────────────────────────────────

const WORKSPACE_TABLE = 'workspace_members';

export async function fetchUserWorkspaces(email: string): Promise<WorkspaceMember[]> {
  const { data, error } = await insforge.database
    .from(WORKSPACE_TABLE)
    .select('*')
    .eq('member_email', email.toLowerCase());

  if (error) throw new Error(`Failed to fetch workspaces: ${error.message}`);
  return (data ?? []) as WorkspaceMember[];
}

export async function fetchWorkspaceMembers(ownerId: string): Promise<WorkspaceMember[]> {
  const { data, error } = await insforge.database
    .from(WORKSPACE_TABLE)
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch members: ${error.message}`);
  return (data ?? []) as WorkspaceMember[];
}

export async function addWorkspaceMember(ownerId: string, workspaceName: string, email: string): Promise<void> {
  const { error } = await insforge.database
    .from(WORKSPACE_TABLE)
    .insert({ owner_id: ownerId, workspace_name: workspaceName, member_email: email.toLowerCase() });

  if (error) throw new Error(`Failed to add member: ${error.message}`);
}

export async function removeWorkspaceMember(ownerId: string, email: string): Promise<void> {
  const { error } = await insforge.database
    .from(WORKSPACE_TABLE)
    .delete()
    .eq('owner_id', ownerId)
    .eq('member_email', email.toLowerCase());

  if (error) throw new Error(`Failed to remove member: ${error.message}`);
}

export async function updateWorkspaceName(ownerId: string, newName: string): Promise<void> {
  const { error } = await insforge.database
    .from(WORKSPACE_TABLE)
    .update({ workspace_name: newName })
    .eq('owner_id', ownerId);

  if (error) throw new Error(`Failed to update workspace name: ${error.message}`);
}
