import { useState, useMemo, useEffect } from 'react';
import { ChevronRight, Circle, CheckCircle2, Clock, Mail, CalendarCheck, Settings2 } from 'lucide-react';
import { collectDates, parseDateOrdinal, TimelineBar } from './MarkmapView';
import { findDateIndex } from '../hooks/useTimelineCutoff';
import type { TimelineRange } from '../hooks/useTimelineCutoff';
import type { TreeNode } from '../types';

interface TodoViewProps {
  treeData: TreeNode;
  timelineRange: TimelineRange;
  onTimelineRangeChange: (range: Partial<TimelineRange>) => void;
}

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

function StatusIcon({ status }: { status?: string }) {
  if (status === 'done') return <CheckCircle2 size={16} className="todo-icon done" />;
  if (status === 'partial') return <Circle size={16} className="todo-icon pending" />;
  return <Circle size={16} className="todo-icon default" />;
}

function TodoItem({ node }: { node: TreeNode }) {
  return (
    <div className="todo-item">
      <StatusIcon status={node.status} />
      <div className="todo-item-content">
        <span className="todo-item-name">{node.name}</span>
        {node.date && <span className="todo-item-date">{node.date}</span>}
      </div>
    </div>
  );
}

function TodoCategory({ node }: { node: TreeNode }) {
  const [expanded, setExpanded] = useState(true);
  const count = node.children?.length ?? 0;
  const icon = CATEGORY_ICONS[node.name] || <Circle size={16} />;

  return (
    <div className="todo-category">
      <button className="todo-category-header" onClick={() => setExpanded(!expanded)}>
        <ChevronRight size={14} className={`todo-chevron${expanded ? ' expanded' : ''}`} />
        <span className="todo-category-icon">{icon}</span>
        <span className="todo-category-name">{node.name}</span>
        <span className="todo-category-count">{count}</span>
      </button>
      {expanded && node.children && (
        <div className="todo-category-items">
          {node.children.map((child, i) => (
            <TodoItem key={i} node={child} />
          ))}
        </div>
      )}
    </div>
  );
}

export function TodoView({ treeData, timelineRange, onTimelineRangeChange }: TodoViewProps) {
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
  const totalTasks = categories.reduce((sum, cat) => sum + (cat.children?.length ?? 0), 0);

  return (
    <div className="todo-view">
      <div className="todo-header">
        <h2 className="todo-title">{treeData.name}</h2>
        <span className="todo-summary">{totalTasks} items across {categories.length} categories</span>
      </div>
      <div className="todo-list">
        {categories.map((cat, i) => (
          <TodoCategory key={i} node={cat} />
        ))}
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
