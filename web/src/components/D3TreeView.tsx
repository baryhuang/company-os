import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import type { TreeNode } from '../types';

const statusColors: Record<string, string> = {
  origin: '#3a6da0', abandoned: '#c94040', chosen: '#3a7d44',
  partial: '#c07820', excluded: '#8a9e8c', final: '#2a8a7a',
};

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  data: TreeNode | null;
}

interface D3TreeViewProps {
  treeData: TreeNode;
  config?: { nodeW?: number; nodeH?: number; colSpacing?: number };
}

export function D3TreeView({ treeData, config }: D3TreeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, data: null });

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    el.innerHTML = '';

    const { nodeW = 160, nodeH = 70, colSpacing = 240 } = config || {};
    const margin = { top: 40, right: 200, bottom: 40, left: 60 };

    const root = d3.hierarchy(treeData, d => d.children);
    d3.tree<TreeNode>().nodeSize([nodeH + 16, colSpacing])(root);

    let x0 = Infinity, x1 = -Infinity;
    root.each(d => {
      const dx = d.x ?? 0;
      if (dx < x0) x0 = dx;
      if (dx > x1) x1 = dx;
    });

    const w = (root.height + 1) * colSpacing + margin.left + margin.right;
    const h = x1 - x0 + margin.top + margin.bottom + nodeH;

    const svg = d3.select(el).append('svg').attr('width', w).attr('height', h);
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top - x0 + nodeH / 2})`);

    // Links
    g.selectAll('.link').data(root.links()).join('path')
      .attr('d', d => {
        const sy = (d.source.y ?? 0) + nodeW / 2;
        const ty = (d.target.y ?? 0) - nodeW / 2;
        const sx = d.source.x ?? 0;
        const tx = d.target.x ?? 0;
        return `M${sy},${sx} C${(sy + ty) / 2},${sx} ${(sy + ty) / 2},${tx} ${ty},${tx}`;
      })
      .attr('fill', 'none')
      .attr('stroke', d => statusColors[d.target.data.status || ''] || '#8a9e8c')
      .attr('stroke-width', d => d.target.data.status === 'final' ? 3 : 1.8)
      .attr('opacity', d => {
        const s = d.target.data.status;
        return (s === 'abandoned' || s === 'excluded') ? 0.3 : 0.5;
      });

    // Nodes
    const node = g.selectAll('.node').data(root.descendants()).join('g')
      .attr('class', 'node')
      .attr('transform', d => `translate(${(d.y ?? 0) - nodeW / 2},${(d.x ?? 0) - nodeH / 2})`)
      .style('cursor', 'pointer');

    // Background rect
    node.append('rect').attr('width', nodeW).attr('height', nodeH).attr('rx', 10)
      .attr('fill', d => {
        const c = statusColors[d.data.status || ''] || '#8a9e8c';
        const r = parseInt(c.slice(1, 3), 16);
        const gr = parseInt(c.slice(3, 5), 16);
        const b = parseInt(c.slice(5, 7), 16);
        return `rgba(${r},${gr},${b},0.08)`;
      })
      .attr('stroke', d => statusColors[d.data.status || ''] || '#8a9e8c')
      .attr('stroke-width', d => d.data.status === 'final' ? 2.5 : 1.2);

    // Name
    node.append('text').attr('x', nodeW / 2).attr('y', nodeH < 66 ? 18 : 22)
      .attr('text-anchor', 'middle').attr('fill', 'var(--text)').attr('font-size', '11.5px').attr('font-weight', '700')
      .text(d => { const n = d.data.name; return n.length > 22 ? n.slice(0, 21) + '\u2026' : n; });

    // Date
    node.append('text').attr('x', nodeW / 2).attr('y', nodeH < 66 ? 33 : 38)
      .attr('text-anchor', 'middle').attr('fill', 'var(--text3)').attr('font-size', '10px')
      .text(d => d.data.date || '');

    // Desc
    node.append('text').attr('x', nodeW / 2).attr('y', nodeH < 66 ? 48 : 54)
      .attr('text-anchor', 'middle').attr('fill', 'var(--text2)').attr('font-size', '9px')
      .each(function(d) {
        const t = d.data.desc || '';
        d3.select(this).text(t.length > 26 ? t.slice(0, 25) + '\u2026' : t);
      });

    // Glow on final nodes
    node.filter(d => d.data.status === 'final').select('rect')
      .style('filter', 'drop-shadow(0 0 6px rgba(42,138,122,0.35))');

    // Tooltip on click
    node.on('click', (event: MouseEvent, d) => {
      event.stopPropagation();
      setTooltip({
        visible: true,
        x: Math.min(event.clientX + 16, window.innerWidth - 400),
        y: Math.min(event.clientY - 20, window.innerHeight - 300),
        data: d.data,
      });
    });

    // Click outside to dismiss
    svg.on('click', () => setTooltip(prev => ({ ...prev, visible: false })));

    return () => {
      el.innerHTML = '';
    };
  }, [treeData, config]);

  return (
    <div className="d3-wrap" style={{ display: 'block' }}>
      <div ref={containerRef} />
      <div
        className={`tooltip${tooltip.visible ? ' visible' : ''}`}
        style={{ left: tooltip.x, top: tooltip.y }}
      >
        {tooltip.data && (
          <>
            <h3>{tooltip.data.name}</h3>
            <div className="date">{tooltip.data.date}</div>
            <div className="desc">{tooltip.data.desc}</div>
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
