import { CalendarRange, CalendarDays } from 'lucide-react';
import type { ViewType, DimensionMeta } from '../types';
import type { TimelineRange } from '../hooks/useTimelineCutoff';

interface TopBarProps {
  currentView: ViewType;
  currentDimIndex: number;
  dimensions: DimensionMeta[];
  expandLevel: number;
  onExpandLevel: (level: number) => void;
  timelineRange: TimelineRange;
  onResetTimeline: () => void;
}

export function TopBar({ currentView, currentDimIndex, dimensions, expandLevel, onExpandLevel, timelineRange, onResetTimeline }: TopBarProps) {
  let title = 'Company Brain';
  let desc = '8 dimensions + competitive evolution';

  if (currentView === 'overview') {
    title = 'Executive Overview';
    desc = 'Timeline view across all decision dimensions';
  } else if (currentView === 'd3' && dimensions[currentDimIndex]) {
    const dim = dimensions[currentDimIndex];
    title = dim.title;
    desc = dim.desc;
  } else if (currentView === 'vem') {
    title = 'Vision to Execution';
    desc = 'Strategic vision mapped to execution milestones';
  } else if (currentView === 'competitor') {
    title = 'Competitors';
    desc = 'Competitive landscape analysis';
  } else if (currentView === 'tasks') {
    title = 'Tasks';
    desc = 'Semantic search across Linear tasks';
  } else if (currentView === 'settings') {
    title = 'Settings';
    desc = 'Workspace sharing & configuration';
  }

  const showButtons = currentView === 'd3';
  const showTimelineToggle = ['overview', 'vem', 'd3', 'competitor', 'okr'].includes(currentView);
  const isFiltered = timelineRange.startOrd !== null || timelineRange.endOrd !== null;

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
      <div className="actions">
        {showButtons && (
          <>
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
          </>
        )}
        {showTimelineToggle && (
          <div className="timeline-toggle" onClick={onResetTimeline} title={isFiltered ? 'Show all time' : 'Restore filtered range'}>
            <div className={`toggle-track${isFiltered ? '' : ' all'}`}>
              <div className="toggle-thumb" />
              <CalendarRange size={12} className="toggle-icon left" />
              <CalendarDays size={12} className="toggle-icon right" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
