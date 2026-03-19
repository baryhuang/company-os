import { CalendarRange, CalendarDays, Menu, MessageCircle } from 'lucide-react';
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
  onMenuToggle?: () => void;
  onChatToggle?: () => void;
}

export function TopBar({ currentView, currentDimIndex, dimensions, expandLevel, onExpandLevel, timelineRange, onResetTimeline, onMenuToggle, onChatToggle }: TopBarProps) {
  let title = 'Company OS';
  let desc = '8 dimensions + competitive evolution';

  if (currentView === 'todo') {
    title = 'Dashboard';
    desc = 'Action items & follow-ups';
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
  const showTimelineToggle = ['todo', 'vem', 'd3', 'competitor', 'okr'].includes(currentView);
  const isFiltered = timelineRange.startOrd !== null || timelineRange.endOrd !== null;

  const levelButtons = [
    { label: 'Summary', value: 2 },
    { label: 'Detail', value: 3 },
    { label: 'Deep Dive', value: 4 },
    { label: 'All', value: -1 },
  ];

  return (
    <div className="topbar">
      {onMenuToggle && (
        <button className="topbar-mobile-btn menu-btn" onClick={onMenuToggle} aria-label="Menu">
          <Menu size={18} />
        </button>
      )}
      <div className="topbar-title-block">
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
        {onChatToggle && (
          <button className="topbar-mobile-btn chat-btn" onClick={onChatToggle} aria-label="Chat">
            <MessageCircle size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
