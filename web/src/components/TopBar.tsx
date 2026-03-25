import { useState } from 'react';
import { CalendarRange, CalendarDays, Menu, MessageCircle, RefreshCw } from 'lucide-react';
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
  onRefresh?: () => Promise<void>;
  onMenuToggle?: () => void;
  onChatToggle?: () => void;
}

export function TopBar({ currentView, currentDimIndex, dimensions, expandLevel, onExpandLevel, timelineRange, onResetTimeline, onRefresh, onMenuToggle, onChatToggle }: TopBarProps) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };
  // Views that have their own header — hide the topbar title block
  const viewsWithOwnHeader = new Set<ViewType>(['conversations', 'people', 'partners', 'okr', 'settings', 'tasks']);
  const hideTitle = viewsWithOwnHeader.has(currentView);

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
  }

  const showButtons = currentView === 'd3';
  const showTimelineToggle = ['todo', 'vem', 'd3', 'competitor', 'okr'].includes(currentView);
  const showTopbar = !hideTitle || showButtons || showTimelineToggle || !!onRefresh;
  const isFiltered = timelineRange.startOrd !== null || timelineRange.endOrd !== null;

  const levelButtons = [
    { label: 'Summary', value: 2 },
    { label: 'Detail', value: 3 },
    { label: 'Deep Dive', value: 4 },
    { label: 'All', value: -1 },
  ];

  if (!showTopbar) {
    return null;
  }

  return (
    <div className="topbar">
      {onMenuToggle && (
        <button className="topbar-mobile-btn menu-btn" onClick={onMenuToggle} aria-label="Menu">
          <Menu size={18} />
        </button>
      )}
      {!hideTitle && (
        <div className="topbar-title-block">
          <h1>{title}</h1>
          <div className="desc">{desc}</div>
        </div>
      )}
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
        {onRefresh && (
          <button
            className={`btn topbar-refresh${refreshing ? ' spinning' : ''}`}
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh data"
          >
            <RefreshCw size={14} />
          </button>
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
