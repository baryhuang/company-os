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

    const extra: Record<string, unknown> = {};
    if (node.feedback) extra.feedback = node.feedback;
    if (node.structure) extra.structure = node.structure;
    if (node.owner) extra.owner = node.owner;
    if (node.supervisor) extra.supervisor = node.supervisor;
    if (node.support) extra.support = node.support;
    if (node.executor) extra.executor = node.executor;
    if (node.deadline) extra.deadline = node.deadline;
    if (node.timeline) extra.timeline = node.timeline;

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
    if (row.extra) {
      if (typeof row.extra === 'object') {
        if ('feedback' in row.extra) node.feedback = row.extra.feedback as string;
        if ('structure' in row.extra) node.structure = row.extra.structure as string[];
        if ('owner' in row.extra) node.owner = row.extra.owner as string;
        if ('supervisor' in row.extra) node.supervisor = row.extra.supervisor as string;
        if ('support' in row.extra) node.support = row.extra.support as string;
        if ('executor' in row.extra) node.executor = row.extra.executor as string;
        if ('deadline' in row.extra) node.deadline = row.extra.deadline as string;
        if ('timeline' in row.extra) node.timeline = row.extra.timeline as string;
      }
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
