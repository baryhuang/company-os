import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ChevronRight, Circle, CheckCircle2, Clock, Mail, CalendarCheck, Settings2, XCircle, User, CalendarDays, FileText } from 'lucide-react';
import { collectDates, parseDateOrdinal, TimelineBar } from './MarkmapView';
import { findDateIndex } from '../hooks/useTimelineCutoff';
import { updateNodeStatus } from '../api';
import type { TimelineRange } from '../hooks/useTimelineCutoff';
import type { TreeNode } from '../types';

interface TodoViewProps {
  treeData: TreeNode;
  userId: string;
  onRefetch: () => Promise<void>;
  timelineRange: TimelineRange;
  onTimelineRangeChange: (range: Partial<TimelineRange>) => void;
}

const STATUS_CYCLE = ['partial', 'pending', 'final', 'excluded'] as const;
const STATUS_LABEL: Record<string, string> = {
  partial: 'Todo',
  pending: 'Pending',
  final: 'Done',
  excluded: 'Excluded',
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'Email Follow-ups & Replies': <Mail size={16} />,
  'Meeting Action Items': <CalendarCheck size={16} />,
  'Prep & Deadlines': <Clock size={16} />,
  'Internal Ops & Setup': <Settings2 size={16} />,
};

function filterTreeByDate(node: TreeNode, startOrd: number, endOrd: number): TreeNode | null {
  const ord = parseDateOrdinal(node.date || '');
  const isLeaf = !node.children || node.children.length === 0;

  if (isLeaf) {
    // Leaf: keep if no date (structural) or date in range
    if (ord === null) return node;
    return (ord >= startOrd && ord <= endOrd) ? node : null;
  }

  // Branch: filter children recursively
  const filteredChildren = node.children!
    .map(c => filterTreeByDate(c, startOrd, endOrd))
    .filter((c): c is TreeNode => c !== null);

  // Keep branch if it has any children remaining
  if (filteredChildren.length === 0 && ord !== null && (ord < startOrd || ord > endOrd)) {
    return null;
  }

  return { ...node, children: filteredChildren };
}

const STATUS_LABELS: Record<string, string> = {
  done: 'Done', final: 'Done', partial: 'In Progress', excluded: 'Excluded',
};

function StatusIcon({ status }: { status?: string }) {
  if (status === 'done' || status === 'final') return <CheckCircle2 size={16} className="todo-icon done" />;
  if (status === 'excluded') return <XCircle size={16} className="todo-icon excluded" />;
  if (status === 'pending') return <Clock size={16} className="todo-icon pending-status" />;
  return <Circle size={16} className="todo-icon default" />;
}

function TodoItem({ node }: { node: TreeNode }) {
  const [showDetail, setShowDetail] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemRef = useRef<HTMLDivElement>(null);

  const owner = node.owner as string | undefined;
  const due = (node as any).due as string | undefined;
  const file = (node as any).file as string | undefined;
  const hasDetails = owner || due || file || node.desc || node.status;

  const handleEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowDetail(true), 300);
  };
  const handleLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShowDetail(false);
  };

  return (
    <div
      ref={itemRef}
      className={`todo-item${showDetail ? ' detail-open' : ''}`}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <StatusIcon status={node.status} />
      <div className="todo-item-content">
        <span className="todo-item-name">{node.name}</span>
        {node.date && <span className="todo-item-date">{node.date}</span>}
      </div>
      {showDetail && hasDetails && (
        <div className="todo-item-detail">
          {node.status && (
            <span className={`todo-detail-tag status-${node.status}`}>
              {STATUS_LABELS[node.status] ?? node.status}
            </span>
          )}
          {owner && (
            <span className="todo-detail-tag"><User size={10} /> {owner}</span>
          )}
          {due && (
            <span className="todo-detail-tag due"><CalendarDays size={10} /> Due {due}</span>
          )}
          {file && (
            <span className="todo-detail-tag file"><FileText size={10} /> {file}</span>
          )}
          {node.desc && (
            <span className="todo-detail-desc">{node.desc}</span>
          )}
        </div>
      )}
    </div>
  );
}

const DONE_STATUSES = new Set(['done', 'final', 'excluded']);

function isDone(node: TreeNode): boolean {
  return DONE_STATUSES.has(node.status || '');
}

interface FlatItem {
  node: TreeNode;
  category: string;
}

/** Recursively collect actionable items from a category subtree.
 *  "origin" nodes are structural groupings — recurse into their children.
 *  Non-origin nodes (or leaf nodes) are actionable items to display. */
function collectItems(node: TreeNode, category: string): FlatItem[] {
  const status = node.status || '';
  const isGrouping = status === 'origin' || status === '';
  const hasChildren = node.children && node.children.length > 0;

  if (isGrouping && hasChildren) {
    return node.children!.flatMap(child => collectItems(child, category));
  }

  return [{ node, category }];
}

function SectionHeader({ icon, label, count, expanded, onToggle }: {
  icon: React.ReactNode;
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <tr className="todo-table-section-row" onClick={onToggle} style={{ cursor: 'pointer' }}>
      <td colSpan={5}>
        <div className="todo-table-section-header">
          <ChevronRight size={14} className={`todo-chevron${expanded ? ' expanded' : ''}`} />
          {icon}
          <span className="todo-table-section-label">{label}</span>
          <span className="todo-category-count">{count}</span>
        </div>
      </td>
    </tr>
  );
}

function getOwner(node: TreeNode): string {
  return (node.owner as string | undefined) || 'Unassigned';
}

function groupByOwner(items: FlatItem[]): { owner: string; items: FlatItem[] }[] {
  const map = new Map<string, FlatItem[]>();
  for (const item of items) {
    const owner = getOwner(item.node);
    if (!map.has(owner)) map.set(owner, []);
    map.get(owner)!.push(item);
  }
  // Sort: assigned owners alphabetically, "Unassigned" last
  return [...map.entries()]
    .sort(([a], [b]) => {
      if (a === 'Unassigned') return 1;
      if (b === 'Unassigned') return -1;
      return a.localeCompare(b);
    })
    .map(([owner, items]) => ({ owner, items }));
}

function OwnerSubHeader({ owner, count }: { owner: string; count: number }) {
  return (
    <tr className="todo-table-owner-row">
      <td colSpan={5}>
        <div className="todo-table-owner-header">
          <User size={12} />
          <span>{owner}</span>
          <span className="todo-category-count">{count}</span>
        </div>
      </td>
    </tr>
  );
}

function SectionItems({ items, onStatusChange }: { items: FlatItem[]; onStatusChange: (node: TreeNode, newStatus: string) => void }) {
  const groups = useMemo(() => groupByOwner(items), [items]);
  return (
    <>
      {groups.map((g) => (
        <React.Fragment key={g.owner}>
          <OwnerSubHeader owner={g.owner} count={g.items.length} />
          {g.items.map((item, i) => (
            <ItemRow key={i} item={item} onStatusChange={onStatusChange} />
          ))}
        </React.Fragment>
      ))}
    </>
  );
}

function ItemRow({ item, onStatusChange }: { item: FlatItem; onStatusChange: (node: TreeNode, newStatus: string) => void }) {
  const { node, category } = item;
  const owner = node.owner as string | undefined;
  const due = (node as any).due as string | undefined;
  const file = (node as any).file as string | undefined;
  const currentStatus = node.status || 'partial';
  const [expanded, setExpanded] = useState(false);
  const hasDetails = node.desc || due || file;

  return (
    <>
      <tr
        className={`todo-table-row${isDone(node) ? ' done' : ''}${hasDetails ? ' clickable' : ''}${expanded ? ' expanded' : ''}`}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <td className="todo-table-status">
          <div className="todo-status-wrapper">
            <StatusIcon status={currentStatus} />
            <select
              className="todo-status-overlay"
              value={currentStatus}
              onChange={(e) => { e.stopPropagation(); onStatusChange(node, e.target.value); }}
            >
              {STATUS_CYCLE.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
        </td>
        <td className="todo-table-name">
          {node.name}
          {hasDetails && <ChevronRight size={12} className={`todo-row-chevron${expanded ? ' expanded' : ''}`} />}
        </td>
        <td className="todo-table-tag"><span className="todo-tag-chip">{category}</span></td>
        <td className="todo-table-owner">{owner && <span><User size={12} /> {owner}</span>}</td>
        <td className="todo-table-date">{node.date || ''}</td>
      </tr>
      {expanded && hasDetails && (
        <tr className="todo-table-detail-row">
          <td></td>
          <td colSpan={4}>
            <div className="todo-detail-content">
              {node.desc && <p className="todo-detail-desc">{node.desc}</p>}
              {due && <span className="todo-detail-tag due"><CalendarDays size={10} /> Due {due}</span>}
              {file && <span className="todo-detail-tag file"><FileText size={10} /> {file}</span>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function TodoView({ treeData, userId, onRefetch, timelineRange, onTimelineRangeChange }: TodoViewProps) {
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});

  const handleStatusChange = useCallback(async (node: TreeNode, newStatus: string) => {
    const path = node._path;
    const dimension = node._dimension;
    if (!path || !dimension) return;

    // Optimistic update
    setStatusOverrides(prev => ({ ...prev, [path]: newStatus }));
    try {
      await updateNodeStatus(userId, dimension, path, newStatus);
      // Refetch to get fresh data from DB
      await onRefetch();
      // Clear overrides since tree data is now fresh
      setStatusOverrides({});
    } catch (err) {
      console.error('Failed to update status:', err);
      // Revert on error
      setStatusOverrides(prev => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
    }
  }, [userId, onRefetch]);
  const allDates = useMemo(() => collectDates(treeData), [treeData]);

  const initialStart = timelineRange.startOrd != null && allDates.length > 0
    ? findDateIndex(allDates, timelineRange.startOrd) : 0;
  const initialEnd = timelineRange.endOrd != null && allDates.length > 0
    ? findDateIndex(allDates, timelineRange.endOrd) : allDates.length - 1;

  const [startIndex, setStartIndex] = useState(initialStart);
  const [endIndex, setEndIndex] = useState(initialEnd);

  useEffect(() => {
    if (timelineRange.startOrd != null && allDates.length > 0) {
      setStartIndex(findDateIndex(allDates, timelineRange.startOrd));
    } else {
      setStartIndex(0);
    }
    if (timelineRange.endOrd != null && allDates.length > 0) {
      setEndIndex(findDateIndex(allDates, timelineRange.endOrd));
    } else {
      setEndIndex(allDates.length - 1);
    }
  }, [allDates, timelineRange.startOrd, timelineRange.endOrd]);

  const filteredTree = useMemo(() => {
    const startOrd = allDates[startIndex] ?? 0;
    const endOrd = allDates[endIndex] ?? Infinity;
    return filterTreeByDate(treeData, startOrd, endOrd) ?? { ...treeData, children: [] };
  }, [treeData, allDates, startIndex, endIndex]);

  const categories = filteredTree.children ?? [];

  // Flatten all items with their category, apply overrides, sort by date descending, split into todo/pending/done
  const { activeItems, pendingItems, doneItems } = useMemo(() => {
    const raw: FlatItem[] = [];
    for (const cat of categories) {
      raw.push(...collectItems(cat, cat.name));
    }
    // Apply optimistic status overrides
    const all = raw.map(item => {
      if (item.node._path && statusOverrides[item.node._path]) {
        return { ...item, node: { ...item.node, status: statusOverrides[item.node._path] } };
      }
      return item;
    });
    // Sort by date descending (most recent first)
    all.sort((a, b) => {
      const aOrd = parseDateOrdinal(a.node.date || '') ?? 0;
      const bOrd = parseDateOrdinal(b.node.date || '') ?? 0;
      return bOrd - aOrd;
    });

    const active: FlatItem[] = [];
    const pending: FlatItem[] = [];
    const done: FlatItem[] = [];

    for (const item of all) {
      const status = item.node.status || 'partial';
      if (isDone(item.node)) {
        done.push(item);
      } else if (status === 'pending') {
        pending.push(item);
      } else {
        active.push(item);
      }
    }

    return { activeItems: active, pendingItems: pending, doneItems: done };
  }, [categories, statusOverrides]);

  const [todoExpanded, setTodoExpanded] = useState(true);
  const [pendingExpanded, setPendingExpanded] = useState(true);
  const [doneExpanded, setDoneExpanded] = useState(false);

  return (
    <div className="todo-view">
      <div className="todo-header">
        <h2 className="todo-title">{treeData.name}</h2>
        <span className="todo-summary">
          {activeItems.length} todo, {pendingItems.length} pending, {doneItems.length} done
        </span>
      </div>
      <div className="todo-list">
        <table className="todo-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}></th>
              <th>Title</th>
              <th style={{ width: 180 }}>Tag</th>
              <th style={{ width: 100 }}>Owner</th>
              <th style={{ width: 70 }}>Date</th>
            </tr>
          </thead>
          <tbody>
            <SectionHeader
              icon={<Circle size={16} />}
              label="Todo"
              count={activeItems.length}
              expanded={todoExpanded}
              onToggle={() => setTodoExpanded(!todoExpanded)}
            />
            {todoExpanded && <SectionItems items={activeItems} onStatusChange={handleStatusChange} />}
            <SectionHeader
              icon={<Clock size={16} />}
              label="Pending"
              count={pendingItems.length}
              expanded={pendingExpanded}
              onToggle={() => setPendingExpanded(!pendingExpanded)}
            />
            {pendingExpanded && <SectionItems items={pendingItems} onStatusChange={handleStatusChange} />}
            <SectionHeader
              icon={<CheckCircle2 size={16} />}
              label="Done"
              count={doneItems.length}
              expanded={doneExpanded}
              onToggle={() => setDoneExpanded(!doneExpanded)}
            />
            {doneExpanded && <SectionItems items={doneItems} onStatusChange={handleStatusChange} />}
          </tbody>
        </table>
      </div>
      <TimelineBar
        allDates={allDates}
        startIndex={startIndex}
        endIndex={endIndex}
        setStartIndex={setStartIndex}
        setEndIndex={setEndIndex}
        onRangeChange={onTimelineRangeChange}
      />
    </div>
  );
}
