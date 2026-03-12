/**
 * Shared utilities for flattening/assembling atlas tree nodes.
 *
 * A TreeNode tree is stored as flat rows in `atlas_nodes`, keyed by
 * (user_id, dimension, path) where `path` is the slugified ancestor chain.
 */

export interface TreeNode {
  name: string;
  status?: string;
  date?: string;
  desc?: string;
  quotes?: string[];
  feedback?: string;
  structure?: string[];
  verified?: boolean;
  children?: TreeNode[];
  owner?: string;
  supervisor?: string;
  support?: string;
  executor?: string;
  deadline?: string;
  timeline?: string;
}

export interface AtlasNodeRow {
  user_id: string;
  dimension: string;
  path: string;
  parent_path: string | null;
  sort_order: number;
  depth: number;
  name: string;
  status: string | null;
  date: string | null;
  description: string | null;
  quotes: string[] | null;
  verified: boolean | null;
  extra: Record<string, unknown> | null;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');
}

export function flattenTree(
  dimension: string,
  root: TreeNode,
  userId: string,
): AtlasNodeRow[] {
  const rows: AtlasNodeRow[] = [];

  function walk(node: TreeNode, parentPath: string | null, depth: number, sortOrder: number): void {
    const slug = slugify(node.name);
    const path = parentPath ? `${parentPath}/${slug}` : slug;

    // Capture ALL fields not handled by dedicated columns into extra
    const DEDICATED_KEYS = new Set(['name', 'status', 'date', 'desc', 'quotes', 'verified', 'children']);
    const extra: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (!DEDICATED_KEYS.has(key) && value !== undefined && value !== null) {
        extra[key] = value;
      }
    }

    rows.push({
      user_id: userId,
      dimension,
      path,
      parent_path: parentPath,
      sort_order: sortOrder,
      depth,
      name: node.name,
      status: node.status ?? null,
      date: node.date ?? null,
      description: node.desc ?? null,
      quotes: node.quotes?.length ? node.quotes : null,
      verified: node.verified ?? null,
      extra: Object.keys(extra).length > 0 ? extra : null,
    });

    if (node.children) {
      node.children.forEach((child, i) => walk(child, path, depth + 1, i));
    }
  }

  walk(root, null, 0, 0);
  return rows;
}

export function assembleTree(rows: AtlasNodeRow[]): TreeNode {
  // Sort by depth then sort_order for deterministic build
  const sorted = [...rows].sort((a, b) => a.depth - b.depth || a.sort_order - b.sort_order);

  const nodeMap = new Map<string, TreeNode>();

  for (const row of sorted) {
    const node: TreeNode = { name: row.name };
    if (row.status) node.status = row.status;
    if (row.date) node.date = row.date;
    if (row.description) node.desc = row.description;
    if (row.quotes) node.quotes = row.quotes;
    if (row.verified != null) node.verified = row.verified;
    // Restore ALL extra fields onto the node
    if (row.extra && typeof row.extra === 'object') {
      Object.assign(node, row.extra);
    }

    nodeMap.set(row.path, node);

    if (row.parent_path) {
      const parent = nodeMap.get(row.parent_path);
      if (parent) {
        if (!parent.children) parent.children = [];
        parent.children.push(node);
      }
    }
  }

  // Root is the first node (depth 0)
  return sorted.length > 0 ? nodeMap.get(sorted[0].path)! : { name: '' };
}
