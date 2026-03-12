import { useMemo } from 'react';
import { UserButton } from '@insforge/react';
import { Settings } from 'lucide-react';
import type { DimensionMeta, ViewType } from '../types';

interface SidebarProps {
  dimensions: DimensionMeta[];
  currentView: ViewType;
  currentDimIndex: number;
  onSwitch: (view: ViewType, dimIndex?: number) => void;
  open: boolean;
  onClose: () => void;
  workspaceName?: string;
}

const GROUP_LABELS: Record<string, string> = {
  strategy: '\u{1F9ED} Strategy',
  gtm: '\u{1F680} Go-to-Market',
  build: '\u{1F527} Build',
  org: '\u{1F3E2} Organization',
  execution: '\u{1F3AF} Execution',
};

const GROUP_ORDER = ['strategy', 'gtm', 'build', 'org', 'execution'];

export function Sidebar({ dimensions, currentView, currentDimIndex, onSwitch, open, onClose, workspaceName }: SidebarProps) {
  const handleClick = (view: ViewType, dimIndex?: number) => {
    onSwitch(view, dimIndex);
    onClose();
  };

  const grouped = useMemo(() => {
    const groups: { group: string; label: string; items: { dim: DimensionMeta; index: number }[] }[] = [];
    const groupMap = new Map<string, { dim: DimensionMeta; index: number }[]>();

    dimensions.forEach((dim, i) => {
      const g = dim.group || 'other';
      if (!groupMap.has(g)) groupMap.set(g, []);
      groupMap.get(g)!.push({ dim, index: i });
    });

    for (const g of GROUP_ORDER) {
      const items = groupMap.get(g);
      if (items) {
        groups.push({ group: g, label: GROUP_LABELS[g] || g, items });
        groupMap.delete(g);
      }
    }
    // Any remaining ungrouped
    for (const [g, items] of groupMap) {
      groups.push({ group: g, label: GROUP_LABELS[g] || g, items });
    }

    return groups;
  }, [dimensions]);

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-header">
        <h2 className="logo">{'\u{1F9E0}'} Company Brain</h2>
        {workspaceName && <div className="sub">{workspaceName}</div>}
        <div className="sub">Feb 23 {'\u2013'} Mar 11, 2026</div>
      </div>

      <div className="sidebar-nav">
        <div
          className={`nav-item${currentView === 'overview' ? ' active' : ''}`}
          onClick={() => handleClick('overview')}
        >
          <span className="icon">{'\uD83C\uDFE0'}</span>Overview
        </div>
        <div
          className={`nav-item${currentView === 'vem' ? ' active' : ''}`}
          onClick={() => handleClick('vem')}
        >
          <span className="icon">{'\uD83D\uDDFA\uFE0F'}</span>Vision to Execution
        </div>

        {grouped.map(({ group, label, items }) => (
          <div key={group}>
            <div className="nav-section">{label}</div>
            {items.map(({ dim, index }) => {
              // Skip — already shown as doc view above
              if (dim.id === 'vision_execution_map') return null;
              // Special views that aren't tree dimensions
              if (dim.id === 'competitor') {
                return (
                  <div
                    key={dim.id}
                    className={`nav-item${currentView === 'competitor' ? ' active' : ''}`}
                    onClick={() => handleClick('competitor')}
                  >
                    <span className="icon">{dim.icon}</span>
                    {dim.title}
                  </div>
                );
              }
              if (dim.id === 'strategic-partners') {
                return (
                  <div
                    key={dim.id}
                    className={`nav-item${currentView === 'partners' ? ' active' : ''}`}
                    onClick={() => handleClick('partners')}
                  >
                    <span className="icon">{dim.icon}</span>
                    {dim.title}
                  </div>
                );
              }
              if (dim.id === 'task_search') {
                return (
                  <div
                    key={dim.id}
                    className={`nav-item${currentView === 'tasks' ? ' active' : ''}`}
                    onClick={() => handleClick('tasks')}
                  >
                    <span className="icon">{dim.icon}</span>
                    {dim.title}
                  </div>
                );
              }
              return (
                <div
                  key={dim.id}
                  className={`nav-item${currentView === 'd3' && currentDimIndex === index ? ' active' : ''}`}
                  onClick={() => handleClick('d3', index)}
                >
                  <span className="icon">{dim.icon}</span>
                  {dim.title}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <button
          className={`settings-icon-btn${currentView === 'settings' ? ' active' : ''}`}
          onClick={() => handleClick('settings')}
          title="Settings"
        >
          <Settings size={18} />
        </button>
        <UserButton />
      </div>
    </aside>
  );
}
