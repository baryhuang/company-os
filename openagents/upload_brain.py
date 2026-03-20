#!/usr/bin/env python3
"""
Upload all Company Brain dimensions to the atlas API.

Scans $BRAIN/ for dimension directories, parses each _index.md → JSON tree,
and PUTs to the Company Brain DB.

Usage:
    python3 upload_brain.py                  # upload all dimensions
    python3 upload_brain.py moat market      # upload specific dimensions
"""

import json
import os
import re
import sys
import urllib.request

API = os.environ.get("ATLAS_API_URL", "")
UID = os.environ.get("ATLAS_USER_ID", "")
BRAIN = os.path.dirname(os.path.abspath(__file__))


def parse_index_md(filepath):
    """Parse _index.md into a JSON tree, including inline descriptions and detail files."""
    dim_dir = os.path.dirname(filepath)

    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # Extract title from first # heading (used as synthetic root name if needed)
    title = None
    for line in lines:
        hm = re.match(r'^#\s+(.+)$', line)
        if hm:
            title = hm.group(1).strip()
            break

    # Stack-based parser: (depth, node)
    root = None
    root_depth = 0
    stack = []  # [(depth, node), ...]
    last_node = None
    last_node_depth = 0

    for line in lines:
        # Skip title line and blank lines
        if not line.strip() or line.startswith('#'):
            continue

        # Match: "  - **Node Name** | date: Mar 12 | status: chosen | file: xxx.md"
        match = re.match(r'^(\s*)- \*\*(.+?)\*\*(.*)$', line)
        if match:
            indent = len(match.group(1))
            depth = indent // 2
            name = match.group(2)
            rest = match.group(3).strip()

            # Parse metadata from "|"-separated fields
            node = {"name": name, "children": []}
            if rest:
                for part in rest.split('|'):
                    part = part.strip()
                    if ':' in part:
                        key, _, val = part.partition(':')
                        key = key.strip()
                        val = val.strip()
                        if val:
                            node[key] = val

            if root is None:
                root = node
                root_depth = depth
                wrapped = False
                stack = [(depth, root)]
            else:
                # Pop stack to find parent
                while stack and stack[-1][0] >= depth:
                    stack.pop()

                if stack:
                    parent = stack[-1][1]
                    parent["children"].append(node)
                elif depth == root_depth:
                    # Sibling at root level — wrap in synthetic root
                    if not wrapped:
                        root = {"name": title or os.path.basename(dim_dir), "children": [root, node]}
                        wrapped = True
                    else:
                        root["children"].append(node)

                stack.append((depth, node))

            last_node = node
            last_node_depth = depth
        else:
            # Non-node line: capture as inline description for the last node
            if last_node is not None:
                stripped = line.strip()
                if stripped:
                    if "desc" not in last_node:
                        last_node["desc"] = stripped
                    else:
                        last_node["desc"] += " " + stripped

    # Load detail .md files and merge desc/quotes into nodes
    _load_detail_files(root, dim_dir)

    return root


def _load_detail_files(node, dim_dir):
    """Recursively load detail .md files for nodes that reference them."""
    if node is None:
        return

    if "file" in node:
        detail_path = os.path.join(dim_dir, node["file"])
        if os.path.exists(detail_path):
            if detail_path.endswith("_index.md"):
                # Nested _index.md → parse as sub-tree and merge children
                sub_tree = parse_index_md(detail_path)
                if sub_tree and sub_tree.get("children"):
                    node["children"] = sub_tree["children"]
            else:
                detail = _parse_detail_md(detail_path)
                # Merge detail into node (detail file takes priority over inline desc)
                if "desc" in detail:
                    node["desc"] = detail["desc"]
                if "quotes" in detail:
                    node["quotes"] = detail["quotes"]
                if "full_content" in detail:
                    node["full_content"] = detail["full_content"]

    for child in node.get("children", []):
        _load_detail_files(child, dim_dir)


def _parse_detail_md(filepath):
    """Parse a detail .md file and extract desc, quotes, and full content."""
    result = {}
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Extract desc section
    desc_match = re.search(r'## desc\s*\n(.*?)(?=\n## |\Z)', content, re.DOTALL)
    if desc_match:
        result["desc"] = desc_match.group(1).strip()

    # Extract quotes section
    quotes_match = re.search(r'## quotes\s*\n(.*?)(?=\n## |\Z)', content, re.DOTALL)
    if quotes_match:
        quotes_text = quotes_match.group(1).strip()
        quotes = [q.strip().lstrip('- ').strip('"') for q in quotes_text.split('\n') if q.strip().startswith('-')]
        if quotes:
            result["quotes"] = quotes

    # Capture full markdown content (everything after frontmatter header + metadata)
    # Strip the "# Title" line and "- **key**: val" metadata lines at the top
    lines = content.split('\n')
    body_start = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        # Skip title, blank lines, and frontmatter metadata (- **key**: val)
        if not stripped or stripped.startswith('# ') or re.match(r'^- \*\*\w+\*\*:', stripped):
            body_start = i + 1
        else:
            break
    body = '\n'.join(lines[body_start:]).strip()
    if body:
        result["full_content"] = body

    return result


def count_nodes(tree):
    """Count total nodes in a tree."""
    if tree is None:
        return 0
    n = 1
    for child in tree.get("children", []):
        n += count_nodes(child)
    return n


def upload_dimension(name, tree):
    """PUT a dimension tree to the API."""
    url = f"{API}?action=data&name={name}&user_id={UID}"
    data = json.dumps(tree, ensure_ascii=False).encode('utf-8')

    req = urllib.request.Request(
        url,
        data=data,
        method='PUT',
        headers={'Content-Type': 'application/json'}
    )

    try:
        resp = urllib.request.urlopen(req)
        result = json.loads(resp.read().decode())
        return True, result
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        return False, {"error": body, "status": e.code}
    except Exception as e:
        return False, {"error": str(e)}


def main():
    if not API or not UID:
        print("Error: ATLAS_API_URL and ATLAS_USER_ID environment variables are required.")
        sys.exit(1)

    # Find all dimension directories
    all_dims = sorted([
        d for d in os.listdir(BRAIN)
        if os.path.isdir(os.path.join(BRAIN, d))
        and os.path.exists(os.path.join(BRAIN, d, "_index.md"))
    ])

    # Filter to specific dimensions if args provided
    if len(sys.argv) > 1:
        requested = sys.argv[1:]
        dims = [d for d in requested if d in all_dims]
        missing = [d for d in requested if d not in all_dims]
        if missing:
            print(f"⚠️  Not found: {', '.join(missing)}")
    else:
        dims = all_dims

    print(f"Found {len(dims)} dimensions: {', '.join(dims)}")
    print()

    success = 0
    failed = 0
    total_nodes = 0

    for dim in dims:
        index_path = os.path.join(BRAIN, dim, "_index.md")
        tree = parse_index_md(index_path)

        if tree is None:
            print(f"⚠️  {dim}: could not parse _index.md")
            failed += 1
            continue

        nodes = count_nodes(tree)
        total_nodes += nodes

        print(f"📤 {dim}: {nodes} nodes → uploading... ", end="", flush=True)
        ok, result = upload_dimension(dim, tree)

        if ok:
            rows = result.get("rows", "?")
            print(f"✅ saved, rows: {rows}")
            success += 1
        else:
            print(f"❌ {result.get('error', 'unknown error')}")
            failed += 1

    print()
    print(f"SUMMARY: {len(dims)} dimensions, {total_nodes} nodes, "
          f"Success: {success}, Failed: {failed}")


if __name__ == '__main__':
    main()