import { useRef, useEffect, useState, useMemo } from 'react';
import * as d3 from 'd3';
import type { TreeNode } from '../types';
import { collectDates, parseDateOrdinal, TimelineBar } from './MarkmapView';

/* ── Status → color mapping (same as D3TreeView) ── */
const statusColors: Record<string, string> = {
  origin: '#3a6da0', abandoned: '#c94040', chosen: '#3a7d44',
  partial: '#c07820', excluded: '#8a9e8c', final: '#2a8a7a',
};

/* ── Month helpers ── */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const monthIndex = (m: string) => MONTHS.findIndex(n => n.toLowerCase() === m.toLowerCase());

interface GanttTask {
  name: string;
  start: Date;
  end: Date;
  status: string;
  isMilestone: boolean;
  node: TreeNode;
}

interface SwimLane {
  name: string;
  status: string;
  tasks: GanttTask[];
  node: TreeNode;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  data: TreeNode | null;
}

/* ── Date extraction from node fields ── */
function parseDateField(dateStr: string): { month: number; day: number | null; endDay: number | null } | null {
  if (!dateStr) return null;

  // ISO "YYYY-MM-DD"
  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { month: parseInt(iso[2], 10) - 1, day: parseInt(iso[3], 10), endDay: null };

  // "MMM DD-DD" range (e.g. "Mar 21-22")
  const range = dateStr.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s*[-–]\s*(\d{1,2})/i);
  if (range) return { month: monthIndex(range[1]), day: parseInt(range[2], 10), endDay: parseInt(range[3], 10) };

  // "MMM DD" with optional suffix (e.g. "Mar 14", "Apr 15前", "Jun 9")
  const mdd = dateStr.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})/i);
  if (mdd) return { month: monthIndex(mdd[1]), day: parseInt(mdd[2], 10), endDay: null };

  // "MMM底" = end of month (e.g. "Mar底")
  const mEnd = dateStr.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*底/i);
  if (mEnd) {
    const mi = monthIndex(mEnd[1]);
    const lastDay = new Date(2026, mi + 1, 0).getDate();
    return { month: mi, day: lastDay, endDay: null };
  }

  // Bare month (e.g. "Apr", "May")
  const bare = dateStr.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i);
  if (bare) return { month: monthIndex(bare[1]), day: null, endDay: null };

  // "Feb 26 规划, Mar 7 更新" — pick first month+day
  const first = dateStr.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})/i);
  if (first) return { month: monthIndex(first[1]), day: parseInt(first[2], 10), endDay: null };

  // Last resort: any month name
  const anyMonth = dateStr.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
  if (anyMonth) return { month: monthIndex(anyMonth[1]), day: null, endDay: null };

  return null;
}

function parseDates(node: TreeNode): { start: Date | null; end: Date | null; isMilestone: boolean } {
  const year = 2026;
  const parsed = parseDateField(node.date || '');
  const deadlineParsed = parseDateField(node.deadline || '');

  if (!parsed) return { start: null, end: null, isMilestone: false };

  const hasDeadline = !!node.deadline && !!deadlineParsed;

  // Build start date
  const startDay = parsed.day || 1;
  const start = new Date(year, parsed.month, startDay);

  // Build end date
  let end: Date;
  if (hasDeadline && deadlineParsed) {
    end = new Date(year, deadlineParsed.month, deadlineParsed.day || new Date(year, deadlineParsed.month + 1, 0).getDate());
  } else if (parsed.endDay) {
    // Date range like "Mar 21-22"
    end = new Date(year, parsed.month, parsed.endDay);
  } else if (parsed.day) {
    // Specific day = milestone (single point)
    end = start;
  } else {
    // Bare month = span the whole month
    end = new Date(year, parsed.month + 1, 0);
  }

  const isMilestone = parsed.day !== null && !parsed.endDay && !hasDeadline && start.getTime() === end.getTime();

  return { start, end, isMilestone };
}

/* ── Transform tree → swim lanes ── */
function buildLanes(root: TreeNode): SwimLane[] {
  const children = root.children || [];
  return children.map(child => {
    const tasks: GanttTask[] = [];
    const addTasks = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        const { start, end, isMilestone } = parseDates(n);
        if (start && end) {
          tasks.push({
            name: n.name,
            start,
            end: isMilestone ? start : end,
            status: n.status || 'partial',
            isMilestone,
            node: n,
          });
        }
        // Recurse into children so deeper nodes also appear as tasks
        if (n.children && n.children.length > 0) {
          addTasks(n.children);
        }
      }
    };
    // Children of the lane become tasks; if no children, the lane itself is a task
    if (child.children && child.children.length > 0) {
      addTasks(child.children);
    } else {
      const { start, end, isMilestone } = parseDates(child);
      if (start && end) {
        tasks.push({
          name: child.name,
          start,
          end: isMilestone ? start : end,
          status: child.status || 'partial',
          isMilestone,
          node: child,
        });
      }
    }
    return { name: child.name, status: child.status || 'partial', tasks, node: child };
  });
}

/* ── Filter tree by date cutoff ── */
function filterTreeByDate(node: TreeNode, cutoff: number): TreeNode {
  const children = (node.children || [])
    .map(c => filterTreeByDate(c, cutoff))
    .filter(c => {
      const ord = parseDateOrdinal(c.date || '');
      // Keep if: no date, date <= cutoff, or has children that survived
      if (ord === null) return true;
      if (ord <= cutoff) return true;
      return (c.children || []).length > 0;
    });
  return { ...node, children };
}

/* ── Component ── */
interface SwimGanttViewProps {
  treeData: TreeNode;
}

export function SwimGanttView({ treeData }: SwimGanttViewProps) {
  const headerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, data: null });

  // Timeline state
  const allDates = useMemo(() => collectDates(treeData), [treeData]);
  const [dateIndex, setDateIndex] = useState(allDates.length - 1);

  const filteredTree = useMemo(() => {
    if (allDates.length <= 1) return treeData;
    const cutoff = allDates[dateIndex] ?? Infinity;
    return filterTreeByDate(treeData, cutoff);
  }, [treeData, allDates, dateIndex]);

  useEffect(() => {
    if (!headerRef.current || !bodyRef.current) return;
    headerRef.current.innerHTML = '';
    bodyRef.current.innerHTML = '';

    const lanes = buildLanes(filteredTree);

    /* ── Dimensions ── */
    const labelW = 220;
    const rowH = 32;
    const laneGap = 12;
    const lanePadY = 8;
    const headerH = 36;
    const margin = { right: 24, bottom: 24, left: 16 };
    const containerWidth = bodyRef.current.parentElement?.clientWidth || 900;
    const chartW = containerWidth - margin.left - margin.right - labelW;

    // Calculate total height
    let totalH = 0;
    const laneOffsets: number[] = [];
    for (const lane of lanes) {
      laneOffsets.push(totalH);
      const rows = Math.max(lane.tasks.length, 1);
      totalH += rows * rowH + lanePadY * 2 + laneGap;
    }
    totalH -= laneGap; // remove trailing gap
    const bodyH = totalH + margin.bottom;
    const svgW = containerWidth - margin.left - margin.right + labelW;

    /* ── Scales (dynamic based on task dates) ── */
    let minDate = new Date(2099, 0, 1);
    let maxDate = new Date(2000, 0, 1);
    for (const lane of lanes) {
      for (const task of lane.tasks) {
        if (task.start < minDate) minDate = task.start;
        if (task.end > maxDate) maxDate = task.end;
        if (task.start > maxDate) maxDate = task.start;
      }
    }
    if (minDate > maxDate) {
      minDate = new Date(2026, 1, 1);
      maxDate = new Date(2026, 3, 1);
    }
    const timeStart = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    const timeEnd = new Date(maxDate.getTime() + 14 * 24 * 60 * 60 * 1000);
    const x = d3.scaleTime().domain([timeStart, timeEnd]).range([0, chartW]);
    const monthTicks = d3.timeMonths(timeStart, d3.timeMonth.offset(timeEnd, 1));

    /* ── Header SVG (sticky month labels + TODAY label) ── */
    const hSvg = d3.select(headerRef.current).append('svg')
      .attr('width', svgW).attr('height', headerH);
    const hg = hSvg.append('g').attr('transform', `translate(${margin.left},0)`);

    // Month labels in header
    hg.selectAll('.month-label').data(monthTicks).join('text')
      .attr('x', d => labelW + x(d) + (x(d3.timeMonth.offset(d, 1)) - x(d)) / 2)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .attr('fill', '#918a80')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('font-family', "'JetBrains Mono', monospace")
      .text(d => MONTHS[d.getMonth()]);

    // TODAY label in header
    const today = new Date(2026, 2, 8); // Mar 8, 2026
    const todayX = labelW + x(today);
    hg.append('text')
      .attr('x', todayX).attr('y', 10)
      .attr('text-anchor', 'middle')
      .attr('fill', '#bf3636').attr('font-size', '9px').attr('font-weight', '700')
      .attr('font-family', "'JetBrains Mono', monospace")
      .text('TODAY');
    // Short tick in header
    hg.append('line')
      .attr('x1', todayX).attr('x2', todayX)
      .attr('y1', 16).attr('y2', headerH)
      .attr('stroke', '#bf3636').attr('stroke-width', 1.5).attr('stroke-dasharray', '6,4');

    // Bottom border on header
    hg.append('line')
      .attr('x1', 0).attr('x2', svgW)
      .attr('y1', headerH - 0.5).attr('y2', headerH - 0.5)
      .attr('stroke', '#e8e2d8').attr('stroke-width', 1);

    /* ── Body SVG (lanes + tasks + today line overlay) ── */
    const bSvg = d3.select(bodyRef.current).append('svg')
      .attr('width', svgW).attr('height', bodyH);
    const bg = bSvg.append('g').attr('transform', `translate(${margin.left},0)`);

    // Month gridlines
    bg.selectAll('.grid-line').data(monthTicks).join('line')
      .attr('x1', d => labelW + x(d)).attr('x2', d => labelW + x(d))
      .attr('y1', 0).attr('y2', totalH)
      .attr('stroke', '#d8d0c4').attr('stroke-width', 0.5).attr('stroke-dasharray', '3,3');

    /* ── Lanes ── */
    lanes.forEach((lane, li) => {
      const ly = laneOffsets[li];
      const rows = Math.max(lane.tasks.length, 1);
      const laneH = rows * rowH + lanePadY * 2;

      // Lane background
      bg.append('rect')
        .attr('x', 0).attr('y', ly)
        .attr('width', labelW + chartW).attr('height', laneH)
        .attr('rx', 6)
        .attr('fill', li % 2 === 0 ? '#faf8f4' : '#f4f1eb')
        .attr('stroke', '#e8e2d8').attr('stroke-width', 0.5);

      // Lane label
      const ownerSuffix = lane.node.owner ? ` (${lane.node.owner})` : '';
      const fullLabel = lane.name + ownerSuffix;
      const labelText = fullLabel.length > 32 ? fullLabel.slice(0, 31) + '\u2026' : fullLabel;
      bg.append('text')
        .attr('x', 12).attr('y', ly + laneH / 2)
        .attr('dominant-baseline', 'central')
        .attr('fill', '#2a2520')
        .attr('font-size', '11.5px')
        .attr('font-weight', '700')
        .attr('font-family', "'DM Sans', sans-serif")
        .text(labelText)
        .style('cursor', 'pointer')
        .on('click', (event: MouseEvent) => {
          event.stopPropagation();
          setTooltip({
            visible: true,
            x: Math.min(event.clientX + 16, window.innerWidth - 420),
            y: Math.min(event.clientY - 20, window.innerHeight - 300),
            data: lane.node,
          });
        });

      // Status dot next to label
      const dotColor = statusColors[lane.status] || '#8a9e8c';
      bg.append('circle')
        .attr('cx', labelW - 14).attr('cy', ly + laneH / 2)
        .attr('r', 4)
        .attr('fill', dotColor).attr('opacity', 0.7);

      /* ── Task bars ── */
      lane.tasks.forEach((task, ti) => {
        const ty = ly + lanePadY + ti * rowH + rowH / 2;
        const barColor = statusColors[task.status] || '#8a9e8c';

        const showTip = (event: MouseEvent) => {
          setTooltip({
            visible: true,
            x: Math.min(event.clientX + 16, window.innerWidth - 420),
            y: Math.min(event.clientY - 20, window.innerHeight - 300),
            data: task.node,
          });
        };
        const hideTip = () => setTooltip(prev => ({ ...prev, visible: false }));

        if (task.isMilestone) {
          const mx = labelW + x(task.start);
          bg.append('rect')
            .attr('x', mx - 6).attr('y', ty - 6)
            .attr('width', 12).attr('height', 12)
            .attr('transform', `rotate(45,${mx},${ty})`)
            .attr('fill', barColor)
            .attr('stroke', '#fff').attr('stroke-width', 1.5)
            .style('cursor', 'pointer')
            .on('mouseenter', (event: MouseEvent) => showTip(event))
            .on('mouseleave', hideTip);
          bg.append('text')
            .attr('x', mx + 12).attr('y', ty)
            .attr('dominant-baseline', 'central')
            .attr('fill', barColor).attr('font-size', '9.5px').attr('font-weight', '600')
            .attr('font-family', "'DM Sans', sans-serif")
            .text(task.name.length > 20 ? task.name.slice(0, 19) + '\u2026' : task.name)
            .style('cursor', 'pointer')
            .on('mouseenter', (event: MouseEvent) => showTip(event))
            .on('mouseleave', hideTip);
        } else {
          const bx = labelW + x(task.start);
          const bw = Math.max(labelW + x(task.end) - bx, 16);
          bg.append('rect')
            .attr('x', bx).attr('y', ty - 10)
            .attr('width', bw).attr('height', 20)
            .attr('rx', 4)
            .attr('fill', barColor).attr('opacity', 0.2)
            .attr('stroke', barColor).attr('stroke-width', 1)
            .style('cursor', 'pointer')
            .on('mouseenter', (event: MouseEvent) => showTip(event))
            .on('mouseleave', hideTip);
          const maxLabelLen = Math.floor(bw / 7);
          const label = task.name.length > maxLabelLen
            ? task.name.slice(0, maxLabelLen - 1) + '\u2026'
            : task.name;
          bg.append('text')
            .attr('x', bx + 6).attr('y', ty)
            .attr('dominant-baseline', 'central')
            .attr('fill', '#2a2520').attr('font-size', '10px').attr('font-weight', '600')
            .attr('font-family', "'DM Sans', sans-serif")
            .text(label)
            .style('pointer-events', 'none');
        }
      });
    });

    /* ── Today line overlay (drawn last so it's on top of everything) ── */
    bg.append('line')
      .attr('x1', todayX).attr('x2', todayX)
      .attr('y1', 0).attr('y2', totalH)
      .attr('stroke', '#bf3636').attr('stroke-width', 1.5).attr('stroke-dasharray', '6,4')
      .style('pointer-events', 'none');

    // Click outside to dismiss tooltip
    bSvg.on('click', () => setTooltip(prev => ({ ...prev, visible: false })));

    return () => {
      headerRef.current && (headerRef.current.innerHTML = '');
      bodyRef.current && (bodyRef.current.innerHTML = '');
    };
  }, [filteredTree]);

  return (
    <div className="gantt-view">
      <div className="gantt-wrap">
        <div className="gantt-header" ref={headerRef} />
        <div className="gantt-body" ref={bodyRef} />
        <div
          className={`tooltip${tooltip.visible ? ' visible' : ''}`}
          style={{ left: tooltip.x, top: tooltip.y, pointerEvents: tooltip.visible ? 'auto' : 'none' }}
          onMouseEnter={() => setTooltip(prev => ({ ...prev, visible: true }))}
          onMouseLeave={() => setTooltip(prev => ({ ...prev, visible: false }))}
        >
          {tooltip.data && (
            <>
              <h3>{tooltip.data.name}</h3>
              {tooltip.data.owner && <div className="owner"><strong>Owner:</strong> {tooltip.data.owner}</div>}
              {tooltip.data.supervisor && <div className="owner"><strong>Supervisor:</strong> {tooltip.data.supervisor}</div>}
              {tooltip.data.date && <div className="date">{tooltip.data.date}</div>}
              {tooltip.data.deadline && <div className="date"><strong>Deadline:</strong> {tooltip.data.deadline}</div>}
              {tooltip.data.desc && <div className="desc">{tooltip.data.desc}</div>}
              {tooltip.data.timeline && <div className="desc"><strong>Timeline:</strong> {tooltip.data.timeline}</div>}
              {tooltip.data.quotes?.map((q, i) => (
                <div key={i} className="quote">&ldquo;{q}&rdquo;</div>
              ))}
              {tooltip.data.feedback && (
                <div className="feedback">{'\uD83D\uDCAC'} {tooltip.data.feedback}</div>
              )}
              {tooltip.data.structure && (
                <div className="structure">
                  <strong>Pitch Structure:</strong><br />
                  {tooltip.data.structure.map((s, i) => (
                    <span key={i}>{'\u2192'} {s}<br /></span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <TimelineBar allDates={allDates} dateIndex={dateIndex} setDateIndex={setDateIndex} />
    </div>
  );
}
