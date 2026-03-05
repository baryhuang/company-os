import { useState, useCallback } from 'react';
import { SignInButton, SignedIn, SignedOut, UserButton, useUser } from '@insforge/react';
import { useAtlasData } from './hooks/useAtlasData';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { MarkmapView, MarkmapDimensionView } from './components/MarkmapView';
import { CompetitorView } from './components/CompetitorView';
import { ExecutiveReport } from './components/ExecutiveReport';
import type { ViewType } from './types';

function AuthenticatedApp() {
  const { user } = useUser();
  const userId = user!.id;
  const { dimensions, dimensionsData, competitorData, loading, error } = useAtlasData(userId);
  const [currentView, setCurrentView] = useState<ViewType>('overview');
  const [currentDimIndex, setCurrentDimIndex] = useState(0);
  const [expandLevel, setExpandLevel] = useState(-1);
  const [fitRequest, setFitRequest] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    return <div className="loading-screen">Loading Decision Atlas...</div>;
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
          {currentView !== 'executive-report' && (
            <TopBar
              currentView={currentView}
              currentDimIndex={currentDimIndex}
              dimensions={dimensions}
              expandLevel={expandLevel}
              onExpandLevel={handleExpandLevel}
            />
          )}

          {currentView === 'overview' && (
            <MarkmapView
              dimensions={dimensions}
              dimensionsData={dimensionsData}
              competitorData={competitorData}
              expandLevel={expandLevel}
              onFitRequest={fitRequest}
            />
          )}

          {currentView === 'd3' && dimensions[currentDimIndex] && dimensionsData[dimensions[currentDimIndex].id] && (
            <MarkmapDimensionView
              treeData={dimensionsData[dimensions[currentDimIndex].id]}
              expandLevel={expandLevel}
              onFitRequest={fitRequest}
            />
          )}

          {currentView === 'competitor' && competitorData && (
            <CompetitorView data={competitorData} />
          )}

          {currentView === 'executive-report' && (
            <ExecutiveReport />
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
          <p>Sign in to access your atlas data</p>
          <SignInButton />
        </div>
      </SignedOut>
      <SignedIn>
        <AuthenticatedApp />
      </SignedIn>
    </>
  );
}
