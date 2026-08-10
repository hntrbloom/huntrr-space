import { safeGetDoc as getDoc, safeGetDocs as getDocs, safeGetDocs } from '../lib/firebase';
import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc, doc, deleteDoc, updateDoc, query, orderBy, Timestamp } from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';
import { Edit2, Trash2, Save } from 'lucide-react';
import { GUEST_SAMPLE_BLOG_POSTS } from '../lib/guestSampleData';

interface BlogPost {
  id: string;
  text: string;
  createdAt: number;
  editedAt?: number | null;
}

export function BlogView() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEntry, setNewEntry] = useState('');
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  
  const formatDate = (ms: number) => {
    const d = new Date(ms);
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };
  
  const formatTime = (ms: number) => {
    const d = new Date(ms);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };
  
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (user.isAnonymous) {
      setPosts(GUEST_SAMPLE_BLOG_POSTS.map(p => ({
        id: p.id,
        text: `# ${p.title}\n\n${p.excerpt}\n\n${p.content}`,
        createdAt: new Date(p.publishedAt).getTime()
      })));
      setLoading(false);
      return;
    }
    const fetchPosts = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, `users/${user.uid}/blog`),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await safeGetDocs(q);
        const fetched: BlogPost[] = [];
        snapshot.forEach(doc => {
          fetched.push({ id: doc.id, ...doc.data() } as BlogPost);
        });
        setPosts(fetched);
      } catch (e) {
        console.error("Error fetching blog posts", e);
      } finally {
        setLoading(false);
      }
    };
    fetchPosts();
  }, [user]);
  
  const handleSaveEntry = async () => {
    if (!user || !newEntry.trim()) return;
    const now = Date.now();
    if (user.isAnonymous) {
      setPosts([{ id: `guest-post-${now}`, text: newEntry.trim(), createdAt: now }, ...posts]);
      setNewEntry('');
      return;
    }
    try {
      const docRef = await addDoc(collection(db, `users/${user.uid}/blog`), {
        text: newEntry.trim(),
        createdAt: now
      });
      setPosts([{ id: docRef.id, text: newEntry.trim(), createdAt: now }, ...posts]);
      setNewEntry('');
    } catch (e) {
      console.error("Error saving entry", e);
    }
  };
  
  const handleDelete = async (id: string) => {
    if (!user || !window.confirm("Are you sure you want to delete this entry?")) return;
    if (user.isAnonymous) {
      setPosts(posts.filter(p => p.id !== id));
      return;
    }
    try {
      await deleteDoc(doc(db, `users/${user.uid}/blog`, id));
      setPosts(posts.filter(p => p.id !== id));
    } catch (e) {
      console.error("Error deleting entry", e);
    }
  };
  
  const handleEdit = (post: BlogPost) => {
    setEditingId(post.id);
    setEditText(post.text);
  };
  
  const handleUpdate = async () => {
    if (!user || !editingId || !editText.trim()) return;
    const now = Date.now();
    if (user.isAnonymous) {
      setPosts(posts.map(p => p.id === editingId ? { ...p, text: editText.trim(), editedAt: now } : p));
      setEditingId(null);
      setEditText('');
      return;
    }
    try {
      const postRef = doc(db, `users/${user.uid}/blog`, editingId);
      await updateDoc(postRef, {
        text: editText.trim(),
        editedAt: now
      });
      setPosts(posts.map(p => p.id === editingId ? { ...p, text: editText.trim(), editedAt: now } : p));
      setEditingId(null);
      setEditText('');
    } catch (e) {
      console.error("Error updating entry", e);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  return (
    <div className="flex-1 md:overflow-y-auto px-4 md:px-8 pb-safe-nav pt-8">
      <div className="w-full space-y-8">
        
        {/* Header and Writer Box */}
        <div className="bg-white rounded-[2rem] shadow-[0_8px_32px_rgba(255,184,205,0.2)] border border-[#FFB8CD]/30 p-6 md:p-8 animate-in fade-in zoom-in-95 duration-300 max-w-5xl mx-auto">
          <h2 className="text-[28px] md:text-[32px] font-bold text-black mb-6 tracking-tight">Journal</h2>
          
          <div className="space-y-4">
            <textarea
              value={newEntry}
              onChange={(e) => setNewEntry(e.target.value)}
              placeholder="What's on your mind today?"
              className="w-full min-h-[160px] bg-[#FFF0F4] border border-[#FFB8CD]/50 rounded-[1.5rem] p-5 text-[16px] text-black focus:outline-none focus:border-[#FFB8CD] focus:ring-2 focus:ring-[#FFB8CD]/20 shadow-inner resize-y placeholder:text-black/40 font-medium"
            />
            <div className="flex justify-end">
              <button 
                onClick={handleSaveEntry}
                disabled={!newEntry.trim()}
                className="px-6 py-3 bg-[#FFB8CD] text-white font-bold rounded-full shadow-[0_4px_14px_rgba(255,184,205,0.4)] hover:bg-[#FFB8CD]/90 transition-all disabled:opacity-50 disabled:hover:bg-[#FFB8CD] flex items-center gap-2"
              >
                <Save className="w-5 h-5" />{user?.isAnonymous ? 'Test Save' : ' Save Entry'}
              </button>
            </div>
          </div>
        </div>

        {/* Entries */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {loading ? (
            <div className="text-center py-12 text-black/40 font-medium">Loading entries...</div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12 text-black/40 font-medium bg-white/50 backdrop-blur-sm rounded-[2rem] border border-[#FFB8CD]/30">
              No entries yet. Write your first one above!
            </div>
          ) : (
            posts.map(post => (
              <div key={post.id} className="bg-white rounded-[2rem] shadow-[0_4px_20px_rgba(255,184,205,0.15)] border border-[#FFB8CD]/20 p-6 md:p-8 hover:shadow-[0_8px_24px_rgba(255,184,205,0.25)] transition-shadow duration-300 group">
                {editingId === post.id ? (
                  <div className="space-y-4">
                    <textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      className="w-full min-h-[120px] bg-[#FFF0F4] border border-[#FFB8CD]/50 rounded-[1.5rem] p-5 text-[16px] text-black focus:outline-none focus:border-[#FFB8CD] resize-y font-medium"
                    />
                    <div className="flex justify-end gap-3">
                      <button onClick={handleCancelEdit} className="px-5 py-2.5 bg-white text-black/60 font-bold rounded-full border border-black/10 hover:bg-black/5 transition-colors">
                        Cancel
                      </button>
                      <button onClick={handleUpdate} className="px-5 py-2.5 bg-[#FFB8CD] text-white font-bold rounded-full shadow-sm hover:bg-[#FFB8CD]/90 transition-colors">
                        Update
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-start mb-4 border-b border-[#FFB8CD]/20 pb-4">
                      <div className="flex flex-col">
                        <span className="text-[16px] font-bold text-black/80">{formatDate(post.createdAt)}</span>
                        {post.editedAt && (
                          <span className="text-[12px] font-medium text-black/40 italic mt-0.5">Edited</span>
                        )}
                      </div>
                      <span className="text-[14px] font-bold text-[#FFB8CD] bg-[#FFF0F4] px-3 py-1 rounded-full">{formatTime(post.createdAt)}</span>
                    </div>
                    
                    <div className="text-[16px] text-black leading-relaxed whitespace-pre-wrap font-medium">
                      {post.text}
                    </div>

                    <div className="mt-6 flex justify-end gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEdit(post)} className="p-2 text-black/40 hover:text-black hover:bg-black/5 rounded-full transition-colors" title="Edit">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(post.id)} className="p-2 text-black/40 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
        
      </div>
    </div>
  );
}
