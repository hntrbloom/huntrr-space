import { safeGetDoc as getDoc, safeGetDocs as getDocs, safeGetDoc, safeGetDocs } from '../lib/firebase';
import React, { useEffect, useState, useMemo } from 'react';
import { Bell, Check, Plus, Activity, Clock, ChevronLeft, ChevronRight, BarChart2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';
import { useWorkShifts } from '../lib/WorkShiftsContext';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, ReferenceArea, ReferenceLine, BarChart, Bar } from 'recharts';
import { startOfWeek, endOfWeek, addWeeks, subWeeks, format, parseISO, isSameDay, startOfDay, getDay, isAfter, isBefore } from 'date-fns';
import { Habit, calculateStreaks } from './HabitsView';
import { GUEST_SAMPLE_MOODS } from '../lib/guestSampleData';
import { calculateTotalHours } from './MonthlyView';

const MED_COLORS = ['#FF6B9E', '#6B9EFF', '#6BFF9E', '#FFB36B', '#A86BFF', '#FF6B6B'];

export function StreaksView() {
  const { user } = useAuth();
  
  const [habits, setHabits] = useState<Habit[]>([]);
  const [focusSessions, setFocusSessions] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [moods, setMoods] = useState<any[]>([]);
  const { workShifts } = useWorkShifts();
  
  // Weekly graph state
  const [weekOffset, setWeekOffset] = useState(0);
  
  useEffect(() => {
    if (!user) return;
    
    const loadData = async () => {
      if (user.isAnonymous) {
        setHabits([
          {
            id: 'guest-h-1',
            name: 'Sketch Daily Design Idea',
            category: 'creative',
            timeOfDay: 'daily',
            scheduledDays: [0,1,2,3,4,5,6],
            createdAt: new Date().toISOString(),
            order: 0,
            completions: {
              [new Date().toISOString().split('T')[0]]: [new Date().toISOString()]
            }
          },
          {
            id: 'guest-h-2',
            name: 'Drink 2L Water',
            category: 'health',
            timeOfDay: 'daily',
            scheduledDays: [0,1,2,3,4,5,6],
            createdAt: new Date().toISOString(),
            order: 1,
            completions: {
              [new Date().toISOString().split('T')[0]]: [new Date().toISOString()]
            }
          }
        ]);
        setFocusSessions([
          { date: new Date().toISOString().split('T')[0], durationMinutes: 45 }
        ]);
        setActivity([
          { timestamp: Date.now(), type: 'task_completed', title: '[Sample] Completed Cinnamoroll keychain', text: '[Sample] Completed Cinnamoroll keychain' }
        ]);
        setMoods([]);
        return;
      }
      try {
        // 1. Migrate old 'medications' collection if it exists
        const oldMedsQ = query(collection(db, `users/${user.uid}/medications`));
        const oldMedsSnap = await safeGetDocs(oldMedsQ);
        
        let existingHabits: Habit[] = [];
        const habitsRef = doc(db, `users/${user.uid}/preferences`, 'habitsData');
        const habitsSnap = await safeGetDoc(habitsRef);
        if (habitsSnap.exists()) {
          existingHabits = habitsSnap.data().habits || [];
        }

        if (!oldMedsSnap.empty) {
          // Convert to a medication habit
          const oldDoses = oldMedsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
          let medHabit = existingHabits.find(h => h.type === 'medication' && h.name === 'Migrated Medication');
          if (!medHabit) {
            medHabit = {
              id: 'migrated-meds',
              name: 'Migrated Medication',
              category: 'health',
              timeOfDay: 'daily',
              scheduledDays: [0,1,2,3,4,5,6],
              createdAt: new Date().toISOString(),
              order: existingHabits.length,
              type: 'medication',
              completions: {}
            };
            existingHabits.push(medHabit);
          }
          
          oldDoses.forEach(dose => {
             const date = dose.date; // YYYY-MM-DD
             const timeStr = dose.timeTaken || '12:00:00';
             let timestamp: string;
             try {
                timestamp = dose.dateTimestamp ? dose.dateTimestamp.toDate().toISOString() : new Date(date + 'T' + timeStr).toISOString();
             } catch (e) {
                timestamp = new Date(date + 'T12:00:00').toISOString();
             }
             if (!medHabit.completions[date]) medHabit.completions[date] = [];
             if (Array.isArray(medHabit.completions[date])) {
                if (!medHabit.completions[date].includes(timestamp)) {
                   medHabit.completions[date].push(timestamp);
                }
             }
          });
          
          await setDoc(habitsRef, { habits: existingHabits }, { merge: true });
          
          // Delete old docs to avoid duplicate migration
          for (const d of oldMedsSnap.docs) {
            await deleteDoc(doc(db, `users/${user.uid}/medications`, d.id));
          }
        }
        
        setHabits(existingHabits);
        
        // 2. Load focus sessions
        const focusRef = doc(db, `users/${user.uid}/preferences`, 'focusData');
        const focusSnap = await safeGetDoc(focusRef);
        if (focusSnap.exists()) setFocusSessions(focusSnap.data().sessions || []);
        
        // 3. Load activities (tasks etc)
        const actQ = query(collection(db, `users/${user.uid}/activity`), orderBy('timestamp', 'desc'));
        const actSnap = await safeGetDocs(actQ);
        setActivity(actSnap.docs.map(d => d.data()));
        
        // 4. Load moods
        const moodQ = query(collection(db, `users/${user.uid}/moods`), orderBy('timestamp', 'desc'));
        const moodSnap = await safeGetDocs(moodQ);
        setMoods(moodSnap.docs.map(d => d.data()));
        
      } catch (err) {
        console.error("Error loading stats data", err);
      }
    };
    loadData();

  }, [user]);

  // Medication Data Processing
  const medHabits = habits.filter(h => h.type === 'medication');
  
  const currentWeekStart = addWeeks(startOfWeek(new Date(), { weekStartsOn: 0 }), weekOffset);
  const currentWeekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 0 });
  
  
  const workChartData = useMemo(() => {
    const data: any[] = [];
    const today = startOfDay(new Date());
    const weekStart = addWeeks(startOfWeek(today, { weekStartsOn: 0 }), weekOffset);
    
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const dStr = format(d, 'yyyy-MM-dd');
      
      let dayHrs = 0;
      dayHrs = calculateTotalHours(workShifts.filter(s => s.date === dStr));
      
      data.push({
        dayIndex: i,
        dayName: format(d, 'EEE'),
        dateStr: format(d, 'MMM d'),
        hours: parseFloat(dayHrs.toFixed(2))
      });
    }
    return data;
  }, [workShifts, weekOffset]);
  
  const medChartData = useMemo(() => {
    const data: any[] = [];
    medHabits.forEach((habit, hIdx) => {
      const color = MED_COLORS[hIdx % MED_COLORS.length];
      
      // Iterate through the week
      for (let i = 0; i < 7; i++) {
        const d = new Date(currentWeekStart);
        d.setDate(d.getDate() + i);
        const dateStr = format(d, 'yyyy-MM-dd');
        
        const isScheduled = (habit.scheduledDays || []).includes(d.getDay());
        const completionVal = habit.completions ? habit.completions[dateStr] : undefined;
        let doses: string[] = [];
        if (Array.isArray(completionVal)) doses = completionVal;
        else if (completionVal) doses = [typeof completionVal === 'string' ? completionVal : new Date(dateStr + 'T12:00:00').toISOString()];
        
        if (doses.length > 0) {
           doses.forEach(doseIso => {
              const doseDate = parseISO(doseIso);
              const hours = doseDate.getHours() + doseDate.getMinutes() / 60;
              data.push({
                 day: i,
                 dayName: format(d, 'EEE'),
                 time: hours,
                 timeStr: format(doseDate, 'h:mm a'),
                 habitName: habit.name,
                 color,
                 isMissed: false
              });
           });
        } else if (isScheduled && isBefore(d, new Date())) {
           // Missed
           data.push({
              day: i,
              dayName: format(d, 'EEE'),
              time: 12, // Plot in middle of day with special shape
              timeStr: 'Missed',
              habitName: habit.name,
              color: '#d1d5db',
              isMissed: true
           });
        }
      }
    });
    return data;
  }, [medHabits, currentWeekStart]);

  const weeklyMedStats = useMemo(() => {
     let totalScheduled = 0;
     let totalTaken = 0;
     let totalHours = 0;
     let takenCount = 0;
     
     medHabits.forEach(habit => {
        for (let i = 0; i < 7; i++) {
           const d = new Date(currentWeekStart);
           d.setDate(d.getDate() + i);
           const dateStr = format(d, 'yyyy-MM-dd');
           const isScheduled = (habit.scheduledDays || []).includes(d.getDay());
           const isPast = isBefore(d, new Date());
           
           const completionVal = habit.completions[dateStr];
           const doses = Array.isArray(completionVal) ? completionVal : (completionVal ? [completionVal] : []);
           
           if (isScheduled && isPast) totalScheduled++;
           if (doses.length > 0) {
              if (isScheduled && isPast) totalTaken++; // At least one taken
              doses.forEach(dose => {
                 const doseDate = parseISO(dose);
                 totalHours += doseDate.getHours() + doseDate.getMinutes() / 60;
                 takenCount++;
              });
           }
        }
     });
     
     const avgHour = takenCount > 0 ? totalHours / takenCount : null;
     const avgTimeStr = avgHour !== null 
        ? `${Math.floor(avgHour)}:${String(Math.round((avgHour % 1) * 60)).padStart(2, '0')} ${avgHour >= 12 ? 'PM' : 'AM'}` 
        : 'N/A';
        
     return {
        percent: totalScheduled > 0 ? Math.round((totalTaken / totalScheduled) * 100) : 0,
        avgTime: avgTimeStr
     };
  }, [medHabits, currentWeekStart]);

  
  const workStats = useMemo(() => {
    let today = 0;
    let thisWeek = 0;
    let thisMonth = 0;
    let total = calculateTotalHours(workShifts);
    const shiftDays = new Set<string>();
    
    const todayDate = startOfDay(new Date());
    const todayStr = format(todayDate, 'yyyy-MM-dd');
    const weekStart = startOfWeek(todayDate, { weekStartsOn: 0 }); 
    const weekEnd = endOfWeek(todayDate, { weekStartsOn: 0 });
    const monthStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
    const monthEnd = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0);

    const todayShifts = [];
    const weekShifts = [];
    const monthShifts = [];

    workShifts.forEach(shift => {
      shiftDays.add(shift.date);
      
      if (shift.date === todayStr) {
        todayShifts.push(shift);
      }
      
      const shiftDate = parseISO(shift.date);
      if (isSameDay(shiftDate, weekStart) || isSameDay(shiftDate, weekEnd) || (isAfter(shiftDate, weekStart) && isBefore(shiftDate, weekEnd))) {
        weekShifts.push(shift);
      }
      
      if (isSameDay(shiftDate, monthStart) || isSameDay(shiftDate, monthEnd) || (isAfter(shiftDate, monthStart) && isBefore(shiftDate, monthEnd))) {
        monthShifts.push(shift);
      }
    });

    today = calculateTotalHours(todayShifts);
    thisWeek = calculateTotalHours(weekShifts);
    thisMonth = calculateTotalHours(monthShifts);

    const totalDays = shiftDays.size || 1;
    const firstDate = workShifts.length ? parseISO(workShifts.sort((a,b) => a.date.localeCompare(b.date))[0].date) : todayDate;
    const totalWeeks = Math.max(1, (todayDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 7));

    return {
      today: today.toFixed(2),
      thisWeek: thisWeek.toFixed(2),
      thisMonth: thisMonth.toFixed(2),
      total: total.toFixed(2),
      avgPerDay: (total / totalDays).toFixed(2),
      avgPerWeek: (total / totalWeeks).toFixed(2),
    };
  }, [workShifts]);
  
  // Activity Stats
  const tasksCreated = activity.filter(a => a.type === 'task_created').length;
  const tasksCompleted = activity.filter(a => a.type === 'task_completed').length;
  const focusTimeTotal = focusSessions.reduce((acc, s) => acc + (s.actualDurationMinutes || 0), 0);
  
  const CustomScatterShape = (props: any) => {
    const { cx, cy, fill, isMissed } = props;
    if (isMissed) {
       return (
         <g transform={`translate(${cx},${cy})`}>
           <line x1="-5" y1="-5" x2="5" y2="5" stroke="#ef4444" strokeWidth="2" />
           <line x1="-5" y1="5" x2="5" y2="-5" stroke="#ef4444" strokeWidth="2" />
         </g>
       );
    }
    return <circle cx={cx} cy={cy} r={6} fill={fill} stroke="#fff" strokeWidth={2} />;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 rounded-lg shadow-md border border-black/10">
          <p className="font-bold text-black/80">{data.habitName}</p>
          <p className="text-sm text-black/60">{data.isMissed ? 'Missed' : `Taken at ${data.timeStr}`}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex-1 md:overflow-y-auto px-4 md:px-margin-desktop pb-safe-nav bg-transparent">
      <div className="mt-8 mb-8">
        <h2 className="text-[40px] leading-[1.2] font-bold font-headline-lg text-on-surface m-0 tracking-tight">Stats & Activity</h2>
        <p className="text-[15px] font-body-md text-on-surface-variant mt-2 max-w-xl">
          A comprehensive view of your focus, habits, and daily actions.
        </p>
      </div>

      {/* Overview Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4 mb-8">

         <div className="bg-primary/5 p-5 rounded-2xl border border-primary/20 shadow-sm flex flex-col justify-between">
           <div>
             <p className="text-[11px] font-bold tracking-widest text-primary mb-2 uppercase">Work Hours</p>
             <div className="flex items-end gap-2">
               <span className="text-[32px] font-headline-md leading-none text-primary">{workStats.thisWeek}h</span>
               <span className="text-[14px] text-primary/80 font-medium mb-1">this week</span>
             </div>
           </div>
           <div className="mt-4 grid grid-cols-2 gap-2 text-[12px] text-on-surface-variant bg-surface p-2 rounded-xl">
             <div><span className="font-bold text-on-surface">{workStats.today}h</span> today</div>
             <div><span className="font-bold text-on-surface">{workStats.thisMonth}h</span> month</div>
             <div><span className="font-bold text-on-surface">{workStats.avgPerDay}h</span> avg/day</div>
             <div><span className="font-bold text-on-surface">{workStats.total}h</span> total</div>
           </div>
         </div>
  
         <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 shadow-sm">
           <p className="text-[11px] font-bold tracking-widest text-on-surface-variant mb-2 uppercase">Tasks Completed</p>
           <span className="text-[32px] font-headline-md leading-none text-on-surface">{tasksCompleted}</span>
           <p className="text-[12px] text-on-surface-variant mt-2">{tasksCreated} total created</p>
         </div>
         <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 shadow-sm">
           <p className="text-[11px] font-bold tracking-widest text-on-surface-variant mb-2 uppercase">Focus Time</p>
           <span className="text-[32px] font-headline-md leading-none text-on-surface">{Math.floor(focusTimeTotal / 60)}h {focusTimeTotal % 60}m</span>
           <p className="text-[12px] text-on-surface-variant mt-2">{focusSessions.length} sessions</p>
         </div>
         <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 shadow-sm">
           <p className="text-[11px] font-bold tracking-widest text-on-surface-variant mb-2 uppercase">Mood Entries</p>
           <span className="text-[32px] font-headline-md leading-none text-on-surface">{moods.length}</span>
           <p className="text-[12px] text-on-surface-variant mt-2">Recorded over time</p>
         </div>
         <div className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 shadow-sm">
           <p className="text-[11px] font-bold tracking-widest text-on-surface-variant mb-2 uppercase">Active Habits</p>
           <span className="text-[32px] font-headline-md leading-none text-on-surface">{habits.length}</span>
           <p className="text-[12px] text-on-surface-variant mt-2">Across all categories</p>
         </div>
      </div>

      
      {/* Work Hours Chart */}
      <div className="mb-10 bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <div>
            <h3 className="text-[20px] font-bold text-on-surface flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Work Hours
            </h3>
            <p className="text-sm text-on-surface-variant mt-1">Weekly work duration</p>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setWeekOffset(prev => prev - 1)}
              className="p-2 hover:bg-surface-variant rounded-full text-on-surface-variant transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-bold w-24 text-center">
              {weekOffset === 0 ? 'This Week' : weekOffset === -1 ? 'Last Week' : `${Math.abs(weekOffset)}w ago`}
            </span>
            <button 
              onClick={() => setWeekOffset(prev => prev + 1)}
              disabled={weekOffset >= 0}
              className={`p-2 rounded-full transition-colors ${weekOffset >= 0 ? 'text-on-surface-variant/30' : 'hover:bg-surface-variant text-on-surface-variant'}`}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={workChartData} margin={{ top: 10, right: 10, bottom: 20, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.1} />
              <XAxis 
                dataKey="dayName" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'currentColor', opacity: 0.6 }}
                dy={10}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'currentColor', opacity: 0.6 }}
              />
              <RechartsTooltip 
                cursor={{ fill: 'currentColor', opacity: 0.05 }}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                formatter={(value: any) => [`${value} hrs`, 'Work']}
                labelFormatter={(label) => workChartData.find(d => d.dayName === label)?.dateStr || label}
              />
              <Bar dataKey="hours" fill="#FFB36B" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
  
      {/* Medication Graph */}
      {medHabits.length > 0 && (
        <div className="mb-10 bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
            <div>
              <h3 className="text-[20px] font-headline-md font-bold text-on-surface flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" /> Medication Adherence
              </h3>
              <p className="text-sm text-on-surface-variant mt-1">
                Completion: {weeklyMedStats.percent}% | Avg Time: {weeklyMedStats.avgTime}
              </p>
            </div>
            <div className="flex items-center gap-4 bg-surface-container-high rounded-lg p-1">
              <button onClick={() => setWeekOffset(prev => prev - 1)} className="p-2 hover:bg-surface-variant rounded-md transition-colors"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-[13px] font-bold min-w-[120px] text-center">
                {format(currentWeekStart, 'MMM d')} - {format(currentWeekEnd, 'MMM d')}
              </span>
              <button onClick={() => setWeekOffset(prev => prev + 1)} className="p-2 hover:bg-surface-variant rounded-md transition-colors"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
          
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical={false} />
                <XAxis dataKey="day" type="category" allowDuplicatedCategory={false} ticks={[0,1,2,3,4,5,6]} tickFormatter={(v) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][v]} axisLine={false} tickLine={false} />
                <YAxis dataKey="time" type="number" domain={[0, 24]} tickFormatter={(v) => v === 0 || v === 24 ? '12 AM' : v === 12 ? '12 PM' : v > 12 ? `${v-12} PM` : `${v} AM`} reversed axisLine={false} tickLine={false} width={60} />
                <RechartsTooltip content={<CustomTooltip />} />
                <Scatter data={medChartData} shape={<CustomScatterShape />}>
                  {medChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-outline-variant/20">
            {medHabits.map((h, i) => (
              <div key={h.id} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: MED_COLORS[i % MED_COLORS.length] }}></div>
                <span className="text-[13px] font-bold text-black/70">{h.name}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 ml-auto">
               <div className="w-3 h-3 relative">
                 <line x1="0" y1="0" x2="12" y2="12" stroke="#ef4444" strokeWidth="2" />
                 <line x1="0" y1="12" x2="12" y2="0" stroke="#ef4444" strokeWidth="2" />
               </div>
               <span className="text-[13px] font-bold text-black/70">Missed</span>
            </div>
          </div>
        </div>
      )}


      {/* Grid of other habits */}
      {habits.filter(h => h.type !== 'medication').length > 0 && (
        <>
          <h3 className="text-[20px] font-headline-md font-bold text-on-surface mb-4 mt-8">Other Habits</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
              {habits.filter(h => h.type !== 'medication').map((habit, idx) => {
                 // Calculate basic stats for this habit
                 let currentStreak = 0;
                 let completedDays = 0;
                 const history: boolean[] = [];
                 const { currentStreak: realStreak } = calculateStreaks(habit, new Date().toLocaleDateString('en-CA'));
                 currentStreak = realStreak;
                 for (let i = 29; i >= 0; i--) {
                   const d = new Date();
                   d.setDate(d.getDate() - i);
                   const dStr = d.toLocaleDateString('en-CA');
                   const completed = !!habit.completions[dStr];
                   history.push(completed);
                   if (completed) completedDays++;
                 }
                 const colorClass = 'bg-primary';
                 const unfilledClass = 'bg-surface-container-high';
                 
                 return (
                 <div key={idx} className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-[0_4px_16px_rgba(125,97,144,0.04)] flex flex-col h-full">
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-[11px] font-semibold tracking-wide bg-surface-container px-2.5 py-1 rounded-full text-on-surface-variant">{habit.category || 'General'}</span>
                        <div className="text-right flex flex-col items-end">
                           <span className="text-[20px] font-headline-md font-bold leading-none text-on-surface">{currentStreak}</span>
                           <p className="text-[9px] uppercase tracking-wider text-on-surface-variant font-bold mt-1">Current Streak</p>
                        </div>
                    </div>
                    <h3 className="text-[20px] font-headline-md font-bold text-on-surface mb-6">{habit.name}</h3>
                    
                    <div className="flex justify-between items-end mb-3">
                        <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">Last 30 Days</span>
                        <span className="text-[12px] font-bold text-on-surface">{completedDays} / 30</span>
                    </div>
                    
                    <div className="grid grid-cols-6 gap-1 mb-8">
                        {history.map((completed, i) => (
                            <div key={i} className={`aspect-square rounded-[3px] ${completed ? colorClass : unfilledClass}`}></div>
                        ))}
                    </div>
                    
                    <div className="mt-auto flex gap-3">
                    </div>
                </div>
              )})}
          </div>
        </>
      )}

      {/* Activity Timeline / Table (Preview) */}
      <div className="mb-10 bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm">
         <h3 className="text-[20px] font-headline-md font-bold text-on-surface mb-6 flex items-center gap-2">
           <BarChart2 className="w-5 h-5 text-primary" /> Recent Activity Log
         </h3>
         {activity.length === 0 ? (
           <p className="text-on-surface-variant text-sm">No activity recorded yet.</p>
         ) : (
           <div className="flex flex-col gap-3">
             {activity.slice(0, 10).map((act, i) => (
               <div key={i} className="flex items-start gap-4 p-3 bg-surface rounded-xl border border-outline-variant/10">
                 <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                   {(act.type || '').includes('task') ? <Check className="w-4 h-4 text-primary" /> : <Activity className="w-4 h-4 text-primary" />}
                 </div>
                 <div>
                   <p className="text-[14px] font-semibold text-on-surface">
                     {act.type === 'task_created' ? 'Task Created' : 
                      act.type === 'task_completed' ? 'Task Completed' : 
                      act.type === 'task_reopened' ? 'Task Reopened' :
                      act.type === 'task_edited' ? 'Task Edited' :
                      act.type === 'task_deleted' ? 'Task Deleted' : act.type}
                   </p>
                   {act.text && <p className="text-[13px] text-on-surface-variant mt-0.5">{act.text}</p>}
                 </div>
                 <span className="ml-auto text-[12px] text-on-surface-variant font-medium">
                   {act.createdAt 
                     ? format(new Date(act.createdAt), 'MMM d, h:mm a') 
                     : act.timestamp?.toDate 
                       ? format(act.timestamp.toDate(), 'MMM d, h:mm a') 
                       : ''}
                 </span>
               </div>
             ))}
             {activity.length > 10 && (
               <p className="text-center text-sm text-primary font-bold mt-2 hover:underline cursor-pointer">
                 View all {activity.length} events
               </p>
             )}
           </div>
         )}
      </div>

    </div>
  );
}
