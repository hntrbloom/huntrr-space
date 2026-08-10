import { safeGetDoc as getDoc, safeGetDocs as getDocs, safeGetDoc } from '../lib/firebase';
import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, X, Clock, Volume2, VolumeX, Bell, BellOff, Check } from 'lucide-react';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { Habit } from './HabitsView';

export type FocusSession = {
  id: string;
  date: string;
  startTime: number;
  durationMinutes: number;
  actualDurationMinutes: number;
  habitId?: string;
  taskTitle?: string;
  completedEarly: boolean;
};

export function FocusTimer() {
  const { user } = useAuth();
  
  const [isOpen, setIsOpen] = useState(false);
  const [habits, setHabits] = useState<Habit[]>([]);

  // Settings
  const [duration, setDuration] = useState(25);
  const [taskTitle, setTaskTitle] = useState('');
  const [selectedHabitId, setSelectedHabitId] = useState('');
  
  const [soundsEnabled, setSoundsEnabled] = useState(true);
  const [volume, setVolume] = useState(0.5);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  
  // Timer state
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(25 * 60);
  
  const endTimeRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Global event listener to open timer
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('open-focus-timer', handleOpen);
    return () => window.removeEventListener('open-focus-timer', handleOpen);
  }, []);

  // Fetch habits for dropdown
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, `users/${user.uid}/preferences`, 'habitsData'), (snap) => {
      if (snap.exists() && snap.data().habits) {
        setHabits(snap.data().habits);
      }
    });
    return () => unsub();
  }, [user]);

  // Load state from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem('focus_timer_state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setDuration(parsed.duration);
        setTaskTitle(parsed.taskTitle || '');
        setSelectedHabitId(parsed.selectedHabitId || '');
        setSoundsEnabled(parsed.soundsEnabled ?? true);
        if (parsed.volume !== undefined) setVolume(parsed.volume);
        setNotificationsEnabled(parsed.notificationsEnabled ?? true);
        
        if (parsed.isActive) {
          setIsActive(true);
          setIsPaused(parsed.isPaused);
          if (parsed.isPaused) {
            setTimeRemaining(parsed.timeRemaining);
          } else {
            endTimeRef.current = parsed.endTime;
            const remaining = Math.max(0, Math.floor((parsed.endTime - Date.now()) / 1000));
            setTimeRemaining(remaining);
            if (remaining === 0) {
              handleTimerComplete();
            }
          }
        } else {
          setTimeRemaining(parsed.duration * 60);
        }
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Save state to local storage whenever it changes
  useEffect(() => {
    const stateToSave = {
      isActive,
      isPaused,
      timeRemaining,
      endTime: endTimeRef.current,
      duration,
      taskTitle,
      selectedHabitId,
      soundsEnabled,
      volume,
      notificationsEnabled
    };
    localStorage.setItem('focus_timer_state', JSON.stringify(stateToSave));
  }, [isActive, isPaused, timeRemaining, duration, taskTitle, selectedHabitId, soundsEnabled, volume, notificationsEnabled]);

  const playSound = () => {
    if (!soundsEnabled) return;
    try {
      let ctx = audioCtxRef.current;
      if (!ctx) {
        ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioCtxRef.current = ctx;
      }
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(1046.50, ctx.currentTime + 0.5); // C6
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 1.5);
    } catch(e) {}
  };

  const showNotification = () => {
    if (!notificationsEnabled || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification('Focus Session Complete!', {
        body: 'Great job! Take a short break.',
        icon: '/vite.svg'
      });
    }
  };

  // Timer loop
  useEffect(() => {
    let interval: any;
    if (isActive && !isPaused) {
      interval = setInterval(() => {
        if (endTimeRef.current) {
          const remaining = Math.max(0, Math.floor((endTimeRef.current - Date.now()) / 1000));
          setTimeRemaining(remaining);
          if (remaining === 0) {
            handleTimerComplete();
            clearInterval(interval);
          }
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive, isPaused]);

  const handleTimerComplete = () => {
    setIsActive(false);
    setIsPaused(false);
    setTimeRemaining(duration * 60);
    endTimeRef.current = null;
    playSound();
    showNotification();
    saveSession(false);
    
  };

  const startTimer = () => {
    // Initialize audio context on user gesture
    if (soundsEnabled && !audioCtxRef.current) {
      try {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch(e) {}
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    // Request notification permission on first start if enabled
    if (notificationsEnabled && 'Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
    
    setIsActive(true);
    setIsPaused(false);
    endTimeRef.current = Date.now() + timeRemaining * 1000;
  };

  const pauseTimer = () => {
    setIsPaused(true);
    endTimeRef.current = null; // stop tracking absolute end time
  };

  const resumeTimer = () => {
    setIsPaused(false);
    endTimeRef.current = Date.now() + timeRemaining * 1000;
  };

  const resetTimer = () => {
    setIsActive(false);
    setIsPaused(false);
    setTimeRemaining(duration * 60);
    endTimeRef.current = null;
  };
  
  const finishEarly = () => {
    saveSession(true);
    resetTimer();
  };

  const saveSession = async (completedEarly: boolean) => {
    if (!user) return;
    
    const actualDurationMinutes = completedEarly 
      ? Math.round((duration * 60 - timeRemaining) / 60)
      : duration;
    if (actualDurationMinutes === 0 && completedEarly) return; // Ignore sessions less than 1 min
    
    const d = new Date();
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    
    const session: FocusSession = {
      id: Date.now().toString(),
      date: dateStr,
      startTime: Date.now() - (actualDurationMinutes * 60 * 1000),
      durationMinutes: duration,
      actualDurationMinutes,
      habitId: selectedHabitId || undefined,
      taskTitle: taskTitle || undefined,
      completedEarly
    };
    
    // Dispatch event so HabitsView can update locally if mounted
    window.dispatchEvent(new CustomEvent('focus-session-saved', { detail: session }));
    
    try {
      const docRef = doc(db, `users/${user.uid}/preferences`, 'focusData');
      const snap = await safeGetDoc(docRef);
      let sessions = [];
      if (snap.exists()) {
        sessions = snap.data().sessions || [];
      }
      sessions.push(session);
      await setDoc(docRef, { sessions }, { merge: true });
    } catch (e) {
      console.error('Error saving focus session', e);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progress = isActive ? ((duration * 60 - timeRemaining) / (duration * 60)) * 100 : 0;
  
  const radius = 120;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  if (!isOpen) {
    return (
      <div 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-28 md:bottom-6 right-6 bg-surface-container-highest border border-outline-variant/40 shadow-lg rounded-full px-4 py-2 flex items-center gap-3 cursor-pointer hover:-translate-y-1 transition-transform z-40"
      >
        {isActive ? (
        <div className="relative flex items-center justify-center">
          <svg className="w-6 h-6 -rotate-90">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" className="text-black/10" />
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" className="text-primary" strokeDasharray={2 * Math.PI * 10} strokeDashoffset={(2 * Math.PI * 10) - (progress / 100) * (2 * Math.PI * 10)} strokeLinecap="round" />
          </svg>
          {isPaused && <Pause className="w-3 h-3 absolute text-primary" />}
        </div>
        ) : (
          <Clock className="w-5 h-5 text-primary" />
        )}
        <span className="font-bold text-on-surface tabular-nums">{isActive ? formatTime(timeRemaining) : 'Timer'}</span>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-surface-container-lowest rounded-3xl shadow-xl max-w-md w-full p-8 flex flex-col gap-6 border border-outline-variant/20 relative">
        <button onClick={() => setIsOpen(false)} className="absolute top-4 right-4 p-2 text-black/40 hover:text-black/80 hover:bg-black/5 rounded-full transition-colors">
          <X className="w-5 h-5" />
        </button>
        
        <h2 className="text-2xl font-bold text-on-surface text-center mt-2">Focus Timer</h2>

        {/* Timer Display */}
        <div className="relative flex items-center justify-center py-6">
          <svg className="w-64 h-64 -rotate-90">
            <circle cx="128" cy="128" r={radius} stroke="currentColor" strokeWidth="8" fill="none" className="text-black/5" />
            <circle 
              cx="128" cy="128" r={radius} 
              stroke="currentColor" 
              strokeWidth="8" 
              fill="none" 
              className="text-primary transition-all duration-1000 ease-linear"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round" 
            />
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="text-5xl font-bold tabular-nums text-on-surface">{formatTime(timeRemaining)}</span>
            {isPaused && <span className="text-sm font-semibold text-primary uppercase tracking-widest mt-2">Paused</span>}
          </div>
        </div>

        {/* Controls */}
        <div className="flex justify-center gap-4">
          {!isActive ? (
            <button onClick={startTimer} className="w-16 h-16 flex items-center justify-center bg-primary text-on-primary rounded-full shadow-md hover:scale-105 transition-transform">
              <Play className="w-8 h-8 ml-1" />
            </button>
          ) : (
            <>
              {isPaused ? (
                <button onClick={resumeTimer} className="w-16 h-16 flex items-center justify-center bg-primary text-on-primary rounded-full shadow-md hover:scale-105 transition-transform">
                  <Play className="w-8 h-8 ml-1" />
                </button>
              ) : (
                <button onClick={pauseTimer} className="w-16 h-16 flex items-center justify-center bg-secondary text-on-secondary rounded-full shadow-md hover:scale-105 transition-transform">
                  <Pause className="w-8 h-8" />
                </button>
              )}
              
              <button onClick={finishEarly} className="w-16 h-16 flex items-center justify-center bg-error/10 text-error rounded-full shadow-sm hover:scale-105 transition-transform" title="Finish Early">
                <Check className="w-8 h-8" />
              </button>

              <button onClick={resetTimer} className="w-16 h-16 flex items-center justify-center bg-surface-container-high text-on-surface-variant rounded-full shadow-sm hover:scale-105 transition-transform" title="Reset">
                <Square className="w-6 h-6" />
              </button>
            </>
          )}
        </div>

        {/* Settings (only visible when not active) */}
        {!isActive && (
          <div className="flex flex-col gap-4 mt-2">
            <div className="flex gap-2 justify-center">
              {[15, 25, 45, 60].map(m => (
                <button 
                  key={m}
                  onClick={() => { setDuration(m); setTimeRemaining(m * 60); }}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${duration === m ? 'bg-primary/20 text-primary border-primary/30' : 'bg-surface-container-high text-on-surface-variant border-transparent hover:bg-surface-container-highest'} border`}
                >
                  {m}m
                </button>
              ))}
              <input 
                type="number" 
                min="1" max="120"
                value={duration}
                onChange={(e) => { 
                  const v = parseInt(e.target.value) || 25; 
                  setDuration(v); 
                  setTimeRemaining(v * 60); 
                }}
                className="w-16 text-center bg-surface-container-high rounded-xl text-sm font-semibold text-on-surface-variant border border-transparent focus:border-primary outline-none"
                title="Custom minutes"
              />
            </div>

            <div className="flex flex-col gap-3 mt-4 border-t border-outline-variant/20 pt-4">
              <input 
                type="text" 
                placeholder="What are you focusing on?" 
                value={taskTitle}
                onChange={e => setTaskTitle(e.target.value)}
                className="w-full bg-surface-container-high px-4 py-3 rounded-xl border border-transparent focus:border-primary outline-none font-medium text-on-surface text-sm"
              />
              
              <select 
                value={selectedHabitId}
                onChange={e => setSelectedHabitId(e.target.value)}
                className="w-full bg-surface-container-high px-4 py-3 rounded-xl border border-transparent focus:border-primary outline-none font-medium text-on-surface text-sm"
              >
                <option value="">-- No linked habit --</option>
                {habits.map(h => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
              
              <div className="flex justify-between items-center mt-2 px-2">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSoundsEnabled(!soundsEnabled)} className="flex items-center gap-2 text-sm font-semibold text-on-surface-variant hover:text-primary transition-colors">
                    {soundsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </button>
                  {soundsEnabled && (
                    <input 
                      type="range" 
                      min="0" max="1" step="0.05"
                      value={volume}
                      onChange={e => setVolume(parseFloat(e.target.value))}
                      className="w-20 accent-primary"
                    />
                  )}
                </div>
                <button onClick={() => setNotificationsEnabled(!notificationsEnabled)} className="flex items-center gap-2 text-sm font-semibold text-on-surface-variant hover:text-primary transition-colors">
                  {notificationsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                  Notifications {notificationsEnabled ? 'On' : 'Off'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
