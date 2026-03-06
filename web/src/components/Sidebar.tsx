import type { DimensionMeta, ViewType } from '../types';

interface SidebarProps {
  dimensions: DimensionMeta[];
  currentView: ViewType;
  currentDimIndex: number;
  onSwitch: (view: ViewType, dimIndex?: number) => void;
  open: boolean;
  onClose: () => void;
}

const NUM_LABELS = ['\u2460', '\u2461', '\u2462', '\u2463', '\u2464', '\u2465', '\u2466', '\u2467', '\u2468', '\u2469', '\u246A', '\u246B', '\u246C', '\u246D'];

export function Sidebar({ dimensions, currentView, currentDimIndex, onSwitch, open, onClose }: SidebarProps) {
  const handleClick = (view: ViewType, dimIndex?: number) => {
    onSwitch(view, dimIndex);
    onClose();
  };

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-header">
        <div className="logo">{'\u2764\uFE0F'} CareMojo</div>
        <h2>Decision Atlas</h2>
        <div className="sub">Feb 23 {'\u2013'} Mar 5, 2026</div>
      </div>

      <div className="sidebar-nav">
        <div className="nav-section">Overview</div>
        <div
          className={`nav-item${currentView === 'overview' ? ' active' : ''}`}
          onClick={() => handleClick('overview')}
        >
          <span className="icon">{'\uD83D\uDDFA\uFE0F'}</span>Mindmap
        </div>

        <div className="nav-divider" />
        <div className="nav-section">Dimensions (D3 Tree)</div>
        {dimensions.map((dim, i) => (
          <div
            key={dim.id}
            className={`nav-item${currentView === 'd3' && currentDimIndex === i ? ' active' : ''}`}
            onClick={() => handleClick('d3', i)}
          >
            <span className="icon">{dim.icon}</span>
            {dim.title.replace(/决策树$/, '')}
            <span className="num">{NUM_LABELS[i]}</span>
          </div>
        ))}

        <div className="nav-divider" />
        <div className="nav-section">Competitive</div>
        <div
          className={`nav-item${currentView === 'competitor' ? ' active' : ''}`}
          onClick={() => handleClick('competitor')}
        >
          <span className="icon">{'\u2694\uFE0F'}</span>Competitor Evolution
        </div>

        <div className="nav-divider" />
        <div
          className={`nav-item${currentView === 'executive-report' ? ' active' : ''}`}
          onClick={() => handleClick('executive-report')}
        >
          <span className="icon">{'\uD83D\uDCCA'}</span>Executive Report
        </div>
      </div>

      <div className="sidebar-legend">
        <div className="title">Legend</div>
        <div className="legend-row"><div className="legend-dot" style={{ background: 'var(--red)' }} />{'\u274C'} Abandoned</div>
        <div className="legend-row"><div className="legend-dot" style={{ background: 'var(--green)' }} />{'\u2713'} Chosen</div>
        <div className="legend-row"><div className="legend-dot" style={{ background: 'var(--orange)' }} />{'\u25D0'} Partial</div>
        <div className="legend-row"><div className="legend-dot" style={{ background: 'var(--teal)' }} />{'\u2605'} Final</div>
      </div>
    </aside>
  );
}
