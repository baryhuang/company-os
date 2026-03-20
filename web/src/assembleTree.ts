import type { TreeNode } from './types';

interface AtlasNodeRow {
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

export function assembleTree(rows: AtlasNodeRow[], dimension?: string): TreeNode {
  const sorted = [...rows].sort((a, b) => a.depth - b.depth || a.sort_order - b.sort_order);
  const nodeMap = new Map<string, TreeNode>();

  for (const row of sorted) {
    const node: TreeNode = { name: row.name, _path: row.path };
    if (dimension) node._dimension = dimension;
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

  return sorted.length > 0 ? nodeMap.get(sorted[0].path)! : { name: '' };
}
