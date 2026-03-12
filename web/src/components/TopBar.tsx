import type { ViewType, DimensionMeta } from '../types';

interface TopBarProps {
  currentView: ViewType;
  currentDimIndex: number;
  dimensions: DimensionMeta[];
  expandLevel: number;
  onExpandLevel: (level: number) => void;
}

export function TopBar({ currentView, currentDimIndex, dimensions, expandLevel, onExpandLevel }: TopBarProps) {
  let title = 'Company Brain';
  let desc = '8 dimensions + competitive evolution';

  if (currentView === 'overview') {
    title = 'Executive Overview';
    desc = 'Timeline view across all decision dimensions';
  } else if (currentView === 'd3' && dimensions[currentDimIndex]) {
    const dim = dimensions[currentDimIndex];
    title = dim.title;
    desc = dim.desc;
  } else if (currentView === 'competitor') {
    title = '竞争格局';
    desc = '竞争对手全景分析';
  } else if (currentView === 'tasks') {
    title = 'Task Search';
    desc = 'Semantic search across Linear tasks';
  } else if (currentView === 'settings') {
    title = 'Settings';
    desc = 'Workspace sharing & configuration';
  }

  const showButtons = currentView === 'd3';

  const levelButtons = [
    { label: 'Summary', value: 2 },
    { label: 'Detail', value: 3 },
    { label: 'Deep Dive', value: 4 },
    { label: 'All', value: -1 },
  ];

  return (
    <div className="topbar">
      <div>
        <h1>{title}</h1>
        <div className="desc">{desc}</div>
      </div>
      {showButtons && (
        <div className="actions">
          {levelButtons.map(b => (
            <button
              key={b.label}
              className={`btn${expandLevel === b.value ? ' active' : ''}`}
              onClick={() => onExpandLevel(b.value)}
            >
              {b.label}
            </button>
          ))}
          <button className="btn" onClick={() => onExpandLevel(0)}>
            Fit View
          </button>
        </div>
      )}
    </div>
  );
}
