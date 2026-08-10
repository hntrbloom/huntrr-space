import React, { useRef, useEffect, useState } from 'react';
import { CheckCircle2, Armchair, SquarePen, Box, Award, Calendar, FileText, BarChart, Printer, Bell, Image, Smile, X, BookOpen, Briefcase, Target, Key , Settings } from 'lucide-react';
import { ViewState } from '../types';

interface NavProps {
  isOpen?: boolean;
  onClose?: () => void;
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
}

export function Sidebar({ currentView, onChangeView, isOpen = true, onClose }: NavProps) {
  const navItems: { id: ViewState; label: string; Icon: any }[] = [
    { id: 'log', label: 'Daily Log', Icon: SquarePen },
    { id: 'habits', label: 'Habit Tracker', Icon: CheckCircle2 },
    { id: 'minifurniture', label: 'Prints', Icon: Box },
    { id: 'goals', label: 'Goals', Icon: Target },
    { id: 'month', label: 'Monthly View', Icon: Calendar },
    { id: 'notes', label: 'Notes', Icon: FileText },
    { id: 'blog', label: 'Blog', Icon: BookOpen },
    { id: 'streaks', label: 'Streaks', Icon: Award },
    { id: 'pinterest', label: 'Boards', Icon: Image },
    { id: 'wiki', label: 'Character Wiki', Icon: FileText },
    { id: 'jobs', label: 'Job Applications', Icon: Briefcase },
    { id: 'settings', label: 'Settings', Icon: Settings },
  ];

  return (
    <>
      {/* Mobile backdrop overlay only (hidden on desktop) */}
      <div 
        className={`fixed inset-0 bg-black/20 z-40 transition-opacity duration-300 md:hidden ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <nav 
        className={`
          flex flex-col h-[100dvh] bg-white border-r border-surface-container-low py-margin-desktop overflow-y-auto overflow-x-hidden shadow-[0_8px_24px_rgba(125,97,144,0.02)]
          transition-all duration-300 ease-in-out
          
          /* Mobile: fixed temporary overlay */
          fixed left-0 top-0 z-50 w-64
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}

          /* Desktop: persistent in-flow collapsible sidebar */
          md:sticky md:top-0 md:translate-x-0 md:z-10 md:shrink-0
          ${isOpen ? 'md:w-64 md:ml-0 md:opacity-100 md:border-r' : 'md:w-0 md:ml-0 md:opacity-0 md:border-r-0 md:pointer-events-none md:overflow-hidden'}
        `}
      >
        <div className="w-64 min-w-[256px] flex flex-col h-full shrink-0">
          <div className="px-gutter mb-12 flex items-center justify-between">
            <h1 className="text-[28px] leading-[1.3] font-semibold font-headline-md text-[#111111] tracking-tight">Planner</h1>
            <button 
              onClick={onClose} 
              aria-label="Close sidebar"
              className="p-2 -mr-2 text-[#666666] hover:text-[#222222] hover:bg-surface-variant rounded-full transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex flex-col space-y-2 px-4 pb-12">
            {navItems.map((item) => {
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onChangeView(item.id);
                    // Only close sidebar on mobile screen sizes
                    if (window.innerWidth < 768 && onClose) {
                      onClose();
                    }
                  }}
                  className={`flex items-center gap-4 px-4 py-3 rounded-full transition-all duration-150 cursor-pointer ${
                  isActive
                    ? 'text-on-primary font-bold bg-primary border-l-4 border-primary scale-95'
                    : 'text-[#666666] hover:bg-primary/10 hover:text-[#222222]'
                }`}
              >
                <item.Icon className={`w-5 h-5 ${isActive ? 'text-[#333333]' : 'text-[#666666]'}`} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[14px] leading-[1.2] font-semibold tracking-[0.05em] font-label-md">{item.label}</span>
              </button>
            );
          })}
          </div>
        </div>
      </nav>
    </>
  );
}

export function BottomNav({ currentView, onChangeView }: NavProps) {
  const navItems: { id: ViewState; label: string; Icon: any }[] = [
    { id: 'log', label: 'Log', Icon: SquarePen },
    { id: 'habits', label: 'Habits', Icon: CheckCircle2 },
    { id: 'goals', label: 'Goals', Icon: Target },
    { id: 'minifurniture', label: 'Prints', Icon: Box },
    { id: 'streaks', label: 'Streaks', Icon: Award },
    { id: 'pinterest', label: 'Boards', Icon: Image },
    { id: 'wiki', label: 'Wiki', Icon: FileText },
    { id: 'jobs', label: 'Jobs', Icon: Briefcase },
    { id: 'settings', label: 'Settings', Icon: Settings },
    { id: 'month', label: 'Month', Icon: Calendar },
    { id: 'notes', label: 'Notes', Icon: FileText },
    { id: 'blog', label: 'Blog', Icon: BookOpen },
  ];

  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const barRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const handleResize = () => {
      if (window.visualViewport) {
        // If visual viewport is significantly smaller than window height, keyboard is likely open
        const isKeyboard = window.visualViewport.height < window.innerHeight - 100;
        setIsKeyboardOpen(isKeyboard);
      }
    };
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
      // Initial check
      handleResize();
      return () => window.visualViewport.removeEventListener('resize', handleResize);
    }
  }, []);

  useEffect(() => {
    if (barRef.current && window.innerWidth < 768) {
      const observer = new ResizeObserver((entries) => {
        for (let entry of entries) {
           const height = entry.contentRect.height;
           const visualHeight = isKeyboardOpen ? 0 : height;
           document.documentElement.style.setProperty('--bottom-nav-height', `${visualHeight}px`);
        }
      });
      observer.observe(barRef.current);
      return () => observer.disconnect();
    } else {
      document.documentElement.style.setProperty('--bottom-nav-height', '0px');
    }
  }, [isKeyboardOpen]);

  // Scroll active tab into view on view change
  useEffect(() => {
    if (currentView && itemRefs.current[currentView]) {
      itemRefs.current[currentView]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [currentView]);

  return (
    <nav 
      ref={barRef}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        overflowX: 'auto',
        overflowY: 'hidden',
        touchAction: 'pan-x',
        overscrollBehavior: 'contain',
        overscrollBehaviorX: 'contain',
        WebkitOverflowScrolling: 'touch',
        paddingBottom: 'calc(6px + env(safe-area-inset-bottom, 0px))',
      }}
      className={`mobile-bottom-nav md:hidden fixed bottom-0 left-0 right-0 z-50 flex flex-nowrap items-center w-full overflow-x-auto overflow-y-hidden no-scrollbar px-1 pt-1.5 bg-white/95 backdrop-blur-md shadow-[0_-4px_20px_rgba(0,0,0,0.08)] border-t border-outline-variant/30 ${isKeyboardOpen ? 'hidden' : 'flex'}`}
    >
      {navItems.map((item) => {
        const isActive = currentView === item.id;
        return (
          <button
            key={item.id}
            ref={(el) => { itemRefs.current[item.id] = el; }}
            onClick={() => onChangeView(item.id)}
            className={`flex-none w-[58px] min-w-[58px] max-w-[58px] flex flex-col items-center justify-center py-1 px-0.5 transition-colors duration-150 cursor-pointer ${
              isActive
                ? 'text-primary'
                : 'text-[#666666] hover:text-[#222222]'
            }`}
          >
            <item.Icon className={`w-5 h-5 mb-0.5 shrink-0 ${isActive ? 'text-primary' : 'text-[#666666]'}`} strokeWidth={isActive ? 2.5 : 2} />
            <span className={`w-full text-center block whitespace-nowrap overflow-hidden text-ellipsis leading-tight tracking-tight ${
              isActive 
                ? 'nav-label-active text-[10px] font-semibold text-primary' 
                : 'nav-label-inactive text-[9px] min-[380px]:text-[10px] font-normal text-[#666666]'
            }`}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
