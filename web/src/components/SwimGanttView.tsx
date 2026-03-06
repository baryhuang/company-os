import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import type { TreeNode } from '../types';

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

/* ── Date extraction from messy text ── */
function parseDates(node: TreeNode): { start: Date | null; end: Date | null; isMilestone: boolean } {
  const text = `${node.date || ''} ${node.desc || ''}`;
  const monthRe = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/gi;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = monthRe.exec(text)) !== null) matches.push(m[1]);

  if (matches.length === 0) return { start: null, end: null, isMilestone: false };

  const indices = matches.map(monthIndex).filter(i => i >= 0);
  const unique = [...new Set(indices)].sort((a, b) => a - b);

  const isMilestone = /deadline|完成|开张|finished/i.test(text) ||
    (unique.length === 1 && /\b\d{1,2}\b/.test(node.date || ''));

  const year = 2026;
  const startMonth = unique[0];
  const endMonth = unique[unique.length - 1];

  // Try to extract specific day from date field
  const dayRe = /\b(\d{1,2})\b/;
  const dayMatch = (node.date || '').match(dayRe);
  const startDay = dayMatch ? Math.min(parseInt(dayMatch[1], 10), 28) : 1;

  const start = new Date(year, startMonth, isMilestone && dayMatch ? startDay : 1);
  const end = startMonth === endMonth
    ? new Date(year, endMonth + 1, 0) // last day of month
    : new Date(year, endMonth + 1, 0);

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

/* ── Component ── */
interface SwimGanttViewProps {
  treeData: TreeNode;
}

export function SwimGanttView({ treeData }: SwimGanttViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, data: null });

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    el.innerHTML = '';

    const lanes = buildLanes(treeData);

    /* ── Dimensions ── */
    const labelW = 220;
    const rowH = 32;
    const laneGap = 12;
    const lanePadY = 8;
    const margin = { top: 44, right: 24, bottom: 24, left: 16 };
    const containerWidth = el.parentElement?.clientWidth || 900;
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
    const svgH = totalH + margin.top + margin.bottom;

    /* ── Scales ── */
    const timeStart = new Date(2026, 1, 1);  // Feb 1
    const timeEnd = new Date(2026, 11, 1);    // Dec 1
    const x = d3.scaleTime().domain([timeStart, timeEnd]).range([0, chartW]);

    /* ── SVG ── */
    const svg = d3.select(el).append('svg')
      .attr('width', containerWidth - margin.left - margin.right + labelW)
      .attr('height', svgH);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    /* ── Month grid ── */
    const monthTicks = d3.timeMonths(timeStart, new Date(2026, 11, 2));
    // Gridlines
    g.selectAll('.grid-line').data(monthTicks).join('line')
      .attr('x1', d => labelW + x(d)).attr('x2', d => labelW + x(d))
      .attr('y1', 0).attr('y2', totalH)
      .attr('stroke', '#d8d0c4').attr('stroke-width', 0.5).attr('stroke-dasharray', '3,3');

    // Month labels
    g.selectAll('.month-label').data(monthTicks).join('text')
      .attr('x', d => labelW + x(d) + (x(d3.timeMonth.offset(d, 1)) - x(d)) / 2)
      .attr('y', -14)
      .attr('text-anchor', 'middle')
      .attr('fill', '#918a80')
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('font-family', "'JetBrains Mono', monospace")
      .text(d => MONTHS[d.getMonth()]);

    /* ── Today marker ── */
    const today = new Date(2026, 2, 5); // Mar 5, 2026
    const todayX = labelW + x(today);
    g.append('line')
      .attr('x1', todayX).attr('x2', todayX)
      .attr('y1', -8).attr('y2', totalH)
      .attr('stroke', '#bf3636').attr('stroke-width', 1.5).attr('stroke-dasharray', '6,4');
    g.append('text')
      .attr('x', todayX).attr('y', -20)
      .attr('text-anchor', 'middle')
      .attr('fill', '#bf3636').attr('font-size', '9px').attr('font-weight', '700')
      .attr('font-family', "'JetBrains Mono', monospace")
      .text('TODAY');

    /* ── Lanes ── */
    lanes.forEach((lane, li) => {
      const ly = laneOffsets[li];
      const rows = Math.max(lane.tasks.length, 1);
      const laneH = rows * rowH + lanePadY * 2;

      // Lane background
      g.append('rect')
        .attr('x', 0).attr('y', ly)
        .attr('width', labelW + chartW).attr('height', laneH)
        .attr('rx', 6)
        .attr('fill', li % 2 === 0 ? '#faf8f4' : '#f4f1eb')
        .attr('stroke', '#e8e2d8').attr('stroke-width', 0.5);

      // Lane label
      const labelText = lane.name.length > 28 ? lane.name.slice(0, 27) + '\u2026' : lane.name;
      g.append('text')
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
      g.append('circle')
        .attr('cx', labelW - 14).attr('cy', ly + laneH / 2)
        .attr('r', 4)
        .attr('fill', dotColor).attr('opacity', 0.7);

      /* ── Task bars ── */
      lane.tasks.forEach((task, ti) => {
        const ty = ly + lanePadY + ti * rowH + rowH / 2;
        const barColor = statusColors[task.status] || '#8a9e8c';

        if (task.isMilestone) {
          // Diamond milestone marker
          const mx = labelW + x(task.start);
          g.append('rect')
            .attr('x', mx - 6).attr('y', ty - 6)
            .attr('width', 12).attr('height', 12)
            .attr('transform', `rotate(45,${mx},${ty})`)
            .attr('fill', barColor)
            .attr('stroke', '#fff').attr('stroke-width', 1.5)
            .style('cursor', 'pointer')
            .on('click', (event: MouseEvent) => {
              event.stopPropagation();
              setTooltip({
                visible: true,
                x: Math.min(event.clientX + 16, window.innerWidth - 420),
                y: Math.min(event.clientY - 20, window.innerHeight - 300),
                data: task.node,
              });
            });
          // Milestone label
          g.append('text')
            .attr('x', mx + 12).attr('y', ty)
            .attr('dominant-baseline', 'central')
            .attr('fill', barColor).attr('font-size', '9.5px').attr('font-weight', '600')
            .attr('font-family', "'DM Sans', sans-serif")
            .text(task.name.length > 20 ? task.name.slice(0, 19) + '\u2026' : task.name);
        } else {
          // Bar
          const bx = labelW + x(task.start);
          const bw = Math.max(labelW + x(task.end) - bx, 16);
          g.append('rect')
            .attr('x', bx).attr('y', ty - 10)
            .attr('width', bw).attr('height', 20)
            .attr('rx', 4)
            .attr('fill', barColor).attr('opacity', 0.2)
            .attr('stroke', barColor).attr('stroke-width', 1)
            .style('cursor', 'pointer')
            .on('click', (event: MouseEvent) => {
              event.stopPropagation();
              setTooltip({
                visible: true,
                x: Math.min(event.clientX + 16, window.innerWidth - 420),
                y: Math.min(event.clientY - 20, window.innerHeight - 300),
                data: task.node,
              });
            });
          // Bar label
          const maxLabelLen = Math.floor(bw / 7);
          const label = task.name.length > maxLabelLen
            ? task.name.slice(0, maxLabelLen - 1) + '\u2026'
            : task.name;
          g.append('text')
            .attr('x', bx + 6).attr('y', ty)
            .attr('dominant-baseline', 'central')
            .attr('fill', '#2a2520').attr('font-size', '10px').attr('font-weight', '600')
            .attr('font-family', "'DM Sans', sans-serif")
            .text(label);
        }
      });
    });

    // Click outside to dismiss tooltip
    svg.on('click', () => setTooltip(prev => ({ ...prev, visible: false })));

    return () => { el.innerHTML = ''; };
  }, [treeData]);

  return (
    <div className="gantt-wrap">
      <div ref={containerRef} />
      <div
        className={`tooltip${tooltip.visible ? ' visible' : ''}`}
        style={{ left: tooltip.x, top: tooltip.y }}
      >
        {tooltip.data && (
          <>
            <h3>{tooltip.data.name}</h3>
            {tooltip.data.date && <div className="date">{tooltip.data.date}</div>}
            {tooltip.data.desc && <div className="desc">{tooltip.data.desc}</div>}
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
  );
}
