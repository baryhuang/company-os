import { createClient } from 'npm:@insforge/sdk';

export default async function(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const client = createClient({
    baseUrl: Deno.env.get('INSFORGE_BASE_URL'),
    anonKey: Deno.env.get('ANON_KEY'),
  });

  const url = new URL(req.url);

  // Parse action from query param: ?action=dimensions or ?action=data&name=market
  const action = url.searchParams.get('action');
  const name = url.searchParams.get('name');

  try {
    // GET dimensions
    if (req.method === 'GET' && action === 'dimensions') {
      const { data: blob, error } = await client.storage
        .from('atlas-data')
        .download('dimensions.json');

      if (error) {
        return new Response(JSON.stringify({ error: 'dimensions.json not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const text = await blob.text();
      return new Response(text, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET data/{name}
    if (req.method === 'GET' && action === 'data' && name) {
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        return new Response(JSON.stringify({ error: 'Invalid resource name' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: blob, error } = await client.storage
        .from('atlas-data')
        .download(`${name}.json`);

      if (error) {
        return new Response(JSON.stringify({ error: `${name}.json not found` }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const text = await blob.text();
      return new Response(text, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // PUT data/{name} — sync to DB tables
    if (req.method === 'PUT' && action === 'data' && name) {
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        return new Response(JSON.stringify({ error: 'Invalid resource name' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const userId = url.searchParams.get('user_id') || '__default__';
      const body = await req.json();
      const now = new Date().toISOString();

      const DOC_KEYS = new Set(['dimensions', 'landscape', 'appointments-glance']);

      if (DOC_KEYS.has(name)) {
        // ── Document keys → atlas_documents ──
        const { error: delErr } = await client.database
          .from('atlas_documents')
          .delete()
          .eq('user_id', userId)
          .eq('doc_key', name);
        if (delErr) {
          return new Response(JSON.stringify({ error: `Failed to delete old document: ${delErr.message}` }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { error: insErr } = await client.database
          .from('atlas_documents')
          .insert({ user_id: userId, doc_key: name, data: body, updated_at: now });
        if (insErr) {
          return new Response(JSON.stringify({ error: `Failed to insert document: ${insErr.message}` }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // ── landscape special case: also sync atlas_competitors ──
        if (name === 'landscape' && body.categories) {
          const compRows = [];
          let sortOrder = 0;
          for (const cat of body.categories) {
            if (cat.companies) {
              for (const c of cat.companies) {
                compRows.push({
                  user_id: userId, section: cat.name,
                  best_owner: cat.best_owner || null, subcategory: null,
                  name: c.name, website: c.website || null,
                  category: c.category || null, primary_focus: c.primary_focus || null,
                  target_customer: c.target_customer || null,
                  pricing_model: c.pricing_model || null, price_range: c.price_range || null,
                  funding: c.funding || null,
                  serves_cna: c.serves_cna || false, serves_rn: c.serves_rn || false,
                  uses_ai: c.uses_ai || false,
                  key_differentiator: c.key_differentiator || null,
                  relevance: c.relevance || null, threat: c.threat || 'low',
                  transcript_quotes: c.transcript_quotes || null,
                  added_date: c.date || null,
                  sort_order: sortOrder++, updated_at: now,
                });
              }
            }
            if (cat.subcategories) {
              for (const sub of cat.subcategories) {
                for (const c of (sub.companies || [])) {
                  compRows.push({
                    user_id: userId, section: cat.name,
                    best_owner: cat.best_owner || null, subcategory: sub.name,
                    name: c.name, website: c.website || null,
                    category: c.category || null, primary_focus: c.primary_focus || null,
                    target_customer: c.target_customer || null,
                    pricing_model: c.pricing_model || null, price_range: c.price_range || null,
                    funding: c.funding || null,
                    serves_cna: c.serves_cna || false, serves_rn: c.serves_rn || false,
                    uses_ai: c.uses_ai || false,
                    key_differentiator: c.key_differentiator || null,
                    relevance: c.relevance || null, threat: c.threat || 'low',
                    transcript_quotes: c.transcript_quotes || null,
                    added_date: c.date || null,
                    sort_order: sortOrder++, updated_at: now,
                  });
                }
              }
            }
          }
          if (compRows.length > 0) {
            await client.database.from('atlas_competitors').delete().eq('user_id', userId);
            const BATCH = 50;
            for (let i = 0; i < compRows.length; i += BATCH) {
              await client.database.from('atlas_competitors').insert(compRows.slice(i, i + BATCH));
            }
          }
        }

        return new Response(JSON.stringify({ status: 'saved', target: 'atlas_documents', key: name }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      } else {
        // ── Tree dimensions → atlas_nodes ──
        function slugify(s) {
          return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
        }

        const DEDICATED_KEYS = new Set(['name', 'status', 'date', 'desc', 'quotes', 'verified', 'children']);

        function flattenTree(dimension, root, uid) {
          const rows = [];
          function walk(node, parentPath, depth, sortOrd) {
            const slug = slugify(node.name);
            const path = parentPath ? `${parentPath}/${slug}` : slug;
            const extra = {};
            for (const [key, value] of Object.entries(node)) {
              if (!DEDICATED_KEYS.has(key) && value !== undefined && value !== null) {
                extra[key] = value;
              }
            }
            rows.push({
              user_id: uid, dimension, path,
              parent_path: parentPath,
              sort_order: sortOrd, depth,
              name: node.name,
              status: node.status ?? null,
              date: node.date ?? null,
              description: node.desc ?? null,
              quotes: node.quotes?.length ? node.quotes : null,
              verified: node.verified ?? null,
              extra: Object.keys(extra).length > 0 ? extra : null,
              updated_at: now,
            });
            if (node.children) {
              node.children.forEach((child, i) => walk(child, path, depth + 1, i));
            }
          }
          walk(root, null, 0, 0);
          return rows;
        }

        const nodeRows = flattenTree(name, body, userId);

        // Delete existing rows for this dimension + user
        const { error: delErr } = await client.database
          .from('atlas_nodes')
          .delete()
          .eq('user_id', userId)
          .eq('dimension', name);
        if (delErr) {
          return new Response(JSON.stringify({ error: `Failed to delete old nodes: ${delErr.message}` }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Insert in batches
        const BATCH = 50;
        for (let i = 0; i < nodeRows.length; i += BATCH) {
          const { error: batchErr } = await client.database
            .from('atlas_nodes')
            .insert(nodeRows.slice(i, i + BATCH));
          if (batchErr) {
            return new Response(JSON.stringify({ error: `Failed to insert nodes batch: ${batchErr.message}` }), {
              status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }

        return new Response(JSON.stringify({ status: 'saved', target: 'atlas_nodes', dimension: name, rows: nodeRows.length }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Not found. Use ?action=dimensions or ?action=data&name=<name>' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
