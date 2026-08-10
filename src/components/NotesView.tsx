import { safeGetDoc as getDoc, safeGetDocs as getDocs, safeGetDoc } from '../lib/firebase';

import React, { useState, useEffect, useRef } from 'react';
import { FileText, Plus, Trash2, ArrowLeft, PaintBucket } from 'lucide-react';
import { db } from '../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';
import { SyncStatus } from './SyncStatus';
import { GUEST_SAMPLE_NOTES } from '../lib/guestSampleData';

interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  color?: string;
}

const NOTE_COLORS = [
  { id: 'default', value: 'bg-surface' },
  { id: 'yellow', value: 'bg-[#fef3c7]' },
  { id: 'green', value: 'bg-[#dcfce7]' },
  { id: 'blue', value: 'bg-[#dbeafe]' },
  { id: 'pink', value: 'bg-[#fce7f3]' },
  { id: 'purple', value: 'bg-[#f3e8ff]' },
];

export function NotesView() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'offline'>('idle');
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        setShowColorPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (user.isAnonymous) {
      setNotes(GUEST_SAMPLE_NOTES);
      if (GUEST_SAMPLE_NOTES.length > 0) setActiveNoteId(GUEST_SAMPLE_NOTES[0].id);
      setLoading(false);
      return;
    }
    const loadData = async () => {
      try {
        const docRef = doc(db, `users/${user.uid}/preferences`, 'notesData');
        const docSnap = await safeGetDoc(docRef);
        let loadedNotes = docSnap.exists() ? (docSnap.data().notes || []) : [];
        if (loadedNotes.length === 0) {
          try {
            const rootRef = doc(db, 'users', user.uid);
            const rootSnap = await safeGetDoc(rootRef);
            if (rootSnap.exists() && rootSnap.data().notes) {
              loadedNotes = rootSnap.data().notes;
            }
          } catch(e) {}
        }
        if (loadedNotes.length > 0 || docSnap.exists()) {
          setNotes(loadedNotes);
          if (loadedNotes.length > 0) {
            setActiveNoteId(loadedNotes[0].id);
          }
        }
      } catch (e) {
        console.error('Error loading notes:', e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [user]);

  const saveNotes = async (newNotes: Note[]) => {
    if (!user) return;
    if (user.isAnonymous) {
      setNotes(newNotes);
      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 1500);
      return;
    }
    setSyncStatus('saving');
    try {
      const docRef = doc(db, `users/${user.uid}/preferences`, 'notesData');
      await setDoc(docRef, { notes: newNotes }, { merge: true });
      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 2000);
    } catch (e) {
      console.error('Error saving notes:', e);
      setSyncStatus('error');
    }
  };

  const addNote = () => {
    const newNote = {
      id: Date.now().toString(),
      title: 'New Note',
      content: '',
      updatedAt: new Date().toISOString()
    };
    const updated = [newNote, ...notes];
    setNotes(updated);
    setActiveNoteId(newNote.id);
    saveNotes(updated);
  };

  const updateNote = (id: string, updates: Partial<Note>) => {
    const updated = notes.map(n => n.id === id ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n);
    setNotes(updated);
    saveNotes(updated);
  };

  const deleteNote = (id: string) => {
    const updated = notes.filter(n => n.id !== id);
    setNotes(updated);
    if (activeNoteId === id) {
      setActiveNoteId(updated.length > 0 ? updated[0].id : null);
    }
    saveNotes(updated);
  };

  const activeNote = notes.find(n => n.id === activeNoteId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.max(480, textareaRef.current.scrollHeight)}px`;
    }
  }, [activeNote?.content, activeNoteId]);

  return (
    <div className="flex-1 md:overflow-y-auto flex flex-col md:flex-row pb-safe-nav md:pb-0 px-2 sm:px-4 md:px-margin-desktop gap-gutter pt-2">
      <section className={`w-full md:w-80 lg:w-[360px] shrink-0 ${activeNote ? "hidden md:flex" : "flex"} flex-col md:h-full bg-surface-container-lowest/50 rounded-2xl md:rounded-r-none border border-surface-container-low overflow-hidden shadow-sm`}>
        <div className="p-4 border-b border-surface-container-low flex justify-between items-center bg-surface shrink-0">
          <h3 className="text-[18px] md:text-[22px] leading-[1.4] font-semibold font-headline-sm text-on-surface">Notebook</h3>
          <div className="flex items-center gap-2">
            <SyncStatus status={syncStatus} />
            <button onClick={addNote} className="p-2 bg-primary text-on-primary hover:bg-primary/90 rounded-full transition-colors shadow-sm">
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 md:overflow-y-auto p-3 flex flex-col gap-2">
          {notes.length === 0 ? (
            <div className="text-sm text-black/40 italic p-4 text-center">No notes yet. Click + to add one.</div>
          ) : (
            notes.map(note => (
              <button
                key={note.id}
                onClick={() => setActiveNoteId(note.id)}
                className={`text-left p-4 rounded-xl border transition-colors flex flex-col gap-1 ${
                  activeNoteId === note.id 
                    ? 'bg-primary-container/20 border-primary/30 shadow-sm' 
                    : `${note.color && note.color !== 'bg-surface' ? note.color : 'bg-surface'} hover:bg-surface-variant/50 border-transparent`
                }`}
              >
                <div className="font-semibold text-[14px] md:text-[15px] truncate text-on-surface">{note.title || 'Untitled'}</div>
                <div className="text-[13px] text-on-surface-variant truncate">{note.content || 'No content...'}</div>
              </button>
            ))
          )}
        </div>
      </section>
      
      {activeNote ? (
        <section className={`${activeNote ? "flex" : "hidden"} md:flex flex-1 flex-col md:h-full bg-transparent rounded-2xl md:rounded-l-none border border-surface-container-low/60 shadow-[0_8px_24px_rgba(125,97,144,0.04)] relative overflow-hidden transition-colors duration-300`}>
          {/* Top Controls Outside Paper */}
          <div className="h-14 px-4 sm:px-6 border-b border-surface-container-low/80 flex justify-between items-center bg-surface/90 backdrop-blur-md z-20 shrink-0">
            <div className="flex items-center gap-3">
              <button onClick={() => setActiveNoteId(null)} className="md:hidden p-2 -ml-2 text-on-surface-variant hover:bg-surface-variant rounded-full transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <FileText className="w-5 h-5 text-primary hidden md:block" />
              <span className="text-xs font-semibold text-on-surface-variant/70 hidden sm:inline">Editing Note</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative" ref={colorPickerRef}>
                <button 
                  onClick={() => setShowColorPicker(!showColorPicker)} 
                  className="p-2 text-on-surface-variant hover:bg-surface-variant rounded-full transition-colors"
                  title="Change note theme color"
                >
                  <PaintBucket className="w-5 h-5" />
                </button>
                {showColorPicker && (
                  <div className="absolute right-0 top-full mt-2 p-2 bg-surface border border-surface-container-low shadow-lg rounded-xl flex gap-2 z-50">
                    {NOTE_COLORS.map(color => (
                      <button
                        key={color.id}
                        onClick={() => {
                          updateNote(activeNote.id, { color: color.value });
                          setShowColorPicker(false);
                        }}
                        className={`w-6 h-6 rounded-full border border-black/10 transition-transform hover:scale-110 ${color.value}`}
                        title={color.id}
                      />
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => deleteNote(activeNote.id)} className="p-2 text-error hover:bg-error-container rounded-full transition-colors" title="Delete note">
                 <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Centered Lined Notebook Paper Sheet Area */}
          <div className="flex-1 md:overflow-y-auto p-2 sm:p-4 md:p-6 flex flex-col items-center">
            <div 
              className="w-full max-w-3xl min-h-[560px] sm:min-h-[640px] bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-gray-200/80 relative overflow-hidden flex flex-col my-2 sm:my-4 transition-colors duration-300"
            >
              {/* Thin Pastel Pink Margin Line */}
              <div className="absolute top-0 bottom-0 left-10 sm:left-14 w-[2px] bg-[#f4a2b8] pointer-events-none z-10" />

              {/* Binder Punch Holes Effect on Left Edge */}
              <div className="absolute left-2 sm:left-3 top-10 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-gray-200/80 shadow-inner pointer-events-none z-10" />
              <div className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-gray-200/80 shadow-inner pointer-events-none z-10" />
              <div className="absolute left-2 sm:left-3 bottom-10 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-gray-200/80 shadow-inner pointer-events-none z-10" />

              {/* Lined Paper Writing Surface */}
              <div 
                className="flex-1 w-full pt-8 pb-12 pr-3 sm:pr-8 flex flex-col relative"
                style={{
                  backgroundImage: 'repeating-linear-gradient(transparent, transparent 31px, rgba(203, 213, 225, 0.6) 31px, rgba(203, 213, 225, 0.6) 32px)',
                  backgroundSize: '100% 32px',
                  backgroundPosition: '0 0'
                }}
              >
                {/* Note Title Input */}
                <input
                  type="text"
                  value={activeNote.title}
                  onChange={(e) => updateNote(activeNote.id, { title: e.target.value })}
                  className="w-full text-[20px] sm:text-[24px] font-bold text-on-surface bg-transparent outline-none placeholder:text-on-surface-variant/40 pl-14 sm:pl-20 pr-4 mb-2 tracking-tight"
                  style={{ lineHeight: '32px' }}
                  placeholder="Note Title"
                />

                {/* Note Content Textarea */}
                <textarea
                  ref={textareaRef}
                  value={activeNote.content}
                  onChange={(e) => updateNote(activeNote.id, { content: e.target.value })}
                  className="w-full flex-1 min-h-[460px] text-[15px] sm:text-[16px] text-on-surface/90 bg-transparent outline-none resize-none placeholder:text-on-surface-variant/40 pl-14 sm:pl-20 pr-4 leading-[32px]"
                  style={{ lineHeight: '32px' }}
                  placeholder="Start writing..."
                />
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="hidden md:flex flex-1 flex-col md:h-full bg-surface rounded-2xl md:rounded-l-none border border-surface-container-low shadow-[0_8px_24px_rgba(125,97,144,0.04)] relative overflow-hidden items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-surface-variant flex items-center justify-center mb-4 text-on-surface-variant">
            <FileText className="w-8 h-8 opacity-50" />
          </div>
          <p className="text-on-surface-variant text-[15px]">Select a note or create a new one.</p>
        </section>
      )}
    </div>
  );
}
