import React, { useState, useEffect } from 'react';
import { Menu, AlertTriangle } from 'lucide-react';
import { BottomNav, Sidebar } from './components/Navigation';
import { NotesView } from './components/NotesView';
import { HabitsView } from './components/HabitsView';
import { DailyLogView } from './components/DailyLogView';
import { MonthlyView } from './components/MonthlyView';
import { PrintingCatalogView } from './components/PrintingCatalogView';
import { InspirationView } from './components/InspirationView';
import { StreaksView } from './components/StreaksView';
import { CharacterWikiView } from './components/CharacterWikiView';
import { MiniFurnitureView } from './components/MiniFurnitureView';
import { BlogView } from './components/BlogView';
import { GoalsView } from './components/GoalsView';
import { JobApplicationsView } from './components/JobApplicationsView';
import { KeychainsView } from './components/KeychainsView';
import { ViewState } from './types';
import { db } from './lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from './lib/AuthContext';
import { FocusTimer } from './components/FocusTimer';
import { SettingsView } from './components/SettingsView';
import { runGlobalBase64Migration } from './lib/globalMigration';

export default function App() {
  const { user, logOut } = useAuth();

  useEffect(() => {
    if (!user || user.isAnonymous) return;
    runGlobalBase64Migration(user.uid);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, `users/${user.uid}/preferences`, 'global'), (snap) => {
      if (snap.exists() && snap.data().backgroundColor) {
        document.body.style.backgroundColor = snap.data().backgroundColor;
      } else {
        document.body.style.backgroundColor = '#FFF0F4';
      }
    });
    return () => unsub();
  }, [user]);
  
  const [currentView, setCurrentView] = useState<ViewState>('log');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    try {
      const saved = localStorage.getItem('sidebar_open');
      if (saved !== null) {
        return saved === 'true';
      }
    } catch (e) {
      console.error('Error reading sidebar state:', e);
    }
    return true; // Default open on desktop
  });

  useEffect(() => {
    try {
      localStorage.setItem('sidebar_open', String(isSidebarOpen));
    } catch (e) {
      console.error('Error saving sidebar state:', e);
    }
  }, [isSidebarOpen]);

  const renderView = () => {
    switch (currentView) {
      case 'habits':
        return <HabitsView />;
      case 'goals':
        return <GoalsView />;
      case 'keychains':
      case 'minifurniture':
        return <MiniFurnitureView />;
      case 'log':
        return <DailyLogView />;
      case 'month':
        return <MonthlyView />;
      case 'notes':
        return <NotesView />;
      case 'printing':
        return <PrintingCatalogView />;
      case 'pinterest':
        return <InspirationView />;
      case 'streaks':
        return <StreaksView />;
      case 'wiki':
        return <CharacterWikiView />;
      case 'blog':
        return <BlogView />;
      case 'jobs':
        return <JobApplicationsView />;
      case 'settings':
        return <SettingsView />;
      case 'charts':
        return (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center">
              <h2 className="text-[28px] font-headline-md text-primary mb-2">Coming Soon</h2>
              <p className="text-[16px] font-body-md text-on-surface-variant">This section is being crafted.</p>
            </div>
          </div>
        );
      default:
        return <DailyLogView />;
    }
  };

  return (
    <div className={`app-container text-on-surface font-body-md antialiased min-h-[100dvh] flex flex-col md:flex-row md:overflow-hidden selection:bg-primary-container selection:text-on-primary-container ${user?.isAnonymous ? 'pt-[36px]' : ''}`}>
      {user?.isAnonymous && (
        <div className="fixed top-0 inset-x-0 z-[100] bg-secondary text-on-secondary px-4 py-2 text-center text-[14px] font-bold flex items-center justify-center gap-2 shadow-md">
          <AlertTriangle className="w-4 h-4" />
          Guest Preview — changes will not be saved.
          <button onClick={logOut} className="ml-2 underline font-medium hover:text-white transition-colors">Sign in to save</button>
        </div>
      )}
      
      <FocusTimer />
      
      {/* Menu button shown when sidebar is collapsed */}
      {!isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="fixed top-[20px] left-4 z-40 p-2.5 bg-white/80 backdrop-blur-md hover:bg-white text-[#666666] hover:text-[#222222] rounded-full shadow-md transition-all border border-black/10 flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95"
          aria-label="Open sidebar menu"
          title="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      <Sidebar 
        currentView={currentView} 
        onChangeView={(v) => {
          setCurrentView(v);
        }}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      
      <div className="flex-1 flex flex-col relative w-full md:h-[100dvh] md:overflow-hidden min-w-0 transition-all duration-300 ease-in-out">
        {renderView()}
      </div>

      <BottomNav currentView={currentView} onChangeView={setCurrentView} />
    </div>
  );
}
