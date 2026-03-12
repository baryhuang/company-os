import { useState, useCallback } from 'react';
import { SignInButton, SignedIn, SignedOut, UserButton, useUser } from '@insforge/react';
import { useAtlasData } from './hooks/useAtlasData';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { MarkmapDimensionView } from './components/MarkmapView';
import { OverviewView } from './components/OverviewView';
import { CompetitorView } from './components/CompetitorView';
import { TaskSearchView } from './components/TaskSearchView';
import { SwimGanttView } from './components/SwimGanttView';
import { AppointmentsView } from './components/AppointmentsView';
import { VEMDocumentView } from './components/VEMDocumentView';
import { PartnersView } from './components/PartnersView';
import type { ViewType } from './types';

function AuthenticatedApp() {
  const { user } = useUser();
  const userId = user!.id;
  const { dimensions, dimensionsData, landscapeData, progressData, appointmentsData, loading, error } = useAtlasData(userId);
  const [currentView, setCurrentView] = useState<ViewType>('overview');
  const [currentDimIndex, setCurrentDimIndex] = useState(0);
  const [expandLevel, setExpandLevel] = useState(-1);
  const [fitRequest, setFitRequest] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [buildTab, setBuildTab] = useState<'tree' | 'gantt'>('gantt');
  const [peopleTab, setPeopleTab] = useState<'tree' | 'meetings'>('tree');

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

  if (loading) {
    return <div className="loading-screen">Loading your Decision Atlas...</div>;
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
      <button className="mobile-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
        {'\u2630'}
      </button>
      <div className="user-button-wrapper">
        <UserButton />
      </div>
      <div className="app">
        <Sidebar
          dimensions={dimensions}
          currentView={currentView}
          currentDimIndex={currentDimIndex}
          onSwitch={handleSwitch}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <div className="main">
          <TopBar
              currentView={currentView}
              currentDimIndex={currentDimIndex}
              dimensions={dimensions}
              expandLevel={expandLevel}
              onExpandLevel={handleExpandLevel}
            />

          {currentView === 'overview' && (
            <OverviewView
              dimensions={dimensions}
              dimensionsData={dimensionsData}
              onSwitch={handleSwitch}
            />
          )}

          {currentView === 'vem' && dimensionsData['vision_execution_map'] && (
            <VEMDocumentView treeData={dimensionsData['vision_execution_map']} />
          )}

          {currentView === 'd3' && dimensions[currentDimIndex] && dimensionsData[dimensions[currentDimIndex].id] && (
            <>
              {dimensions[currentDimIndex].id === 'build' && (
                <div className="view-tabs">
                  <button className={`tab-btn${buildTab === 'tree' ? ' active' : ''}`} onClick={() => setBuildTab('tree')}>Build Status</button>
                  <button className={`tab-btn${buildTab === 'gantt' ? ' active' : ''}`} onClick={() => setBuildTab('gantt')}>Timeline</button>
                </div>
              )}
              {dimensions[currentDimIndex].id === 'people-network' && (
                <div className="view-tabs">
                  <button className={`tab-btn${peopleTab === 'tree' ? ' active' : ''}`} onClick={() => setPeopleTab('tree')}>Relationship Map</button>
                  <button className={`tab-btn${peopleTab === 'meetings' ? ' active' : ''}`} onClick={() => setPeopleTab('meetings')}>Meetings</button>
                </div>
              )}
              {buildTab === 'gantt' && dimensions[currentDimIndex].id === 'build'
                ? <SwimGanttView treeData={progressData || dimensionsData[dimensions[currentDimIndex].id]} />
                : peopleTab === 'meetings' && dimensions[currentDimIndex].id === 'people-network' && appointmentsData
                ? <AppointmentsView data={appointmentsData} />
                : <MarkmapDimensionView
                    treeData={dimensionsData[dimensions[currentDimIndex].id]}
                    expandLevel={expandLevel}
                    onFitRequest={fitRequest}
                  />
              }
            </>
          )}

          {currentView === 'competitor' && landscapeData && (
            <CompetitorView data={landscapeData} />
          )}

          {currentView === 'partners' && dimensionsData['strategic-partners'] && (
            <PartnersView treeData={dimensionsData['strategic-partners']} />
          )}

          {currentView === 'tasks' && (
            <TaskSearchView />
          )}

        </div>
      </div>
    </>
  );
}

export default function App() {
  return (
    <>
      <SignedOut>
        <div className="login-screen">
          <h1>Decision Atlas</h1>
          <p>Sign in to explore your strategic decisions</p>
          <SignInButton />
        </div>
      </SignedOut>
      <SignedIn>
        <AuthenticatedApp />
      </SignedIn>
    </>
  );
}
