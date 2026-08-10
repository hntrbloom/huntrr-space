import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from './firebase';
import { collection, onSnapshot, query, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { GUEST_SAMPLE_SHIFTS } from './guestSampleData';

export interface WorkShift {
  id: string;
  date: string; // YYYY-MM-DD
  clockIn: string; // HH:mm
  clockOut: string; // HH:mm
  isOvernight: boolean;
  breakLength: number;
  workplace: string;
  notes: string;
}

interface WorkShiftsContextType {
  workShifts: WorkShift[];
  saveShift: (shift: WorkShift) => Promise<void>;
  deleteShift: (id: string) => Promise<void>;
  loading: boolean;
}

const WorkShiftsContext = createContext<WorkShiftsContextType>({
  workShifts: [],
  saveShift: async () => {},
  deleteShift: async () => {},
  loading: true,
});

export const useWorkShifts = () => useContext(WorkShiftsContext);

export const WorkShiftsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [workShifts, setWorkShifts] = useState<WorkShift[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setWorkShifts([]);
      setLoading(false);
      return;
    }

    if (user.isAnonymous) {
      setWorkShifts(GUEST_SAMPLE_SHIFTS.map(s => ({
        id: s.id,
        date: s.date,
        clockIn: s.startTime,
        clockOut: s.endTime,
        isOvernight: false,
        breakLength: 30,
        workplace: 'Craft Studio',
        notes: s.notes
      })));
      setLoading(false);
      return;
    }

    const q = query(collection(db, `users/${user.uid}/workShifts`));
    const unsub = onSnapshot(q, (snap) => {
      const data: WorkShift[] = [];
      snap.forEach(d => {
        data.push({ id: d.id, ...d.data() } as WorkShift);
      });
      setWorkShifts(data);
      setLoading(false);
    }, (err) => {
      console.error("Failed to load work shifts", err);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  const saveShift = async (shift: WorkShift) => {
    if (!user) return;
    if (user.isAnonymous) {
      setWorkShifts(prev => {
        const exists = prev.find(s => s.id === shift.id);
        if (exists) return prev.map(s => s.id === shift.id ? shift : s);
        return [...prev, shift];
      });
      return;
    }
    
    try {
      await setDoc(doc(db, `users/${user.uid}/workShifts`, shift.id), shift);
      setWorkShifts(prev => {
        const exists = prev.find(s => s.id === shift.id);
        if (exists) return prev.map(s => s.id === shift.id ? shift : s);
        return [...prev, shift];
      });
    } catch (err) {
      console.error("Save shift error:", err);
      throw err;
    }
  };

  const deleteShift = async (id: string) => {
    if (!user) return;
    setWorkShifts(prev => prev.filter(s => s.id !== id));
    if (user.isAnonymous) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/workShifts`, id));
    } catch (err) {
      console.error("Delete shift error:", err);
      throw err;
    }
  };

  return (
    <WorkShiftsContext.Provider value={{ workShifts, saveShift, deleteShift, loading }}>
      {children}
    </WorkShiftsContext.Provider>
  );
};
