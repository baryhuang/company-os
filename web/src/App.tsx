import { useState, useCallback, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useUser, SignInButton } from '@insforge/react';
import { useAtlasData } from './hooks/useAtlasData';
import { useWorkspace } from './hooks/useWorkspace';
import { useTimelineRange } from './hooks/useTimelineCutoff';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { MarkmapDimensionView } from './components/MarkmapView';
import { CompetitorView } from './components/CompetitorView';
import { TaskSearchView } from './components/TaskSearchView';
import { TodoView } from './components/TodoView';
import { SwimGanttView } from './components/SwimGanttView';
import { AppointmentsView } from './components/AppointmentsView';
import { VEMDocumentView } from './components/VEMDocumentView';
import { PartnersView } from './components/PartnersView';
import { OKRTableView } from './components/OKRTableView';
import { CustomerDiscoveryView } from './components/CustomerDiscoveryView';
import { WorkspacePicker } from './components/WorkspacePicker';
import { SettingsView } from './components/SettingsView';
import { LandingPage } from './components/LandingPage';
import { ConversationsView } from './components/ConversationsView';
import { PeopleView } from './components/PeopleView';
import { ChatWidget } from './components/ChatWidget';
import type { ViewType } from './types';

function AuthenticatedApp() {
  const { user } = useUser();
  const { workspace, workspaces, loading: wsLoading, needsPicker, selectWorkspace } = useWorkspace(user ?? null);
  const userId = workspace?.ownerId ?? user!.id;
  const { dimensions, dimensionsData, landscapeData, progressData, appointmentsData, tasksData, conversationsData, customerDiscoveryData, loading, error, refetchTasks, refetchView } = useAtlasData(userId);
  const [currentView, setCurrentView] = useState<ViewType>('todo');
  const [currentDimIndex, setCurrentDimIndex] = useState(0);
  const [expandLevel, setExpandLevel] = useState(-1);
  const [fitRequest, setFitRequest] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [buildTab, setBuildTab] = useState<'tree' | 'gantt'>('gantt');
  const [timelineRange, setTimelineRange] = useTimelineRange();
  const [savedRange, setSavedRange] = useState<{ startOrd: number | null; endOrd: number | null } | null>(null);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    document.body.classList.toggle('sidebar-open', sidebarOpen);
    return () => document.body.classList.remove('sidebar-open');
  }, [sidebarOpen]);

  const handleResetTimeline = useCallback(() => {
    const isFiltered = timelineRange.startOrd !== null || timelineRange.endOrd !== null;
    if (isFiltered) {
      // Save current range and reset to all
      setSavedRange({ startOrd: timelineRange.startOrd, endOrd: timelineRange.endOrd });
      setTimelineRange({ startOrd: null, endOrd: null });
    } else if (savedRange) {
      // Restore saved range
      setTimelineRange(savedRange);
      setSavedRange(null);
    }
  }, [timelineRange, savedRange, setTimelineRange]);

  const handleRefresh = useCallback(async () => {
    switch (currentView) {
      case 'todo': return refetchView('tasks');
      case 'conversations': return refetchView('conversations');
      case 'vem': return refetchView('vision_execution_map');
      case 'competitor': return refetchView('landscape');
      case 'partners': return refetchView('strategic-partners');
      case 'people': return refetchView('people-network');
      case 'okr': return refetchView('okr_kpi');
      case 'customer-discovery': return refetchView('customer_discovery');
      case 'd3': {
        const dim = dimensions[currentDimIndex];
        if (dim) {
          await refetchView(dim.id);
          if (dim.id === 'build') await refetchView('progress');
        }
        return;
      }
      default: return;
    }
  }, [currentView, currentDimIndex, dimensions, refetchView]);

  const handleSwitch = useCallback((view: ViewType, dimIndex?: number) => {
    setCurrentView(view);
    if (dimIndex !== undefined) setCurrentDimIndex(dimIndex);
  }, []);

  const handleExpandLevel = useCallback((level: number) => {
    if (level === 0) {
      setFitRequest(prev => !prev);
    } else {
      setExpandLevel(level);
    }
  }, []);

  if (wsLoading) {
    return <div className="loading-screen">Loading workspaces...</div>;
  }

  if (needsPicker) {
    return <WorkspacePicker workspaces={workspaces} onSelect={selectWorkspace} />;
  }

  if (loading) {
    return <div className="loading-screen">Loading your Company OS...</div>;
  }

  if (error) {
    return (
      <div className="error-screen">
        <h2>Load Failed</h2>
        <p>Please access via HTTP server (file:// protocol not supported)</p>
        <pre>{error}</pre>
      </div>
    );
  }

  return (
    <>
      <ElectronDragBar />
      <div className={`sidebar-backdrop${sidebarOpen ? ' visible' : ''}`} onClick={() => setSidebarOpen(false)} />
      <div className={`app${isElectron ? ' layout-main' : ''}`}>
        <Sidebar
          dimensions={dimensions}
          currentView={currentView}
          currentDimIndex={currentDimIndex}
          onSwitch={handleSwitch}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          workspaceName={workspace?.name}
        />
        <div className="main">
          <TopBar
              currentView={currentView}
              currentDimIndex={currentDimIndex}
              dimensions={dimensions}
              expandLevel={expandLevel}
              onExpandLevel={handleExpandLevel}
              timelineRange={timelineRange}
              onResetTimeline={handleResetTimeline}
              onRefresh={currentView !== 'settings' && currentView !== 'tasks' ? handleRefresh : undefined}
              onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
              onChatToggle={() => setChatOpen(!chatOpen)}
            />

          {currentView === 'todo' && tasksData && (
            <TodoView treeData={tasksData} userId={userId} onRefetch={refetchTasks} timelineRange={timelineRange} onTimelineRangeChange={setTimelineRange} />
          )}

          {currentView === 'conversations' && conversationsData && (
            <ConversationsView treeData={conversationsData} />
          )}

          {currentView === 'vem' && dimensionsData['vision_execution_map'] && (
            <VEMDocumentView treeData={dimensionsData['vision_execution_map']} timelineRange={timelineRange} onTimelineRangeChange={setTimelineRange} />
          )}

          {currentView === 'd3' && dimensions[currentDimIndex] && dimensionsData[dimensions[currentDimIndex].id] && (
            <>
              {dimensions[currentDimIndex].id === 'build' && (
                <div className="view-tabs">
                  <button className={`tab-btn${buildTab === 'tree' ? ' active' : ''}`} onClick={() => setBuildTab('tree')}>Build Status</button>
                  <button className={`tab-btn${buildTab === 'gantt' ? ' active' : ''}`} onClick={() => setBuildTab('gantt')}>Timeline</button>
                </div>
              )}
              {buildTab === 'gantt' && dimensions[currentDimIndex].id === 'build'
                ? <SwimGanttView treeData={progressData || dimensionsData[dimensions[currentDimIndex].id]} timelineRange={timelineRange} onTimelineRangeChange={setTimelineRange} />
                : <MarkmapDimensionView
                    treeData={dimensionsData[dimensions[currentDimIndex].id]}
                    expandLevel={expandLevel}
                    onFitRequest={fitRequest}
                    timelineRange={timelineRange}
                    onTimelineRangeChange={setTimelineRange}
                  />
              }
            </>
          )}

          {currentView === 'competitor' && landscapeData && (
            <CompetitorView data={landscapeData} timelineRange={timelineRange} onTimelineRangeChange={setTimelineRange} />
          )}

          {currentView === 'partners' && dimensionsData['strategic-partners'] && (
            <PartnersView treeData={dimensionsData['strategic-partners']} />
          )}

          {currentView === 'people' && dimensionsData['people-network'] && (
            <PeopleView treeData={dimensionsData['people-network']} />
          )}

          {currentView === 'okr' && dimensionsData['okr_kpi'] && (
            <OKRTableView treeData={dimensionsData['okr_kpi']} timelineRange={timelineRange} onTimelineRangeChange={setTimelineRange} />
          )}

          {currentView === 'customer-discovery' && customerDiscoveryData && (
            <CustomerDiscoveryView treeData={customerDiscoveryData} />
          )}

          {currentView === 'tasks' && (
            <TaskSearchView />
          )}

          {currentView === 'settings' && workspace && (
            <SettingsView
              workspace={workspace}
              workspaces={workspaces}
              onSelectWorkspace={selectWorkspace}
            />
          )}

        </div>
      </div>
      <ChatWidget isOpen={chatOpen} onToggle={setChatOpen} userId={userId} />
    </>
  );
}

const isElectron = !!window.electronAPI;

function ElectronDragBar() {
  if (!isElectron) return null;
  return (
    <div
      className="app-drag-region"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 28,
        zIndex: 1000,
        backgroundColor: 'transparent',
      }}
    />
  );
}

function ProtectedDashboard() {
  const { user, isLoaded } = useUser();
  if (!isLoaded) return (<><ElectronDragBar /><div className="loading-screen">Loading...</div></>);
  if (!user) {
    if (isElectron) {
      return (
        <>
          <ElectronDragBar />
          <div className="loading-screen" style={{ flexDirection: 'column', gap: 24 }}>
            <h2 style={{ margin: 0, fontWeight: 600 }}>Company OS</h2>
            <p style={{ margin: 0, opacity: 0.6 }}>Sign in to access your dashboard</p>
            <SignInButton className="settings-btn primary">Sign In</SignInButton>
          </div>
        </>
      );
    }
    return <Navigate to="/" replace />;
  }
  return <AuthenticatedApp />;
}

function HomeRoute() {
  const { user, isLoaded } = useUser();
  const isMobile = window.innerWidth <= 767;
  if (isLoaded && user && isMobile) {
    return <Navigate to="/dashboard" replace />;
  }
  return <LandingPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={isElectron ? <ProtectedDashboard /> : <HomeRoute />} />
        <Route path="/dashboard" element={<ProtectedDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
