const LINEAR_API_KEY = Deno.env.get('LINEAR_API_KEY');
const LINEAR_GQL = 'https://api.linear.app/graphql';

const PRIORITY_MAP = { 0: 'No priority', 1: 'Urgent', 2: 'High', 3: 'Medium', 4: 'Low' };

async function linearQuery(query, variables = {}) {
  const res = await fetch(LINEAR_GQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': LINEAR_API_KEY,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Linear API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

async function dbQuery(baseUrl, apiKey, sql, params = []) {
  const resp = await fetch(`${baseUrl}/api/database/advance/rawsql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query: sql, params }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`DB error ${resp.status}: ${errText}`);
  }
  return resp.json();
}

const ISSUES_QUERY = `
query($after: String, $updatedAfter: DateTimeOrDuration) {
  issues(
    first: 100
    after: $after
    filter: { updatedAt: { gt: $updatedAfter } }
    orderBy: updatedAt
  ) {
    nodes {
      id identifier title description
      state { name }
      priority
      estimate
      project { id name }
      creator { name }
      assignee { name }
      labels { nodes { name } }
      cycle { number name startsAt endsAt }
      createdAt updatedAt startedAt triagedAt completedAt canceledAt archivedAt
      dueDate
      parent { identifier }
      team { name }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

function escapeStr(s) {
  if (s == null) return '';
  return String(s).replace(/'/g, "''");
}

function buildUpsertSQL(rows) {
  const cols = [
    'ID','Team','Title','Description','Status','Estimate','Priority',
    'Project ID','Project','Creator','Assignee','Labels',
    'Cycle Number','Cycle Name','Cycle Start','Cycle End',
    'Created','Updated','Started','Triaged','Completed','Canceled','Archived',
    'Due Date','Parent issue','Initiatives','Project Milestone ID',
    'Project Milestone','SLA Status','UUID',
    'Time in status (minutes)','Related to','Blocked by','Duplicate of'
  ];

  const colList = cols.map(c => `"${c}"`).join(', ');
  const updateList = cols.filter(c => c !== 'ID').map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');

  const valueRows = rows.map(row => {
    const vals = cols.map(c => `'${escapeStr(row[c])}'`);
    return `(${vals.join(', ')})`;
  });

  return `INSERT INTO linear_tasks (${colList}) VALUES ${valueRows.join(',\n')}
ON CONFLICT ("ID") DO UPDATE SET ${updateList}`;
}

function mapIssue(node) {
  return {
    ID: node.identifier || '',
    Team: node.team?.name || '',
    Title: node.title || '',
    Description: (node.description || '').slice(0, 5000),
    Status: node.state?.name || '',
    Estimate: node.estimate != null ? String(node.estimate) : '',
    Priority: PRIORITY_MAP[node.priority] || 'No priority',
    'Project ID': node.project?.id || '',
    Project: node.project?.name || '',
    Creator: node.creator?.name || '',
    Assignee: node.assignee?.name || '',
    Labels: (node.labels?.nodes || []).map(l => l.name).join(', '),
    'Cycle Number': node.cycle?.number != null ? String(node.cycle.number) : '',
    'Cycle Name': node.cycle?.name || '',
    'Cycle Start': node.cycle?.startsAt || '',
    'Cycle End': node.cycle?.endsAt || '',
    Created: node.createdAt || '',
    Updated: node.updatedAt || '',
    Started: node.startedAt || '',
    Triaged: node.triagedAt || '',
    Completed: node.completedAt || '',
    Canceled: node.canceledAt || '',
    Archived: node.archivedAt || '',
    'Due Date': node.dueDate || '',
    'Parent issue': node.parent?.identifier || '',
    Initiatives: '',
    'Project Milestone ID': '',
    'Project Milestone': '',
    'SLA Status': '',
    UUID: node.id || '',
    'Time in status (minutes)': '',
    'Related to': '',
    'Blocked by': '',
    'Duplicate of': '',
  };
}

export default async function(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const API_KEY = Deno.env.get('API_KEY');
  const BASE_URL = Deno.env.get('INSFORGE_BASE_URL');

  try {
    // Get the latest Updated timestamp from DB
    const latestResult = await dbQuery(BASE_URL, API_KEY,
      `SELECT "Updated" FROM linear_tasks ORDER BY "Updated" DESC LIMIT 1`
    );

    let updatedAfter = null;
    if (latestResult.rows && latestResult.rows.length > 0 && latestResult.rows[0].Updated) {
      const d = new Date(latestResult.rows[0].Updated);
      if (!isNaN(d.getTime())) {
        updatedAfter = d.toISOString();
      }
    }

    // Fetch all issues updated since last sync (paginated)
    let allIssues = [];
    let cursor = null;
    let page = 0;

    while (true) {
      const variables = { after: cursor };
      if (updatedAfter) variables.updatedAfter = updatedAfter;

      const data = await linearQuery(ISSUES_QUERY, variables);
      const nodes = data.issues.nodes || [];
      allIssues = allIssues.concat(nodes.map(mapIssue));
      page++;

      if (!data.issues.pageInfo.hasNextPage || page > 20) break;
      cursor = data.issues.pageInfo.endCursor;
    }

    if (allIssues.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No new updates',
        synced: 0,
        lastSync: updatedAfter,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Upsert in batches of 25 (to keep SQL size manageable)
    let upserted = 0;
    for (let i = 0; i < allIssues.length; i += 25) {
      const batch = allIssues.slice(i, i + 25);
      const sql = buildUpsertSQL(batch);
      await dbQuery(BASE_URL, API_KEY, sql);
      upserted += batch.length;
    }

    return new Response(JSON.stringify({
      success: true,
      synced: upserted,
      pages: page,
      lastSync: updatedAfter,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: err.message,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
