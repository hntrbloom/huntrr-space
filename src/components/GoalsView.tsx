import { safeGetDoc as getDoc, safeGetDocs as getDocs } from '../lib/firebase';
import React, { useState, useEffect } from 'react';
import { Target, Plus, Trash2, Edit2, X, PlusCircle, MinusCircle } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';
import { SyncStatus } from './SyncStatus';
import { GUEST_SAMPLE_GOALS } from '../lib/guestSampleData';

export type GoalFrequency = 'No Time Limit' | 'Daily' | 'Weekly' | 'Monthly';

export interface GoalHistoryItem {
  period: string;
  completedAmount: number;
  targetAmount: number;
  resetAt: string;
}

export interface Goal {
  id: string;
  name: string;
  currentAmount: number;
  targetAmount: number;
  frequency?: GoalFrequency;
  lastResetPeriod?: string;
  history?: GoalHistoryItem[];
}

function getCurrentPeriodString(frequency: GoalFrequency | undefined): string {
  if (!frequency || frequency === 'No Time Limit') return '';
  const now = new Date();
  if (frequency === 'Daily') {
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  } else if (frequency === 'Weekly') {
    const d = new Date(now);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return `Wk-${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  } else if (frequency === 'Monthly') {
    return `Mo-${now.getFullYear()}-${now.getMonth() + 1}`;
  }
  return '';
}

export function GoalsView() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'offline'>('idle');
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [frequency, setFrequency] = useState<GoalFrequency>('No Time Limit');

  const saveGoals = async (newGoals: Goal[]) => {
    if (!user) return;
    if (user.isAnonymous) {
      setGoals(newGoals);
      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 1500);
      return;
    }
    setSyncStatus('saving');
    try {
      const docRef = doc(db, `users/${user.uid}/preferences`, 'goalsData');
      await setDoc(docRef, { goals: newGoals }, { merge: true });
      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch (e) {
      console.error('Error saving goals:', e);
      setSyncStatus('error');
    }
  };

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (user.isAnonymous) {
      const initialGoals = GUEST_SAMPLE_GOALS.map(g => ({
        id: g.id,
        name: g.title,
        currentAmount: g.progress,
        targetAmount: 100,
        frequency: 'No Time Limit' as GoalFrequency
      }));
      setGoals(initialGoals);
      setLoading(false);
      return;
    }
    
    const unsub = onSnapshot(doc(db, `users/${user.uid}/preferences`, 'goalsData'), async (docSnap) => {
      let loadedGoals = docSnap.exists() ? (docSnap.data().goals || []) : [];
      
      // Fallback: Check root document
      if (loadedGoals.length === 0) {
        try {
          const { getDoc } = await import('firebase/firestore');
          const rootSnap = await getDoc(doc(db, 'users', user.uid));
          if (rootSnap.exists() && rootSnap.data().goals) {
             loadedGoals = rootSnap.data().goals;
             console.log("Recovered goals from root doc");
          }
        } catch(e) {}
      }
        let needsSave = false;
        const processedGoals = loadedGoals.map((g: Goal) => {
          const freq = g.frequency || 'No Time Limit';
          if (freq !== 'No Time Limit') {
            const currentPeriod = getCurrentPeriodString(freq);
            if (g.lastResetPeriod && g.lastResetPeriod !== currentPeriod) {
              needsSave = true;
              return {
                ...g,
                frequency: freq,
                history: [...(g.history || []), {
                  period: g.lastResetPeriod,
                  completedAmount: g.currentAmount,
                  targetAmount: g.targetAmount,
                  resetAt: new Date().toISOString()
                }],
                currentAmount: 0,
                lastResetPeriod: currentPeriod
              };
            } else if (!g.lastResetPeriod) {
              needsSave = true;
              return { ...g, frequency: freq, lastResetPeriod: currentPeriod };
            }
          } else if (!g.frequency) {
            needsSave = true;
            return { ...g, frequency: 'No Time Limit' };
          }
          return g;
        });

        setGoals(processedGoals);
        if (needsSave) {
          // Fire and forget to avoid loop block in snapshot, it will trigger another snapshot
          const docRef = doc(db, `users/${user.uid}/preferences`, 'goalsData');
          setDoc(docRef, { goals: processedGoals }, { merge: true }).catch(console.error);
        }
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !targetAmount) return;

    const targetNum = parseInt(targetAmount);
    if (isNaN(targetNum) || targetNum <= 0) return;

    if (editingId) {
      const updated = goals.map(g => {
        if (g.id === editingId) {
          const periodChanged = g.frequency !== frequency;
          return {
            ...g,
            name: name.trim(),
            targetAmount: targetNum,
            frequency: frequency,
            currentAmount: Math.min(g.currentAmount, targetNum),
            lastResetPeriod: periodChanged ? getCurrentPeriodString(frequency) : g.lastResetPeriod
          };
        }
        return g;
      });
      setGoals(updated);
      saveGoals(updated);
      setEditingId(null);
    } else {
      const newGoal: Goal = {
        id: Date.now().toString(),
        name: name.trim(),
        targetAmount: targetNum,
        currentAmount: 0,
        frequency: frequency,
        lastResetPeriod: getCurrentPeriodString(frequency)
      };
      const updated = [newGoal, ...goals];
      setGoals(updated);
      saveGoals(updated);
    }

    resetForm();
    setIsAdding(false);
  };

  const startEditing = (g: Goal) => {
    setName(g.name);
    setTargetAmount(g.targetAmount.toString());
    setFrequency(g.frequency || 'No Time Limit');
    setEditingId(g.id);
    setIsAdding(true);
  };

  const deleteGoal = (id: string) => {
    if (!window.confirm('Are you sure you want to delete this goal?')) return;
    const updated = goals.filter(g => g.id !== id);
    setGoals(updated);
    saveGoals(updated);
  };

  const updateProgress = (id: string, delta: number) => {
    const updated = goals.map(g => {
      if (g.id === id) {
        const newAmount = Math.max(0, Math.min(g.targetAmount, g.currentAmount + delta));
        return { ...g, currentAmount: newAmount };
      }
      return g;
    });
    setGoals(updated);
    saveGoals(updated);
  };

  const resetForm = () => {
    setName('');
    setTargetAmount('');
    setFrequency('No Time Limit');
    setEditingId(null);
  };

  return (
    <div className="flex-1 md:overflow-y-auto px-margin-mobile md:px-margin-desktop pb-safe-nav relative">
      <div className="md:hidden mt-4 mb-8 flex justify-between items-center">
        <h2 className="text-[32px] leading-[1.2] font-bold font-headline-lg-mobile text-[#111111] m-0">Goals</h2>
        <SyncStatus status={syncStatus} />
      </div>
      <div className="hidden md:flex mt-8 mb-8 justify-between items-end">
        <div>
          <h2 className="text-[40px] leading-[1.2] font-bold font-headline-lg text-[#111111] m-0 tracking-tight">Goals Tracker</h2>
          <p className="text-[#666666] mt-2 font-medium">Keep track of your milestones.</p>
        </div>
        <SyncStatus status={syncStatus} />
      </div>

      <div className="flex justify-between items-center mb-6">
        <h3 className="text-[20px] font-bold text-[#111111] flex items-center gap-2">
          Your Goals
        </h3>
        {!isAdding && (
          <button 
            onClick={() => setIsAdding(true)}
            className="px-5 py-2.5 rounded-full bg-primary text-on-primary hover:bg-primary/90 transition-all hover:shadow-md flex items-center gap-2 text-[14px] font-bold"
          >
            <Plus className="w-4 h-4" />
            <span>Add Goal</span>
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleSave} className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-md mb-8 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-center mb-6">
            <h4 className="text-[18px] font-bold text-[#111111]">{editingId ? 'Edit Goal' : 'New Goal'}</h4>
            <button type="button" onClick={() => { setIsAdding(false); resetForm(); }} className="text-[#666666] hover:bg-surface-variant p-2 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="block text-[14px] font-bold text-[#444444] mb-2">What is the goal?</label>
              <input 
                type="text" 
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Read Books"
                className="w-full bg-white border border-outline-variant/40 rounded-xl px-4 py-3 text-[16px] text-[#111111] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
              />
            </div>
            <div>
              <label className="block text-[14px] font-bold text-[#444444] mb-2">Target Amount</label>
              <input 
                type="number" 
                min="1"
                required
                value={targetAmount}
                onChange={e => setTargetAmount(e.target.value)}
                placeholder="e.g. 12"
                className="w-full bg-white border border-outline-variant/40 rounded-xl px-4 py-3 text-[16px] text-[#111111] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
              />
            </div>
            <div>
              <label className="block text-[14px] font-bold text-[#444444] mb-2">Goal Frequency</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as GoalFrequency)}
                className="w-full bg-white border border-outline-variant/40 rounded-xl px-4 py-3 text-[16px] text-[#111111] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium"
              >
                <option value="No Time Limit">No Time Limit</option>
                <option value="Daily">Daily</option>
                <option value="Weekly">Weekly</option>
                <option value="Monthly">Monthly</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant/20">
            <button 
              type="button" 
              onClick={() => { setIsAdding(false); resetForm(); }}
              className="px-6 py-3 rounded-full text-[15px] font-bold text-[#444444] hover:bg-surface-variant transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={!name.trim() || !targetAmount}
              className="px-6 py-3 rounded-full text-[15px] font-bold bg-primary text-on-primary hover:bg-primary/90 transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {user?.isAnonymous ? 'Test Save' : 'Save Goal'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
        </div>
      ) : goals.length === 0 && !isAdding ? (
        <div className="text-center py-16 border-2 border-dashed border-outline-variant/30 rounded-2xl bg-surface-container-lowest/50">
          <div className="w-16 h-16 bg-surface-variant rounded-full flex items-center justify-center mx-auto mb-4">
            <Target className="w-8 h-8 text-[#666666]" />
          </div>
          <h4 className="text-[18px] font-bold text-[#111111] mb-2">No goals set</h4>
          <p className="text-[15px] text-[#666666] mb-6 max-w-sm mx-auto font-medium">Create a goal to start tracking your progress.</p>
          <button 
            onClick={() => setIsAdding(true)}
            className="px-6 py-3 rounded-full bg-primary text-on-primary hover:bg-primary/90 hover:shadow-md transition-all inline-flex items-center gap-2 text-[15px] font-bold"
          >
            <Plus className="w-5 h-5" />
            Add your first goal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {goals.map(goal => {
            const percentage = Math.round((goal.currentAmount / goal.targetAmount) * 100) || 0;
            const radius = 36;
            const circumference = 2 * Math.PI * radius;
            const strokeDashoffset = circumference - (percentage / 100) * circumference;
            const currentFreq = goal.frequency || 'No Time Limit';

            return (
              <div key={goal.id} className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group flex flex-col relative">
                <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button 
                    onClick={() => startEditing(goal)}
                    className="p-2 text-[#666666] hover:text-[#111111] hover:bg-surface-variant rounded-full transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => deleteGoal(goal.id)}
                    className="p-2 text-[#666666] hover:text-error hover:bg-error/10 rounded-full transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                
                {currentFreq !== 'No Time Limit' && (
                  <div className="absolute top-4 left-4 z-10">
                    <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-[12px] font-bold">
                      {currentFreq}
                    </span>
                  </div>
                )}

                <div className="flex flex-col items-center mt-2 mb-6">
                  <div className="relative flex items-center justify-center">
                    <svg className="w-32 h-32 transform -rotate-90">
                      <circle 
                        cx="64" cy="64" r={radius} 
                        className="stroke-surface-variant fill-none" 
                        strokeWidth="10" 
                      />
                      <circle 
                        cx="64" cy="64" r={radius} 
                        className="stroke-primary fill-none transition-all duration-700 ease-out" 
                        strokeWidth="10" 
                        strokeDasharray={circumference} 
                        strokeDashoffset={strokeDashoffset} 
                        strokeLinecap="round" 
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[26px] font-bold text-[#111111] leading-none">{percentage}%</span>
                    </div>
                  </div>
                </div>

                <div className="text-center mb-6">
                  <h4 className="text-[20px] font-bold text-[#111111] mb-1 leading-tight">{goal.name}</h4>
                  <p className="text-[15px] font-bold text-[#666666]">
                    {goal.currentAmount} / {goal.targetAmount}
                  </p>
                </div>

                <div className="mt-auto flex items-center justify-between bg-surface-variant/30 rounded-full p-1 border border-outline-variant/10">
                  <button 
                    onClick={() => updateProgress(goal.id, -1)}
                    disabled={goal.currentAmount <= 0}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-white text-[#444444] shadow-sm hover:shadow hover:text-[#111111] disabled:opacity-50 disabled:shadow-none transition-all"
                  >
                    <MinusCircle className="w-6 h-6" />
                  </button>
                  
                  <span className="text-[14px] font-bold text-[#444444] uppercase tracking-wider">Progress</span>

                  <button 
                    onClick={() => updateProgress(goal.id, 1)}
                    disabled={goal.currentAmount >= goal.targetAmount}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-primary text-on-primary shadow-sm hover:shadow hover:bg-primary/90 disabled:opacity-50 disabled:shadow-none transition-all"
                  >
                    <PlusCircle className="w-6 h-6" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
