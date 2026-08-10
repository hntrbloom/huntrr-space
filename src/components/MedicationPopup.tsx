import { safeGetDoc as getDoc, safeGetDocs as getDocs, safeGetDocs } from '../lib/firebase';
import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, query, where, Timestamp } from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';
import { Pill, Check, X } from 'lucide-react';

export function MedicationPopup() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [time, setTime] = useState('');

  useEffect(() => {
    if (show) {
      const now = new Date();
      setTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
    }
  }, [show]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    const checkMeds = async () => {
      // Get the start of the current local day
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      try {
        const q = query(
          collection(db, `users/${user.uid}/medications`),
          where('dateTimestamp', '>=', Timestamp.fromDate(startOfDay)),
          where('dateTimestamp', '<=', Timestamp.fromDate(endOfDay)),
          where('completed', '==', true)
        );
        const snapshot = await safeGetDocs(q);
        
        // If there is no completed record for today, show popup
        if (snapshot.empty) {
          setShow(true);
        }
      } catch (err) {
        console.error("Error checking meds:", err);
      } finally {
        setLoading(false);
      }
    };
    checkMeds();
  }, [user]);

  const handleSave = async (tookMeds: boolean) => {
    if (!tookMeds) {
      // "Not Yet" - close popup without saving to db
      setShow(false);
      return;
    }
    
    if (!user || isSaving) return;
    
    setIsSaving(true);
    try {
      const now = new Date();
      // Date in ISO format for easy reading: 'YYYY-MM-DD'
      const isoDate = now.toLocaleDateString('en-CA');
      
      // Let's use the user's input time but attach it to today's date for accurate timestamping if we wanted, 
      // but the original request wants exact time taken and date. We will store it exactly as inputted.
      let timeTakenStr = time;
      // Also format it nicely to 12-hour for the view if they inputted 24-hour (time input is usually 24-hour)
      const [hours, minutes] = time.split(':');
      let h = parseInt(hours, 10);
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      h = h ? h : 12;
      timeTakenStr = `${h}:${minutes} ${ampm}`;
      
      // Check again right before saving to prevent duplicates if user double clicks
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
      const q = query(
        collection(db, `users/${user.uid}/medications`),
        where('dateTimestamp', '>=', Timestamp.fromDate(startOfDay)),
        where('dateTimestamp', '<=', Timestamp.fromDate(endOfDay)),
        where('completed', '==', true)
      );
      const snapshot = await safeGetDocs(q);
      
      if (snapshot.empty) {
        await addDoc(collection(db, `users/${user.uid}/medications`), {
          date: isoDate,
          dateTimestamp: Timestamp.fromDate(now),
          timeTaken: timeTakenStr,
          completed: true
        });
      }
      setShow(false);
    } catch (error) {
      console.error('Error saving med log:', error);
      alert('Failed to save medication record. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading || !show) return null;

  return (
    <div className="fixed inset-0 bg-inverse-surface/40 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-surface-container-lowest w-full max-w-sm rounded-2xl p-6 shadow-xl border border-outline-variant/30 animate-in fade-in zoom-in duration-200">
        <div className="w-12 h-12 bg-primary-container text-primary rounded-full flex items-center justify-center mx-auto mb-4">
          <Pill className="w-6 h-6" />
        </div>
        <h2 className="text-center text-[24px] font-headline-sm text-on-surface mb-2 tracking-tight">Medication</h2>
        <p className="text-center text-[16px] font-body-md text-on-surface-variant mb-6">
          Have you taken your medication today?
        </p>

        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-bold tracking-wider text-on-surface-variant uppercase text-center">
              Time Taken
            </label>
            <input 
              type="time" 
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full bg-surface-container-low border border-outline-variant/50 rounded-xl px-4 py-3 text-center text-[16px] font-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex gap-3 mt-4">
            <button 
              onClick={() => handleSave(false)}
              disabled={isSaving}
              className="flex-1 py-3 px-4 rounded-xl border border-outline-variant bg-surface text-on-surface font-label-md font-semibold hover:bg-surface-variant transition-colors flex items-center justify-center gap-2"
            >
              <X className="w-5 h-5 text-on-surface-variant" />
              Not Yet
            </button>
            <button 
              onClick={() => handleSave(true)}
              disabled={isSaving || !time}
              className="flex-1 py-3 px-4 rounded-xl bg-primary text-on-primary font-label-md font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Check className="w-5 h-5" />
              Taken
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
