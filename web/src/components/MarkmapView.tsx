import { useRef, useEffect, useState, useMemo } from 'react';
import { Markmap, deriveOptions } from 'markmap-view';
import type { TreeNode } from '../types';

export const statusColors: Record<string, string> = {
  origin: '#3a6da0', abandoned: '#c94040', chosen: '#3a7d44',
  partial: '#c07820', excluded: '#8a9e8c', final: '#2a8a7a',
};

export const statusIcons: Record<string, string> = {
  abandoned: '\u274C', chosen: '\u2713', partial: '\u25D0',
  final: '\u2605', excluded: '\u2014', origin: '\u25CF',
};

interface INode {
  content: string;
  children: INode[];
  payload?: Record<string, unknown>;
}

export function jsonToINode(node: TreeNode, depth = 0): INode {
  const color = statusColors[node.status || ''] || '#8a9e8c';
  const icon = statusIcons[node.status || ''] || '';
  const isAbandoned = node.status === 'abandoned' || node.status === 'excluded';
  const isFinal = node.status === 'final';

  const borderLeft = isFinal ? `3px solid ${color}` : `3px solid ${color}`;
  const border = isFinal ? '2px solid #2a8a7a' : '1px solid #d8d0c4';
  const opacity = isAbandoned ? 'opacity:0.55;' : '';

  let nameHtml = node.name;
  if (isAbandoned) nameHtml = `<del>${nameHtml}</del>`;
  if (isFinal) nameHtml = `<strong>${nameHtml}</strong>`;

  const hasDetails = (depth > 0 && node.date) || node.desc;

  let content: string;
  if (depth === 0) {
    // Root node: larger, no status icon
    content = `<div style="border:${border}; border-left:${borderLeft}; border-radius:6px; padding:8px 14px; background:#faf8f4; min-width:140px; ${opacity}">` +
      `<div style="font-weight:700; font-size:14px;">${nameHtml}</div>` +
      `</div>`;
  } else if (hasDetails) {
    // Node with date/desc: header + details
    const detailParts: string[] = [];
    if (node.date) detailParts.push(node.date);
    if (node.desc) detailParts.push(node.desc);
    content = `<div style="border:${border}; border-left:${borderLeft}; border-radius:6px; padding:6px 10px; background:#faf8f4; min-width:120px; ${opacity}">` +
      `<div style="font-weight:600; font-size:12px; margin-bottom:2px;">` +
        `<span style="color:${color}">${icon}</span> ${nameHtml}` +
      `</div>` +
      `<div style="font-size:10px; color:#918a80; border-top:1px solid #ede8df; padding-top:3px; margin-top:3px;">` +
        detailParts.join(' ') +
      `</div>` +
      `</div>`;
  } else {
    // Leaf node with no details: compact single-row card
    content = `<div style="border:${border}; border-left:${borderLeft}; border-radius:6px; padding:5px 10px; background:#faf8f4; min-width:100px; ${opacity}">` +
      `<div style="font-weight:600; font-size:12px;">` +
        `<span style="color:${color}">${icon}</span> ${nameHtml}` +
      `</div>` +
      `</div>`;
  }

  const dateOrd = parseDateOrdinal(node.date || '');
  const children = (node.children || []).map(c => jsonToINode(c, depth + 1));
  return { content, children, payload: dateOrd !== null ? { dateOrd } : undefined };
}

function cloneINode(node: INode): INode {
  return {
    content: node.content,
    children: (node.children || []).map(cloneINode),
    payload: node.payload ? { ...node.payload } : undefined,
  };
}

const MARKMAP_COLORS = ['#3a7d44', '#2a8a7a', '#c07820', '#6b5aa0', '#3a6da0', '#c94040', '#8a6d3b', '#5a7d8a', '#7a5a8a'];

/* ── Date parsing helpers ──────────────────────── */

const MONTH_MAP: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

export function parseDateOrdinal(dateStr: string): number | null {
  if (!dateStr) return null;
  // "MMM DD" format (e.g. "Feb 23")
  const m = dateStr.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d+)/);
  if (m) return MONTH_MAP[m[1]] * 100 + parseInt(m[2], 10);
  // ISO "YYYY-MM-DD" format (e.g. "2026-02-23")
  const iso = dateStr.match(/^\d{4}-(\d{2})-(\d{2})/);
  if (iso) return parseInt(iso[1], 10) * 100 + parseInt(iso[2], 10);
  return null;
}

export function collectDates(node: TreeNode): number[] {
  const now = new Date();
  const todayOrd = (now.getMonth() + 1) * 100 + now.getDate();
  const dates: Set<number> = new Set();
  function walk(n: TreeNode) {
    const ord = parseDateOrdinal(n.date || '');
    if (ord !== null && ord <= todayOrd) dates.add(ord);
    (n.children || []).forEach(walk);
  }
  walk(node);
  return Array.from(dates).sort((a, b) => a - b);
}

export function ordinalToLabel(ord: number): string {
  const month = Math.floor(ord / 100);
  const day = ord % 100;
  const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[month]} ${day}`;
}

/**
 * Walk the markmap internal data tree, stash full children list per node,
 * then splice children to only those with dateOrd <= cutoff.
 * Preserves same node objects so D3 keys stay stable → parent-anchored animations.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyDateFilter(node: any, cutoff: number): void {
  if (!node) return;

  // Stash full children on first visit
  if (!node._allChildren && node.children) {
    node._allChildren = [...node.children];
  }

  const all = node._allChildren || [];

  // Keep children whose dateOrd <= cutoff (or no dateOrd = structural)
  node.children = all.filter((child: { payload?: Record<string, unknown> }) => {
    const dateOrd = child.payload?.dateOrd as number | undefined;
    if (dateOrd !== undefined && dateOrd > cutoff) return false;
    return true;
  });

  // Recurse
  for (const child of node.children) {
    applyDateFilter(child, cutoff);
  }
}

/* ── Shared Timeline Bar ───────────────────────── */

interface TimelineBarProps {
  allDates: number[];
  dateIndex: number;
  setDateIndex: (i: number | ((prev: number) => number)) => void;
}

export function TimelineBar({ allDates, dateIndex, setDateIndex }: TimelineBarProps) {
  const goPrev = () => setDateIndex((i: number) => Math.max(0, i - 1));
  const goNext = () => setDateIndex((i: number) => Math.min(allDates.length - 1, i + 1));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        setDateIndex((i: number) => Math.max(0, i - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        setDateIndex((i: number) => Math.min(allDates.length - 1, i + 1));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [allDates.length, setDateIndex]);

  if (allDates.length === 0) return null;

  return (
    <div className="timeline-bar">
      <button className="tl-arrow" onClick={goPrev} disabled={dateIndex <= 0} aria-label="Previous date">
        {'\u2039'}
      </button>

      <div className="tl-track">
        <div
          className="tl-progress"
          style={{ width: `${(dateIndex / (allDates.length - 1)) * 100}%` }}
        />
        {allDates.map((ord, i) => {
          const pct = allDates.length === 1 ? 50 : (i / (allDates.length - 1)) * 100;
          const isActive = i <= dateIndex;
          const isCurrent = i === dateIndex;
          return (
            <button
              key={ord}
              className={`tl-dot${isActive ? ' active' : ''}${isCurrent ? ' current' : ''}`}
              style={{ left: `${pct}%` }}
              onClick={() => setDateIndex(i)}
              title={ordinalToLabel(ord)}
            >
              {isCurrent && <span className="tl-label">{ordinalToLabel(ord)}</span>}
            </button>
          );
        })}
      </div>

      <button className="tl-arrow" onClick={goNext} disabled={dateIndex >= allDates.length - 1} aria-label="Next date">
        {'\u203A'}
      </button>

      <span className="tl-counter">{ordinalToLabel(allDates[dateIndex])}</span>
    </div>
  );
}

/* ── Shared markmap + timeline hook ────────────── */

function useMarkmapTimeline(
  svgRef: React.RefObject<SVGSVGElement | null>,
  fullRoot: INode | null,
  allDates: number[],
  expandLevel: number,
  onFitRequest: boolean,
  options: { spacingH: number; spacingV: number; maxW: number },
) {
  const mmRef = useRef<Markmap | null>(null);
  const cutoffRef = useRef<number>(Infinity);
  const mountedRef = useRef(false);

  const [dateIndex, setDateIndex] = useState(allDates.length - 1);

  // Reset to last date when dates change
  useEffect(() => {
    setDateIndex(allDates.length - 1);
  }, [allDates]);

  const currentCutoff = allDates[dateIndex] ?? Infinity;
  cutoffRef.current = currentCutoff;

  // Create markmap (or recreate on expandLevel/fullRoot change)
  useEffect(() => {
    if (!svgRef.current || !fullRoot) return;
    svgRef.current.innerHTML = '';
    mountedRef.current = false;

    const fresh = cloneINode(fullRoot);
    const derived = deriveOptions({
      color: MARKMAP_COLORS,
      spacingHorizontal: options.spacingH,
      spacingVertical: options.spacingV,
      paddingX: 10,
      maxWidth: options.maxW,
      duration: 500,
      initialExpandLevel: expandLevel === -1 ? -1 : expandLevel,
    });
    const mm = Markmap.create(svgRef.current, derived, fresh);
    mmRef.current = mm;

    // Apply initial date filter after markmap has laid out
    // Use requestAnimationFrame to let the initial render complete
    requestAnimationFrame(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (mm as any).state?.data;
      if (data && cutoffRef.current !== Infinity) {
        applyDateFilter(data, cutoffRef.current);
        mm.renderData().then(() => mm.fit());
      }
      mountedRef.current = true;
    });

    return () => {
      mmRef.current = null;
      mountedRef.current = false;
    };
  }, [fullRoot, expandLevel, svgRef, options.spacingH, options.spacingV, options.maxW]);

  // On date change (after mount): mutate internal data, animate
  useEffect(() => {
    if (!mountedRef.current) return;
    const mm = mmRef.current;
    if (!mm) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (mm as any).state?.data;
    if (!data) return;

    applyDateFilter(data, currentCutoff);
    mm.renderData().then(() => mm.fit());
  }, [currentCutoff]);

  // Fit on request
  useEffect(() => {
    if (onFitRequest && mmRef.current) mmRef.current.fit();
  }, [onFitRequest]);

  return { dateIndex, setDateIndex };
}

/* ── Dimension markmap with timeline ───────────── */

interface MarkmapDimensionViewProps {
  treeData: TreeNode;
  expandLevel: number;
  onFitRequest: boolean;
}

const DIM_OPTS = { spacingH: 80, spacingV: 12, maxW: 360 };

export function MarkmapDimensionView({ treeData, expandLevel, onFitRequest }: MarkmapDimensionViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const allDates = useMemo(() => collectDates(treeData), [treeData]);
  const fullRoot = useMemo(() => jsonToINode(treeData, 0), [treeData]);

  const { dateIndex, setDateIndex } = useMarkmapTimeline(
    svgRef, fullRoot, allDates, expandLevel, onFitRequest, DIM_OPTS,
  );

  return (
    <div className="dim-view">
      <div className="map-wrap">
        <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <TimelineBar allDates={allDates} dateIndex={dateIndex} setDateIndex={setDateIndex} />
    </div>
  );
}
