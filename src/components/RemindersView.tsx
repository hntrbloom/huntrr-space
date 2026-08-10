import { safeGetDoc as getDoc, safeGetDocs as getDocs, safeGetDoc } from '../lib/firebase';
import React, { useState, useEffect } from 'react';
import { Bell, Plus, Trash2, Clock, Smartphone, Monitor, AlertCircle, RefreshCw } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';
import { SyncStatus } from './SyncStatus';

interface Reminder {
  id: string;
  text: string;
  time: string;
  active: boolean;
}

export function RemindersView() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'offline'>('idle');
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [newText, setNewText] = useState('');
  const [newTime, setNewTime] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (user.isAnonymous) {
      setReminders([
        { id: 'rem-1', text: '[Sample] Water the acrylic resin craft studio plants', time: '10:00', frequency: 'daily' },
        { id: 'rem-2', text: '[Sample] Check 3D Printer filament spool levels', time: '18:00', frequency: 'daily' },
        { id: 'rem-3', text: '[Sample] Post weekly character palette update on Instagram', time: '14:30', frequency: 'weekly' }
      ]);
      setLoading(false);
      return;
    }
    const loadData = async () => {
      try {
        const docRef = doc(db, `users/${user.uid}/preferences`, 'remindersData');
        const docSnap = await safeGetDoc(docRef);
        if (docSnap.exists()) {
          setReminders(docSnap.data().reminders || []);
        }
      } catch (e) {
        console.error('Error loading reminders:', e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [user]);

  const saveReminders = async (newReminders: Reminder[]) => {
    if (!user) return;
    if (user.isAnonymous) {
      setReminders(newReminders);
      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 1500);
      return;
    }
    setSyncStatus('saving');
    try {
      const docRef = doc(db, `users/${user.uid}/preferences`, 'remindersData');
      await setDoc(docRef, { reminders: newReminders }, { merge: true });
      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch (e) {
      console.error('Error saving reminders:', e);
      setSyncStatus('error');
    }
  };

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      
      if (permission === 'granted') {
        new Notification('Notifications Enabled!', {
          body: 'You will now receive reminders on this device.',
        });
      }
    } else {
      alert("Your browser does not support notifications.");
    }
  };

  const toggleReminder = (id: string) => {
    const updated = reminders.map(r => r.id === id ? { ...r, active: !r.active } : r);
    setReminders(updated);
    saveReminders(updated);
  };

  const deleteReminder = (id: string) => {
    const updated = reminders.filter(r => r.id !== id);
    setReminders(updated);
    saveReminders(updated);
  };

  const addReminder = (e: React.FormEvent) => {
    e.preventDefault();
    if (newText.trim() && newTime) {
      const newReminder = {
        id: Date.now().toString(),
        text: newText,
        time: newTime,
        active: true
      };
      const updated = [...reminders, newReminder];
      setReminders(updated);
      saveReminders(updated);
      setNewText('');
      setNewTime('');
      setIsAdding(false);

      if (notificationPermission === 'granted') {
        // In a real app, this would schedule a push notification or service worker alarm
        // Here we're just showing a confirmation
        new Notification('Reminder Set', {
          body: `"${newText}" set for ${newTime}`,
        });
      }
    }
  };

  return (
    <div className="flex-1 md:overflow-y-auto px-margin-mobile md:px-margin-desktop pb-safe-nav relative">
      <div className="md:hidden mt-4 mb-8 flex justify-between items-center">
        <h2 className="text-[32px] leading-[1.2] font-bold font-headline-lg-mobile text-on-surface m-0">Reminders</h2>
        <SyncStatus status={syncStatus} />
      </div>
      <div className="hidden md:block mt-8 mb-8 flex justify-between items-end">
        <h2 className="text-[40px] leading-[1.2] font-bold font-headline-lg text-on-surface m-0 tracking-tight">Reminders</h2>
        <SyncStatus status={syncStatus} />
      </div>

      {notificationPermission !== 'granted' && (
        <div className="mb-8 bg-surface-container-low border border-primary/20 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-[16px] leading-[1.2] font-semibold font-label-md text-on-surface mb-1">Enable Notifications</h3>
              <p className="text-[14px] leading-[1.6] font-body-md text-on-surface-variant">Get notified on your phone and desktop when it's time for a task.</p>
            </div>
          </div>
          <button 
            onClick={requestPermission}
            className="px-6 py-2.5 bg-primary text-on-primary hover:bg-primary/90 rounded-full text-[14px] font-semibold font-label-md transition-colors whitespace-nowrap shadow-sm"
          >
            Allow Notifications
          </button>
        </div>
      )}

      {notificationPermission === 'granted' && (
        <div className="mb-8 flex items-center gap-2 text-[14px] leading-[1.2] font-medium font-label-sm text-primary bg-primary-container/30 px-4 py-2 rounded-lg border border-primary/10 w-fit">
          <Smartphone className="w-4 h-4" />
          <Monitor className="w-4 h-4" />
          <span>Notifications active on this device</span>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h3 className="text-[20px] leading-[1.4] font-semibold font-headline-sm text-on-surface flex items-center gap-2">
          Scheduled
        </h3>
        {!isAdding && (
          <button 
            onClick={() => setIsAdding(true)}
            className="w-10 h-10 rounded-full bg-surface-container-high text-on-surface hover:bg-surface-variant transition-colors flex items-center justify-center"
          >
            <Plus className="w-5 h-5" />
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={addReminder} className="bg-surface-container-lowest p-5 rounded-xl border border-primary/30 shadow-md mb-6 animate-in fade-in slide-in-from-top-4 duration-300">
          <h4 className="text-[14px] leading-[1.2] font-semibold font-label-md text-primary mb-4">New Reminder</h4>
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <input 
              type="text" 
              placeholder="What to remind you about?"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              className="flex-1 bg-surface-container-low border border-outline-variant/50 rounded-lg px-4 py-2.5 text-[16px] font-body-md text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              autoFocus
            />
            <input 
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="w-full md:w-auto bg-surface-container-low border border-outline-variant/50 rounded-lg px-4 py-2.5 text-[16px] font-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button 
              type="button" 
              onClick={() => setIsAdding(false)}
              className="px-5 py-2 rounded-full text-[14px] font-medium font-label-md text-on-surface-variant hover:bg-surface-variant transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={!newText.trim() || !newTime}
              className="px-5 py-2 rounded-full text-[14px] font-medium font-label-md bg-primary text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {user?.isAnonymous ? 'Test Save' : 'Save Reminder'}
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {reminders.map((reminder) => (
          <div key={reminder.id} className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${reminder.active ? 'bg-surface-container-lowest border-outline-variant/20 shadow-sm hover:border-primary/30' : 'bg-surface-container-lowest/50 border-transparent opacity-60'}`}>
            <label className="flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                checked={!reminder.active}
                onChange={() => toggleReminder(reminder.id)}
                className="shrink-0"
              />
            </label>
            <div className="flex-1">
              <p className={`text-[16px] leading-[1.4] font-medium text-on-surface ${!reminder.active ? 'line-through' : ''}`}>{reminder.text}</p>
            </div>
            <div className="flex items-center gap-1.5 text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-lg text-[14px] font-medium">
              <Clock className="w-4 h-4 opacity-70" />
              <span>{reminder.time}</span>
            </div>
            <button 
              onClick={() => deleteReminder(reminder.id)}
              className="p-2 text-on-surface-variant/50 hover:text-error hover:bg-error-container rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}

        {reminders.length === 0 && !isAdding && (
          <div className="text-center py-12 border-2 border-dashed border-outline-variant/30 rounded-xl">
            <div className="w-12 h-12 bg-surface-variant rounded-full flex items-center justify-center mx-auto mb-4">
              <Bell className="w-6 h-6 text-on-surface-variant" />
            </div>
            <h4 className="text-[16px] font-semibold text-on-surface mb-2">No Reminders</h4>
            <p className="text-[14px] text-on-surface-variant">You don't have any reminders scheduled.</p>
          </div>
        )}
      </div>
    </div>
  );
}
