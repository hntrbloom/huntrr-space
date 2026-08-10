import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Clock, Plus, Edit2, Trash2, X, AlertTriangle, Calendar as CalendarIcon, Briefcase } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, doc, setDoc, deleteDoc, query } from 'firebase/firestore';
import { useWorkShifts, WorkShift } from '../lib/WorkShiftsContext';
import { useAuth } from '../lib/AuthContext';
import { v4 as uuidv4 } from 'uuid';



export const calculateTotalHours = (shifts: WorkShift[]) => {
  const intervals = shifts.filter(s => s && s.date && s.clockIn && s.clockOut).map(s => {
    const [year, month, day] = s.date.split('-').map(Number);
    const [inH, inM] = s.clockIn.split(':').map(Number);
    const [outH, outM] = s.clockOut.split(':').map(Number);
    
    let start = new Date(year, month - 1, day, inH, inM).getTime();
    let end = new Date(year, month - 1, day, outH, outM).getTime();
    
    if (s.isOvernight || end < start) {
      end += 24 * 60 * 60 * 1000;
    }
    
    return { start, end, breakLength: s.breakLength };
  });

  if (intervals.length === 0) return 0;
  intervals.sort((a, b) => a.start - b.start);

  let merged = [ { start: intervals[0].start, end: intervals[0].end } ];
  for (let i = 1; i < intervals.length; i++) {
    const last = merged[merged.length - 1];
    const curr = intervals[i];
    if (curr.start <= last.end) {
      last.end = Math.max(last.end, curr.end);
    } else {
      merged.push({ start: curr.start, end: curr.end });
    }
  }

  let totalMs = 0;
  for (const m of merged) {
    totalMs += m.end - m.start;
  }

  let totalBreakMins = intervals.reduce((sum, inv) => sum + (Number(inv.breakLength) || 0), 0);
  let totalHours = (totalMs / (1000 * 60) - totalBreakMins) / 60;
  return Math.max(0, totalHours);
};

export const formatTime = (timeStr: string) => {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
};

export function MonthlyView() {
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  
  const { workShifts: shifts, saveShift, deleteShift } = useWorkShifts();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<WorkShift | null>(null);
  const [selectedShiftDetails, setSelectedShiftDetails] = useState<WorkShift | null>(null);



  const monthName = currentDate.toLocaleString('default', { month: 'long' });
  const year = currentDate.getFullYear();
    
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
  
  const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
  const firstDay = getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth());
  const prevMonthDays = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth() - 1);
  const blanks = Array.from({ length: firstDay }).map((_, i) => prevMonthDays - firstDay + i + 1);

  const getWeekDays = () => {
    const day = currentDate.getDay();
    const diff = currentDate.getDate() - day;
    const startOfWeek = new Date(currentDate.getFullYear(), currentDate.getMonth(), diff);
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + i);
      return d;
    });
  };

  const prev = () => {
    if (view === 'month') setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    if (view === 'week') setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 7));
    if (view === 'day') setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 1));
  };
  const next = () => {
    if (view === 'month') setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    if (view === 'week') setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 7));
    if (view === 'day') setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 1));
  };
  const goToday = () => {
    setCurrentDate(new Date());
  };

  const toDateString = (d: Date) => {
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
  };

  const currentMonthShifts = useMemo(() => {
    return shifts.filter(s => { if (!s || !s.date) return false;
      const [sy, sm] = s.date.split('-');
      return parseInt(sy) === currentDate.getFullYear() && parseInt(sm) === currentDate.getMonth() + 1;
    });
  }, [shifts, currentDate]);

  const currentWeekShifts = useMemo(() => {
    const weekDays = getWeekDays().map(toDateString);
    return (shifts || []).filter(s => s && (weekDays || []).includes(s.date));
  }, [shifts, currentDate]);

  const currentDayShifts = useMemo(() => {
    const dStr = toDateString(currentDate);
    return shifts.filter(s => s.date === dStr);
  }, [shifts, currentDate]);

  const dailyHours = calculateTotalHours(currentDayShifts);
  const weeklyHours = calculateTotalHours(currentWeekShifts);
  const monthlyHours = calculateTotalHours(currentMonthShifts);


  const handleSaveShift = async (shift: WorkShift) => {
    try {
      await saveShift(shift);
      setIsFormOpen(false);
      setEditingShift(null);
    } catch (e) {
      alert('Failed to save shift: ' + (e as Error).message);
    }
  };



  const handleDeleteShift = async (id: string) => {
    if (confirm('Are you sure you want to delete this shift?')) {
      try {
        await deleteShift(id);
        setSelectedShiftDetails(null);
      } catch (e) {
        alert('Failed to delete shift: ' + (e as Error).message);
      }
    }
  };


  return (
    <main className="flex-1 md:overflow-y-auto px-margin-mobile md:px-margin-desktop py-8 md:py-12 pb-safe-nav w-full relative">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h2 className="text-[32px] md:text-[40px] leading-[1.2] font-bold font-headline-lg-mobile md:font-headline-lg text-on-background mb-2">
            {view === 'month' && `${monthName} ${year}`}
            {view === 'week' && `Week of ${monthName} ${currentDate.getDate()}, ${year}`}
            {view === 'day' && `${currentDate.toLocaleString('default', { weekday: 'long' })}, ${monthName} ${currentDate.getDate()} ${year}`}
          </h2>
          <div className="flex flex-wrap items-center gap-4 text-on-surface-variant font-medium text-[14px]">
            <div className="flex items-center gap-2 bg-surface p-2 px-4 rounded-full border border-outline-variant/30 shadow-sm">
              <Clock className="w-4 h-4 text-primary" />
              <span>Day: <strong className="text-on-surface">{dailyHours.toFixed(2)}h</strong></span>
            </div>
            <div className="flex items-center gap-2 bg-surface p-2 px-4 rounded-full border border-outline-variant/30 shadow-sm">
              <Clock className="w-4 h-4 text-primary" />
              <span>Week: <strong className="text-on-surface">{weeklyHours.toFixed(2)}h</strong></span>
            </div>
            <div className="flex items-center gap-2 bg-surface p-2 px-4 rounded-full border border-outline-variant/30 shadow-sm">
              <Clock className="w-4 h-4 text-primary" />
              <span>Month: <strong className="text-on-surface">{monthlyHours.toFixed(2)}h</strong></span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-surface-container-low rounded-full p-1 border border-outline-variant/30">
            {(['day', 'week', 'month'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-4 py-1.5 rounded-full text-[14px] font-bold capitalize transition-colors ${view === v ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:bg-surface'}`}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-2">
            <button onClick={prev} className="p-2 rounded-full border border-outline-variant text-on-surface-variant hover:bg-surface-variant transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={goToday} className="px-4 py-2 rounded-full border border-outline-variant text-[14px] leading-[1.2] font-semibold tracking-[0.05em] font-label-md text-on-surface-variant hover:bg-surface-variant transition-colors">Today</button>
            <button onClick={next} className="p-2 rounded-full border border-outline-variant text-on-surface-variant hover:bg-surface-variant transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          
          <button 
            onClick={() => { setEditingShift(null); setIsFormOpen(true); }}
            className="flex items-center justify-center gap-2 p-2 px-4 ml-2 rounded-full bg-primary text-on-primary hover:bg-primary/90 shadow-md font-bold text-[14px] transition-colors"
            title="Clock In"
          >
            <Clock className="w-4 h-4" /> Clock In
          </button>
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-[0_4px_12px_rgba(125,97,144,0.03)] border border-surface-container-high">
        {view === 'month' && (
          <>
            <div className="grid grid-cols-7 border-b border-surface-container-high bg-surface text-[14px] leading-[1.2] font-semibold tracking-[0.05em] font-label-md text-on-surface-variant">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="bg-surface py-3 px-2 text-center">{day}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-[1px] bg-[rgba(125,97,144,0.1)] border border-[rgba(125,97,144,0.1)]">
              {blanks.map(d => (
                <div key={`prev-${d}`} className="bg-surface-container-low min-h-[120px] p-2 flex flex-col opacity-50">
                  <span className="text-[16px] leading-[1.6] font-normal font-body-md text-outline">{d}</span>
                </div>
              ))}
              
              {Array.from({length: daysInMonth}).map((_, i) => {
                 const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), i + 1);
                 const dStr = toDateString(d);
                 const dayShifts = currentMonthShifts.filter(s => s.date === dStr);
                 const isToday = new Date().getDate() === i + 1 && new Date().getMonth() === currentDate.getMonth() && new Date().getFullYear() === currentDate.getFullYear();
                 return (
                  <div key={`d-${i+1}`} className="bg-surface-container-lowest hover:bg-surface min-h-[120px] p-2 flex flex-col gap-1">
                    <span className={`text-[16px] leading-[1.6] font-normal font-body-md mb-2 ${isToday ? 'bg-primary text-on-primary rounded-full w-7 h-7 flex items-center justify-center' : 'text-on-background'}`}>
                      {i + 1}
                    </span>
                    {dayShifts.map(s => {
                      const hrs = calculateTotalHours([s]).toFixed(2);
                      return (
                        <button 
                          key={s.id} 
                          onClick={() => setSelectedShiftDetails(s)}
                          className="flex items-center gap-1.5 p-1.5 bg-tertiary-container/40 hover:bg-tertiary-container text-on-tertiary-container rounded-lg text-left transition-colors"
                        >
                          <Clock className="w-3 h-3 shrink-0" />
                          <div className="flex-1 overflow-hidden">
                            <p className="text-[11px] font-bold truncate">{s.workplace || 'Work'}</p>
                            <p className="text-[10px] opacity-80">{formatTime(s.clockIn)} • {hrs}h</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {view === 'week' && (
          <>
            <div className="grid grid-cols-7 border-b border-surface-container-high bg-surface text-[14px] leading-[1.2] font-semibold tracking-[0.05em] font-label-md text-on-surface-variant">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => {
                const wd = getWeekDays()[i];
                return (
                  <div key={day} className="bg-surface py-3 px-2 text-center flex flex-col items-center">
                    <span>{day}</span>
                    <span className="text-lg text-on-surface">{wd.getDate()}</span>
                  </div>
                )
              })}
            </div>
            <div className="grid grid-cols-7 gap-[1px] bg-[rgba(125,97,144,0.1)] border border-[rgba(125,97,144,0.1)] min-h-[500px]">
              {getWeekDays().map((wd, i) => {
                 const dStr = toDateString(wd);
                 const dayShifts = currentWeekShifts.filter(s => s.date === dStr);
                 return (
                  <div key={`w-${i}`} className="bg-surface-container-lowest hover:bg-surface p-2 flex flex-col gap-2">
                    {dayShifts.map(s => {
                      const hrs = calculateTotalHours([s]).toFixed(2);
                      return (
                        <button 
                          key={s.id} 
                          onClick={() => setSelectedShiftDetails(s)}
                          className="flex flex-col gap-1 p-3 bg-tertiary-container/30 hover:bg-tertiary-container text-on-tertiary-container rounded-xl text-left transition-colors border border-tertiary-container/50"
                        >
                          <div className="flex items-center gap-2">
                            <Briefcase className="w-4 h-4 shrink-0 text-tertiary" />
                            <span className="text-[13px] font-bold truncate">{s.workplace || 'Work Shift'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[12px] opacity-80 mt-1">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{formatTime(s.clockIn)} - {formatTime(s.clockOut)}</span>
                          </div>
                          <div className="text-[12px] font-semibold mt-1 text-tertiary">
                            {hrs} hrs total
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {view === 'day' && (
          <div className="min-h-[500px] bg-surface-container-lowest p-6">
            {currentDayShifts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-on-surface-variant/50 py-20">
                <CalendarIcon className="w-16 h-16 mb-4 opacity-20" />
                <p className="text-[18px] font-medium">No work shifts recorded today.</p>
                <button onClick={() => { setEditingShift(null); setIsFormOpen(true); }} className="mt-4 text-primary font-bold hover:underline">
                  Clock in now
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 max-w-3xl mx-auto">
                {currentDayShifts.map(s => {
                  const hrs = calculateTotalHours([s]).toFixed(2);
                  return (
                    <div key={s.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-surface border border-outline-variant/30 rounded-2xl shadow-sm">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <Briefcase className="w-5 h-5 text-tertiary" />
                          <h3 className="text-[18px] font-bold text-on-surface">{s.workplace || 'Work Shift'}</h3>
                        </div>
                        <div className="flex items-center gap-4 text-[14px] text-on-surface-variant">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4" />
                            {formatTime(s.clockIn)} - {formatTime(s.clockOut)}
                          </span>
                          <span className="px-2 py-0.5 bg-surface-container-high rounded-full font-semibold text-on-surface">
                            {hrs} hrs
                          </span>
                        </div>
                        {s.notes && (
                          <p className="text-[14px] text-on-surface-variant italic mt-2">"{s.notes}"</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setSelectedShiftDetails(s)} className="px-4 py-2 bg-surface-container-high text-on-surface rounded-full font-semibold text-[14px] hover:bg-surface-variant transition-colors">
                          View Details
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {isFormOpen && (
        <ShiftForm 
          initialData={editingShift} 
          onSave={handleSaveShift} 
          onCancel={() => { setIsFormOpen(false); setEditingShift(null); }} 
        />
      )}

      {selectedShiftDetails && (
        <ShiftDetailsModal
          shift={selectedShiftDetails}
          onClose={() => setSelectedShiftDetails(null)}
          onEdit={() => {
            setEditingShift(selectedShiftDetails);
            setSelectedShiftDetails(null);
            setIsFormOpen(true);
          }}
          onDelete={() => handleDeleteShift(selectedShiftDetails.id)}
        />
      )}
    </main>
  );
}

function ShiftForm({ initialData, onSave, onCancel }: { initialData: WorkShift | null, onSave: (s: WorkShift) => void, onCancel: () => void }) {
  const { user } = useAuth();
  const [formData, setFormData] = useState<WorkShift>(initialData || {
    id: uuidv4(),
    date: (() => { const d = new Date(); return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}` })(),
    clockIn: '',
    clockOut: '',
    isOvernight: false,
    breakLength: 0,
    workplace: '',
    notes: ''
  });

  const hrs = useMemo(() => {
    if (!formData.clockIn || !formData.clockOut) return 0;
    return calculateTotalHours([formData]);
  }, [formData]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-outline-variant/20 bg-surface-container-lowest">
          <h3 className="text-[22px] font-bold text-on-surface flex items-center gap-2">
            <Clock className="w-6 h-6 text-primary" />
            {initialData ? 'Edit Work Shift' : 'Clock In'}
          </h3>
          <button onClick={onCancel} className="p-2 text-on-surface-variant hover:bg-surface-variant rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex-1 p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-[14px] font-bold text-on-surface mb-1.5">Work Date</label>
              <input 
                type="date" 
                required
                value={formData.date}
                onChange={e => setFormData({...formData, date: e.target.value})}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
            <div>
              <label className="block text-[14px] font-bold text-on-surface mb-1.5">Workplace / Job</label>
              <input 
                type="text" 
                placeholder="e.g. Cafe, Office..."
                value={formData.workplace}
                onChange={e => setFormData({...formData, workplace: e.target.value})}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-[14px] font-bold text-on-surface mb-1.5">Clock In</label>
              <input 
                type="time" 
                required
                value={formData.clockIn}
                onChange={e => setFormData({...formData, clockIn: e.target.value})}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
            <div>
              <label className="block text-[14px] font-bold text-on-surface mb-1.5">Clock Out</label>
              <input 
                type="time" 
                required
                value={formData.clockOut}
                onChange={e => setFormData({...formData, clockOut: e.target.value})}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-[14px] font-bold text-on-surface mb-1.5">Notes (Optional)</label>
            <textarea 
              rows={3}
              value={formData.notes}
              onChange={e => setFormData({...formData, notes: e.target.value})}
              placeholder="Any shift notes..."
              className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none"
            />
          </div>

          <div className="bg-primary/10 text-primary p-4 rounded-xl flex items-center justify-between border border-primary/20">
            <span className="font-bold">Calculated Total:</span>
            <span className="text-xl font-black">{hrs.toFixed(2)} hrs</span>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={onCancel} className="px-6 py-3 rounded-full font-bold text-on-surface-variant hover:bg-surface-variant transition-colors">
              Cancel
            </button>
            <button type="submit" className="px-8 py-3 rounded-full font-bold bg-primary text-on-primary hover:bg-primary/90 transition-colors shadow-md">
              {user?.isAnonymous ? 'Test Save' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ShiftDetailsModal({ shift, onClose, onEdit, onDelete }: { shift: WorkShift, onClose: () => void, onEdit: () => void, onDelete: () => void }) {
  const hrs = calculateTotalHours([shift]).toFixed(2);
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex flex-col p-6 pb-0 border-b border-outline-variant/20 bg-surface-container-lowest">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-tertiary/10 flex items-center justify-center text-tertiary">
                <Briefcase className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-[20px] font-bold text-on-surface leading-tight">{shift.workplace || 'Work Shift'}</h3>
                <p className="text-[14px] text-on-surface-variant">{shift.date}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 -mr-2 text-on-surface-variant hover:bg-surface-variant rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/20">
              <span className="block text-[12px] font-bold text-on-surface-variant mb-1 uppercase tracking-wider">Clock In</span>
              <span className="text-[18px] font-bold text-on-surface flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" /> {formatTime(shift.clockIn)}
              </span>
            </div>
            <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/20">
              <span className="block text-[12px] font-bold text-on-surface-variant mb-1 uppercase tracking-wider">Clock Out</span>
              <span className="text-[18px] font-bold text-on-surface flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" /> {formatTime(shift.clockOut)}
              </span>
            </div>
          </div>

          <div className="flex justify-between items-center py-3 border-b border-outline-variant/20">
            <span className="text-[14px] font-bold text-on-surface-variant">Total Paid Hours</span>
            <span className="text-[20px] font-black text-primary">{hrs} hrs</span>
          </div>

          {shift.notes && (
            <div className="bg-surface-container-low p-4 rounded-2xl border border-outline-variant/20">
              <span className="block text-[12px] font-bold text-on-surface-variant mb-2 uppercase tracking-wider">Notes</span>
              <p className="text-[14px] text-on-surface italic leading-relaxed">{shift.notes}</p>
            </div>
          )}

          <div className="flex items-center gap-3 pt-4">
            <button onClick={onEdit} className="flex-1 py-3 bg-surface-container-high hover:bg-surface-variant text-on-surface rounded-full font-bold transition-colors flex items-center justify-center gap-2">
              <Edit2 className="w-4 h-4" /> Edit
            </button>
            <button onClick={onDelete} className="flex-1 py-3 bg-error-container hover:bg-error-container/80 text-on-error-container rounded-full font-bold transition-colors flex items-center justify-center gap-2">
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
