import { useState, useCallback, lazy, Suspense, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import TopAppBar from './components/TopAppBar';
import BottomNavBar from './components/BottomNavBar';
import FloatingChat from './components/FloatingChat';
import WelcomeOverlay from './components/WelcomeOverlay';
import LoginPage from './pages/LoginPage';

// Lazy-load heavy pages for code-splitting (Fix #18 from audit)
const HomePage = lazy(() => import('./pages/HomePage'));
const RecordPage = lazy(() => import('./pages/RecordPage'));
const LibraryPage = lazy(() => import('./pages/LibraryPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const ResultsPage = lazy(() => import('./pages/ResultsPage'));
const CoachModePage = lazy(() => import('./pages/CoachModePage'));
const BallTrackerPage = lazy(() => import('./pages/BallTrackerPage'));
const ChallengesPage = lazy(() => import('./pages/ChallengesPage'));
const ProgressPage = lazy(() => import('./pages/ProgressPage'));
const ComparePage = lazy(() => import('./pages/ComparePage'));

/**
 * Loading fallback for lazy-loaded pages
 */
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <span className="material-symbols-outlined text-primary-fixed text-3xl animate-spin">
        progress_activity
      </span>
    </div>
  );
}

export default function App() {
  const { user, loading, isFirebaseConfigured: hasAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [analysisData, setAnalysisData] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ── Navigation hooks (MUST be before any conditional returns — Rules of Hooks) ──
  const handleNavigate = useCallback((page) => {
    const routeMap = {
      home: '/',
      record: '/record',
      coach: '/coach',
      library: '/library',
      profile: '/profile',
      balltracker: '/balltracker',
      challenges: '/challenges',
      progress: '/progress',
      results: '/results',
      compare: '/compare',
    };
    navigate(routeMap[page] || '/');
  }, [navigate]);

  const handleAnalysisComplete = useCallback((data) => {
    setAnalysisData(data);
    navigate('/results');
  }, [navigate]);

  const handleViewAnalysis = useCallback((data) => {
    setAnalysisData(data);
    navigate('/results');
  }, [navigate]);

  // Loading state — Firebase checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <span className="material-symbols-outlined text-primary-fixed text-4xl animate-spin">progress_activity</span>
          <span className="text-on-surface-variant text-xs uppercase tracking-widest font-bold">SWING_AI</span>
        </div>
      </div>
    );
  }

  // Not logged in AND Firebase is configured — show login
  if (!user && hasAuth) {
    return <LoginPage />;
  }

  // Determine active page from URL path for BottomNavBar highlighting
  const pathToPage = {
    '/': 'home',
    '/record': 'record',
    '/coach': 'coach',
    '/library': 'library',
    '/profile': 'profile',
    '/balltracker': 'balltracker',
    '/challenges': 'challenges',
    '/progress': 'progress',
    '/results': 'results',
    '/compare': 'compare',
  };
  const activePage = pathToPage[location.pathname] || 'home';

  // Pages that hide the bottom nav
  const hideNav = activePage === 'results' || activePage === 'balltracker';

  return (
    <div className="min-h-screen bg-background">
      <WelcomeOverlay />
      <TopAppBar />
      {isOffline && (
        <div className="bg-error text-white text-center text-[10px] py-1.5 font-bold uppercase tracking-widest fixed top-16 left-0 right-0 z-40 shadow-[0_4px_12px_rgba(0,0,0,0.5)] flex items-center justify-center gap-2">
          <span className="material-symbols-outlined text-[14px]">wifi_off</span>
          Offline Mode
        </div>
      )}
      <main className="pt-16 pb-24">
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route
                path="/"
                element={<HomePage onNavigate={handleNavigate} onViewAnalysis={handleViewAnalysis} />}
              />
              <Route
                path="/record"
                element={<RecordPage onAnalysisComplete={handleAnalysisComplete} onNavigate={handleNavigate} />}
              />
              <Route
                path="/library"
                element={<LibraryPage onViewAnalysis={handleViewAnalysis} />}
              />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/compare" element={<ComparePage />} />
              <Route
                path="/results"
                element={<ResultsPage data={analysisData} onBack={() => navigate('/')} />}
              />
              <Route
                path="/coach"
                element={<CoachModePage onBack={() => navigate('/')} onNavigate={handleNavigate} />}
              />
              <Route
                path="/balltracker"
                element={<BallTrackerPage onBack={() => navigate('/record')} />}
              />
              <Route
                path="/challenges"
                element={<ChallengesPage onBack={() => navigate('/')} onNavigate={handleNavigate} />}
              />
              <Route
                path="/progress"
                element={<ProgressPage onBack={() => navigate('/')} />}
              />
              {/* Catch-all: redirect unknown paths to home */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      {!hideNav && (
        <BottomNavBar activePage={activePage} onNavigate={handleNavigate} />
      )}
      <FloatingChat />
    </div>
  );
}
