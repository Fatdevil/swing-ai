import { useState } from 'react';
import { useAuth } from './auth/AuthContext';
import TopAppBar from './components/TopAppBar';
import BottomNavBar from './components/BottomNavBar';
import HomePage from './pages/HomePage';
import RecordPage from './pages/RecordPage';
import LibraryPage from './pages/LibraryPage';
import ProfilePage from './pages/ProfilePage';
import ResultsPage from './pages/ResultsPage';
import CoachModePage from './pages/CoachModePage';
import BallTrackerPage from './pages/BallTrackerPage';
import ChallengesPage from './pages/ChallengesPage';
import ProgressPage from './pages/ProgressPage';
import LoginPage from './pages/LoginPage';
import WelcomeOverlay from './components/WelcomeOverlay';

export default function App() {
  const { user, loading, isFirebaseConfigured: hasAuth } = useAuth();
  const [currentPage, setCurrentPage] = useState('home');
  const [analysisData, setAnalysisData] = useState(null);

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

  // Logged in — normal app
  const handleNavigate = (page) => {
    setCurrentPage(page);
  };

  const handleAnalysisComplete = (data) => {
    setAnalysisData(data);
    setCurrentPage('results');
  };

  const handleViewAnalysis = (data) => {
    setAnalysisData(data);
    setCurrentPage('results');
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return (
          <HomePage
            onNavigate={handleNavigate}
            onViewAnalysis={handleViewAnalysis}
          />
        );
      case 'record':
        return (
          <RecordPage
            onAnalysisComplete={handleAnalysisComplete}
            onNavigate={handleNavigate}
          />
        );
      case 'library':
        return (
          <LibraryPage
            onViewAnalysis={handleViewAnalysis}
          />
        );
      case 'profile':
        return <ProfilePage />;
      case 'results':
        return (
          <ResultsPage
            data={analysisData}
            onBack={() => setCurrentPage('home')}
          />
        );
      case 'coach':
        return (
          <CoachModePage
            onBack={() => setCurrentPage('home')}
            onNavigate={handleNavigate}
          />
        );
      case 'balltracker':
        return (
          <BallTrackerPage
            onBack={() => setCurrentPage('record')}
          />
        );
      case 'challenges':
        return (
          <ChallengesPage
            onBack={() => setCurrentPage('home')}
            onNavigate={handleNavigate}
          />
        );
      case 'progress':
        return (
          <ProgressPage
            onBack={() => setCurrentPage('home')}
          />
        );
      default:
        return <HomePage onNavigate={handleNavigate} onViewAnalysis={handleViewAnalysis} />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <WelcomeOverlay />
      <TopAppBar />
      <main className="pt-16 pb-24">
        {renderPage()}
      </main>
      {currentPage !== 'results' && currentPage !== 'balltracker' && (
        <BottomNavBar activePage={currentPage} onNavigate={handleNavigate} />
      )}
    </div>
  );
}
