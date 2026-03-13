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

    const { nodeW = 160, nodeH = 100, colSpacing = 240 } = config || {};
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

    const svg = d3.select(el).append('svg')
      .attr('width', '100%').attr('height', '100%')
      .style('min-width', `${w}px`).style('min-height', `${h}px`)
      .style('touch-action', 'none');

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top - x0 + nodeH / 2})`);

    // Zoom & pan
    const initTransform = d3.zoomIdentity.translate(margin.left, margin.top - x0 + nodeH / 2);
    let currentTransform = initTransform;

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 3])
      .filter((event) => {
        // Allow all events except plain wheel (two-finger scroll) — we handle that manually
        if (event.type === 'wheel' && !event.ctrlKey) return false;
        return true;
      })
      .on('zoom', (event) => {
        currentTransform = event.transform;
        g.attr('transform', event.transform.toString());
      });
    svg.call(zoom);
    svg.call(zoom.transform, initTransform);

    // Two-finger trackpad scroll → pan (wheel without ctrlKey)
    svg.on('wheel', (event: WheelEvent) => {
      if (event.ctrlKey) return; // pinch-zoom handled by d3.zoom
      event.preventDefault();
      currentTransform = currentTransform.translate(-event.deltaX / currentTransform.k, -event.deltaY / currentTransform.k);
      svg.call(zoom.transform, currentTransform);
    }, { passive: false });

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

    // Name (2-line fixed via foreignObject)
    const nameHeight = 32;
    node.append('foreignObject')
      .attr('x', 4).attr('y', 6)
      .attr('width', nodeW - 8).attr('height', nameHeight)
      .append('xhtml:div')
      .style('font-size', '11.5px').style('font-weight', '700')
      .style('text-align', 'center').style('line-height', '14px')
      .style('color', 'var(--text)')
      .style('overflow', 'hidden')
      .style('display', '-webkit-box')
      .style('-webkit-line-clamp', '2')
      .style('-webkit-box-orient', 'vertical')
      .text(d => d.data.name);

    // Date
    node.append('text').attr('x', nodeW / 2).attr('y', nameHeight + 14)
      .attr('text-anchor', 'middle').attr('fill', 'var(--text3)').attr('font-size', '10px')
      .text(d => d.data.date || '');

    // Desc (3-line max, left-aligned via foreignObject)
    const descTop = nameHeight + 20;
    const descHeight = 39;
    node.append('foreignObject')
      .attr('x', 8).attr('y', descTop)
      .attr('width', nodeW - 16).attr('height', descHeight)
      .append('xhtml:div')
      .style('font-size', '9px').style('line-height', '12px')
      .style('color', 'var(--text2)')
      .style('text-align', 'left')
      .style('overflow', 'hidden')
      .style('display', '-webkit-box')
      .style('-webkit-line-clamp', '3')
      .style('-webkit-box-orient', 'vertical')
      .text(d => d.data.desc || '');

    // Glow on final nodes
    node.filter(d => d.data.status === 'final').select('rect')
      .style('filter', 'drop-shadow(0 0 6px rgba(42,138,122,0.35))');

    // Tooltip on hover
    node.on('mouseenter', (event: MouseEvent, d) => {
      setTooltip({
        visible: true,
        x: Math.min(event.clientX + 16, window.innerWidth - 400),
        y: Math.min(event.clientY - 20, window.innerHeight - 300),
        data: d.data,
      });
    })
    .on('mousemove', (event: MouseEvent) => {
      setTooltip(prev => ({
        ...prev,
        x: Math.min(event.clientX + 16, window.innerWidth - 400),
        y: Math.min(event.clientY - 20, window.innerHeight - 300),
      }));
    })
    .on('mouseleave', () => {
      setTooltip(prev => ({ ...prev, visible: false }));
    });

    return () => {
      el.innerHTML = '';
    };
  }, [treeData, config]);

  return (
    <div className="d3-wrap" style={{ display: 'block', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
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
