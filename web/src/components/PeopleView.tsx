import { useState, useMemo } from 'react';
import { ChevronRight, Search, X } from 'lucide-react';
import type { TreeNode } from '../types';

interface PeopleViewProps {
  treeData: TreeNode;
}

interface PersonRow {
  name: string;
  category: string;
  status?: string;
  date?: string;
  desc?: string;
  fullContent?: string;
  sortDate: number; // for sorting by most recent
  hasChildren: boolean;
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  final: { label: 'Active', cls: 'people-status-active' },
  chosen: { label: 'Engaged', cls: 'people-status-engaged' },
  partial: { label: 'Partial', cls: 'people-status-partial' },
  abandoned: { label: 'Inactive', cls: 'people-status-inactive' },
  origin: { label: 'Origin', cls: 'people-status-origin' },
};

/** Parse a date string like "Mar 7" or "Feb 26" into a sortable ordinal */
function parseDateOrd(dateStr?: string): number {
  if (!dateStr) return 0;
  const months: Record<string, number> = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
  // Find the last "Mon DD" pattern in the string for most recent date
  const matches = [...dateStr.matchAll(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\b/g)];
  if (matches.length === 0) return 0;
  const last = matches[matches.length - 1];
  const m = months[last[1]] || 0;
  const d = parseInt(last[2], 10);
  return m * 100 + d;
}

/** Recursively flatten all non-root nodes into table rows */
function flattenPeople(tree: TreeNode): PersonRow[] {
  const rows: PersonRow[] = [];

  function walk(node: TreeNode, breadcrumb: string[]) {
    for (const child of node.children ?? []) {
      const category = breadcrumb.length > 0 ? breadcrumb.join(' > ') : '';
      rows.push({
        name: child.name,
        category,
        status: child.status,
        date: child.date,
        desc: child.desc,
        fullContent: (child as any).full_content,
        sortDate: parseDateOrd(child.date),
        hasChildren: !!(child.children && child.children.length > 0),
      });
      walk(child, [...breadcrumb, child.name]);
    }
  }

  // Start from root's children (depth-1 categories)
  for (const cat of tree.children ?? []) {
    rows.push({
      name: cat.name,
      category: '',
      status: cat.status,
      date: cat.date,
      desc: cat.desc,
      fullContent: (cat as any).full_content,
      sortDate: parseDateOrd(cat.date),
      hasChildren: !!(cat.children && cat.children.length > 0),
    });
    walk(cat, [cat.name]);
  }

  return rows;
}

/** Minimal markdown→HTML: headings, bold, links, lists, blockquotes, paragraphs */
function renderMarkdown(md: string): string {
  return md
    .split('\n\n')
    .map(block => {
      block = block.trim();
      if (!block) return '';
      // Headings
      if (block.startsWith('## ')) return `<h3>${block.slice(3)}</h3>`;
      if (block.startsWith('### ')) return `<h4>${block.slice(4)}</h4>`;
      // Blockquote
      if (block.startsWith('> ')) {
        const text = block.replace(/^> /gm, '');
        return `<blockquote>${inlineFormat(text)}</blockquote>`;
      }
      // List (- items)
      const lines = block.split('\n');
      if (lines.every(l => l.match(/^\s*-\s/))) {
        const items = lines.map(l => `<li>${inlineFormat(l.replace(/^\s*-\s+/, ''))}</li>`).join('');
        return `<ul>${items}</ul>`;
      }
      // Numbered list
      if (lines.every(l => l.match(/^\s*\d+\.\s/))) {
        const items = lines.map(l => `<li>${inlineFormat(l.replace(/^\s*\d+\.\s+/, ''))}</li>`).join('');
        return `<ol>${items}</ol>`;
      }
      return `<p>${inlineFormat(block.replace(/\n/g, ' '))}</p>`;
    })
    .join('');
}

function inlineFormat(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(https?:\/\/[^\s<]+)/g, (match, url) => {
      // Don't double-wrap URLs already in <a> tags
      if (text.indexOf(`href="${url}"`) !== -1) return match;
      return `<a href="${url}" target="_blank" rel="noopener">${url}</a>`;
    });
}

function getSummaryText(row: PersonRow): string {
  const src = row.desc || row.fullContent || '';
  // Get meaningful text, skip markdown headings
  return src.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).join(' ').replace(/\*\*/g, '');
}

function PersonModal({ row, onClose }: { row: PersonRow; onClose: () => void }) {
  const content = row.fullContent || row.desc;
  return (
    <div className="people-modal-overlay" onClick={onClose}>
      <div className="people-modal" onClick={e => e.stopPropagation()}>
        <div className="people-modal-header">
          <h3>{row.name}</h3>
          {row.date && <span className="people-modal-date">{row.date}</span>}
          <button className="people-modal-close" onClick={onClose}>{'\u2715'}</button>
        </div>
        <div className="people-modal-body">
          {content ? (
            row.fullContent
              ? <div className="people-detail-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(row.fullContent) }} />
              : <p className="people-detail-text">{row.desc}</p>
          ) : (
            <p className="people-detail-text" style={{ fontStyle: 'italic' }}>No details available.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PersonTableRow({ row }: { row: PersonRow }) {
  const [showModal, setShowModal] = useState(false);
  const summary = getSummaryText(row);
  const hasDetail = !!(row.fullContent || row.desc);

  return (
    <>
      <div className={`people-row${hasDetail ? ' people-row-clickable' : ''}`} onClick={() => hasDetail && setShowModal(true)}>
        <span className="people-name-cell people-name">{row.name}</span>
        <div className="people-summary-cell">{summary}</div>
        <span className="people-date">{row.date ?? '-'}</span>
      </div>
      {showModal && <PersonModal row={row} onClose={() => setShowModal(false)} />}
    </>
  );
}

export function PeopleView({ treeData }: PeopleViewProps) {
  const [filter, setFilter] = useState('');
  const [sortCol, setSortCol] = useState<'date' | 'name'>('date');
  const [sortAsc, setSortAsc] = useState(false);

  const allPeople = useMemo(() => flattenPeople(treeData), [treeData]);

  const filtered = useMemo(() => {
    let rows = allPeople;
    if (filter) {
      const lf = filter.toLowerCase();
      rows = rows.filter(r =>
        r.name.toLowerCase().includes(lf) ||
        (r.desc ?? '').toLowerCase().includes(lf) ||
        (r.fullContent ?? '').toLowerCase().includes(lf) ||
        (r.date ?? '').toLowerCase().includes(lf)
      );
    }
    const sorted = [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case 'date': cmp = a.sortDate - b.sortDate; break;
        case 'name': cmp = a.name.localeCompare(b.name); break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return sorted;
  }, [allPeople, filter, sortCol, sortAsc]);

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(col === 'name'); }
  };

  const sortIcon = (col: typeof sortCol) =>
    sortCol === col ? (sortAsc ? ' \u2191' : ' \u2193') : '';

  return (
    <div className="people-view">
      <div className="people-header">
        <h2 className="people-title">People</h2>
        <span className="people-summary">{filtered.length} of {allPeople.length} people</span>
      </div>

      <div className="conv-search-bar">
        <Search size={14} className="conv-search-icon" />
        <input
          type="text"
          placeholder="Filter people by name, category, status..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        {filter && (
          <button className="conv-search-clear" onClick={() => setFilter('')}>
            <X size={12} />
          </button>
        )}
      </div>

      <div className="people-table-wrap">
        <div className="people-row-header">
          <span className="people-name-cell sortable" onClick={() => handleSort('name')}>Name{sortIcon('name')}</span>
          <span className="people-summary-cell" style={{ fontWeight: 600 }}>Summary</span>
          <span className="people-date sortable" onClick={() => handleSort('date')}>Updated{sortIcon('date')}</span>
        </div>
        {filtered.map((row, i) => (
          <PersonTableRow key={i} row={row} />
        ))}
        {filtered.length === 0 && (
          <div className="people-empty">No people match your filter.</div>
        )}
      </div>
    </div>
  );
}
