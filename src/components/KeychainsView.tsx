
import React, { useState, useEffect, useRef } from 'react';
import { db, storage } from '../lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../lib/AuthContext';
import { Plus, Search, Image as ImageIcon, Download, Trash2, Edit, X, Upload, Key, Eye, CheckCircle2 } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { v4 as uuidv4 } from 'uuid';
import { compressImageIfNeeded, uploadFileToStorage } from '../lib/storage';
import { ImageUploaderArea } from './ui/ImageUploaderArea';
import { ImageViewerModal } from './ImageViewerModal';
import { GUEST_SAMPLE_KEYCHAINS } from '../lib/guestSampleData';

interface Charm {
  id: string;
  name: string;
  imageUrl: string; // main preview
  frontImage?: string;
  leftImage?: string;
  rightImage?: string;
  backImage?: string;
}

interface KeychainIdea {
  id: string;
  name: string;
  company: string;
  stage: string;
  numCharms: number;
  charms: Charm[];
}

interface LocalCharm extends Charm {
  isSaving?: boolean;
  isSaved?: boolean;
  isEditingViews?: boolean;
  files?: {
    imageUrl?: File;
    frontImage?: File;
    leftImage?: File;
    rightImage?: File;
    backImage?: File;
  };
}

export function KeychainsView() {
  const { user } = useAuth();
  const [ideas, setIdeas] = useState<KeychainIdea[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modals state
  const [isAdding, setIsAdding] = useState(false);
  const [viewingCharm, setViewingCharm] = useState<Charm | null>(null);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  
  // Edit Form state
  const [editingIdea, setEditingIdea] = useState<KeychainIdea | null>(null);
  const [ideaId, setIdeaId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [stage, setStage] = useState('Idea');
  const [localCharms, setLocalCharms] = useState<LocalCharm[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  
  // Upload state
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadSuccess, setUploadSuccess] = useState<Record<string, boolean>>({});

  const stages = ['Idea', 'Designing', 'Printing', 'Assembly', 'Done'];

  useEffect(() => {
    if (!user) return;
    if (user.isAnonymous) {
      setIdeas(GUEST_SAMPLE_KEYCHAINS.map(k => ({
        id: k.id,
        name: k.title,
        company: k.series,
        stage: k.status === 'Completed' ? 'Done' : 'Designing',
        numCharms: k.photos.length,
        charms: k.photos.map((p, idx) => ({
          id: `charm-${idx}`,
          name: idx === 0 ? 'Main Charm' : 'Accent Charm',
          imageUrl: p,
          frontImage: p,
          leftImage: p,
          rightImage: p,
          backImage: p
        }))
      })));
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(collection(db, `users/${user.uid}/keychains`), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as KeychainIdea[];
      setIdeas(data);
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  // Keydown for Esc to close viewing modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (enlargedImage) setEnlargedImage(null);
        else if (viewingCharm) setViewingCharm(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enlargedImage, viewingCharm]);

  const handleNumCharmsChange = (newNum: number) => {
    // Left for potential backwards compatibility but no longer used in UI
  };

  const handleAddCharm = () => {
    setLocalCharms(prev => [...prev, {
      id: uuidv4(),
      name: '',
      imageUrl: '',
      isSaved: false,
      isEditingViews: false
    }]);
  };

  const uploadCharmFiles = async (currentIdeaId: string, charm: LocalCharm): Promise<LocalCharm> => {
    if (user?.isAnonymous) {
      return { ...charm, files: {}, isSaved: true };
    }
    
    setLocalCharms(prev => prev.map(c => c.id === charm.id ? { ...c, isSaving: true } : c));
    
    const fieldsToUpload: (keyof Charm)[] = ['imageUrl', 'frontImage', 'leftImage', 'rightImage', 'backImage'];
    const newUrls: Partial<Charm> = {};
    
    try {
      for (const field of fieldsToUpload) {
        const originalFile = charm.files?.[field as keyof typeof charm.files];
        if (originalFile) {
          const progressKey = `${charm.id}-${field}`;
          setUploadProgress(prev => ({ ...prev, [progressKey]: 10 }));
          
          const result = await uploadFileToStorage(user!.uid, `keychains/${currentIdeaId}/${charm.id}`, originalFile);
          
          setUploadProgress(prev => ({ ...prev, [progressKey]: 100 }));
          newUrls[field] = result.url;
          setUploadSuccess(prev => ({ ...prev, [progressKey]: true }));
          
          setTimeout(() => {
            setUploadSuccess(prev => {
              const next = { ...prev };
              delete next[progressKey];
              return next;
            });
            setUploadProgress(prev => {
              const next = { ...prev };
              delete next[progressKey];
              return next;
            });
          }, 3000);
        }
      }
      
      const finalCharm = {
        ...charm,
        imageUrl: newUrls.imageUrl || charm.imageUrl,
        frontImage: newUrls.frontImage || charm.frontImage,
        leftImage: newUrls.leftImage || charm.leftImage,
        rightImage: newUrls.rightImage || charm.rightImage,
        backImage: newUrls.backImage || charm.backImage,
        files: {},
        isSaving: false,
        isSaved: true
      };
      
      setLocalCharms(prev => prev.map(c => c.id === charm.id ? finalCharm : c));
      return finalCharm;

    } catch (err) {
      console.error("Upload failed in uploadCharmFiles:", err);
      setLocalCharms(prev => prev.map(c => c.id === charm.id ? { ...c, isSaving: false } : c));
      setUploadProgress(prev => {
        const next = { ...prev };
        for (const field of fieldsToUpload) {
          delete next[`${charm.id}-${field}`];
        }
        return next;
      });
      throw err; // Rethrow to let the caller show the alert
    }
  };

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSaveAll = async () => {
    if (!name.trim() || !user) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    
    try {
      let currentIdeaId = editingIdea?.id || ideaId;
      if (!currentIdeaId) {
        currentIdeaId = doc(collection(db, `users/${user.uid}/keychains`)).id;
        setIdeaId(currentIdeaId);
      }
      
      const ideaData = {
        name,
        company,
        stage,
        numCharms: localCharms.length,
      };
      
      await setDoc(doc(db, `users/${user.uid}/keychains`, currentIdeaId), ideaData, { merge: true });
      
      const updatedCharms = [...localCharms];
      
      for (let i = 0; i < updatedCharms.length; i++) {
        const charm = updatedCharms[i];
        if (charm.files && Object.keys(charm.files).length > 0) {
          updatedCharms[i] = await uploadCharmFiles(currentIdeaId, charm);
        }
      }
      
      const finalCharms = updatedCharms.map(c => ({
        id: c.id,
        name: c.name || '',
        imageUrl: c.imageUrl?.startsWith('blob:') ? '' : (c.imageUrl || ''),
        frontImage: c.frontImage?.startsWith('blob:') ? '' : (c.frontImage || ''),
        leftImage: c.leftImage?.startsWith('blob:') ? '' : (c.leftImage || ''),
        rightImage: c.rightImage?.startsWith('blob:') ? '' : (c.rightImage || ''),
        backImage: c.backImage?.startsWith('blob:') ? '' : (c.backImage || ''),
      }));
      
      await updateDoc(doc(db, `users/${user.uid}/keychains`, currentIdeaId), {
        charms: finalCharms,
        numCharms: finalCharms.length
      });
      
      setSaveSuccess(true);
      setTimeout(() => {
        setIsAdding(false);
        setEditingIdea(null);
        resetForm();
        setIsSaving(false);
        setSaveSuccess(false);
      }, 1000);
      
    } catch (e) {
      console.error(e);
      setSaveError(e instanceof Error ? e.message : 'Unknown error');
      setIsSaving(false);
    }
  };

  const handleSaveSingleCharm = async (charmId: string) => {
    if (!name.trim() || !user) {
      alert("Please enter a Keychain Name first before saving a charm.");
      return;
    }
    
    const charm = localCharms.find(c => c.id === charmId);
    if (!charm) return;
    
    try {
      let currentIdeaId = editingIdea?.id || ideaId;
      if (!currentIdeaId) {
        currentIdeaId = doc(collection(db, `users/${user.uid}/keychains`)).id;
        setIdeaId(currentIdeaId);
      }
      
      const ideaData = {
        name,
        company,
        stage,
        numCharms: localCharms.length,
      };
      
      await setDoc(doc(db, `users/${user.uid}/keychains`, currentIdeaId), ideaData, { merge: true });
      
      const updatedCharm = await uploadCharmFiles(currentIdeaId, charm);
      
      const updatedCharms = localCharms.map(c => c.id === charm.id ? updatedCharm : c);
      
      const finalCharms = updatedCharms.map(c => ({
        id: c.id,
        name: c.name || '',
        imageUrl: c.imageUrl?.startsWith('blob:') ? '' : (c.imageUrl || ''),
        frontImage: c.frontImage?.startsWith('blob:') ? '' : (c.frontImage || ''),
        leftImage: c.leftImage?.startsWith('blob:') ? '' : (c.leftImage || ''),
        rightImage: c.rightImage?.startsWith('blob:') ? '' : (c.rightImage || ''),
        backImage: c.backImage?.startsWith('blob:') ? '' : (c.backImage || ''),
      }));
      
      await updateDoc(doc(db, `users/${user.uid}/keychains`, currentIdeaId), {
        charms: finalCharms,
        numCharms: finalCharms.length
      });
      
    } catch (e) {
      console.error(e);
      alert("Failed to save charm: " + (e instanceof Error ? e.message : 'Unknown error'));
    }
  };

  const resetForm = () => {
    setName('');
    setCompany('');
    setStage('Idea');
    setIdeaId(null);
    setLocalCharms([]);
    setUploadProgress({});
    setUploadSuccess({});
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    if (confirm('Are you sure you want to delete this keychain idea?')) {
      await deleteDoc(doc(db, `users/${user.uid}/keychains`, id));
    }
  };

  const handleEdit = (idea: KeychainIdea) => {
    setEditingIdea(idea);
    setIdeaId(idea.id);
    setName(idea.name || '');
    setCompany(idea.company || '');
    setStage(idea.stage || 'Idea');
    setLocalCharms(idea.charms || []);
    setIsAdding(true);
  };

  const handleEditCharmFromCard = (idea: KeychainIdea, charm: Charm) => {
    handleEdit(idea);
    // In a real app we might scroll to it, but opening the modal with the idea is good enough
  };

  const handleDeleteCharmFromCard = async (idea: KeychainIdea, charm: Charm) => {
    if (!user) return;
    if (confirm('Remove this charm permanently?')) {
      const newCharms = idea.charms.filter(c => c.id !== charm.id);
      await updateDoc(doc(db, `users/${user.uid}/keychains`, idea.id), {
        charms: newCharms,
        numCharms: newCharms.length
      });
    }
  };

  const handleImageSelect = (file: File, charmId: string, field: keyof Charm) => {
    const url = URL.createObjectURL(file);
    setLocalCharms(prev => prev.map(c => {
      if (c.id === charmId) {
        return {
          ...c,
          [field]: url,
          files: {
             ...(c.files || {}),
             [field]: file
          },
          isSaved: false
        };
      }
      return c;
    }));
  };

  const downloadFolder = async (idea: KeychainIdea) => {
    if (!idea.charms || idea.charms.length === 0) {
      alert("No charms to download!");
      return;
    }
    
    try {
      const zip = new JSZip();
      const folder = zip.folder((idea.name || 'Keychain').replace(/[^a-z0-9]/gi, '-'));
      
      if (!folder) throw new Error("Could not create folder in zip");

      const promises = idea.charms.map(async (charm, index) => {
        const addImage = async (url: string | undefined, suffix: string) => {
            if (!url) return;
            try {
              const res = await fetch(url);
              const blob = await res.blob();
              const ext = blob.type.split('/')[1] || 'png';
              const filename = charm.name ? `${charm.name}-${suffix}.${ext}` : `charm-${index + 1}-${suffix}.${ext}`;
              folder.file(filename, blob);
            } catch (e) {
              console.error("Failed to fetch image", e);
            }
        };
        await addImage(charm.imageUrl, 'preview');
        await addImage(charm.frontImage, 'front');
        await addImage(charm.leftImage, 'left');
        await addImage(charm.rightImage, 'right');
        await addImage(charm.backImage, 'back');
      });

      await Promise.all(promises);
      const content = await zip.generateAsync({ type: "blob" });
      const zipName = `${(idea.name || 'Keychain').replace(/[^a-z0-9]/gi, '-').toLowerCase()}-charms.zip`;
      saveAs(content, zipName);
    } catch (err) {
      console.error("Error creating zip", err);
      alert("Failed to download images.");
    }
  };

  const renderUploadButton = (charm: LocalCharm, field: keyof Charm, label: string) => {
    const progressKey = `${charm.id}-${field}`;
    const progress = uploadProgress[progressKey];
    const success = uploadSuccess[progressKey];
    const hasImage = !!charm[field];

    return (
      <div className="flex flex-col gap-2">
        <label className="text-[13px] font-bold text-on-surface-variant">{label}</label>
        <ImageUploaderArea 
          onUpload={(files) => {
            if (files && files.length > 0) {
              handleImageSelect(files[0] as File, charm.id, field);
            }
          }}
          className="relative w-full"
        >
          {hasImage ? (
            <div className="relative group w-full aspect-square rounded-xl overflow-hidden border border-outline-variant/30">
              <img src={charm[field] as string} className="w-full h-full object-cover" />
              {user?.isAnonymous && (charm[field] as string).startsWith('blob:') && (
                <div className="absolute inset-x-0 bottom-0 bg-black/60 backdrop-blur-sm p-1.5 flex justify-center z-10">
                   <span className="text-[10px] leading-tight text-white/90 text-center font-medium">Temporary preview<br/>(will not be saved)</span>
                </div>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Are you sure you want to remove the ${label} photo?`)) {
                    setLocalCharms(prev => prev.map(c => c.id === charm.id ? { ...c, [field]: '' } : c));
                  }
                }}
                className="absolute top-1 right-1 p-1 bg-black/60 text-white hover:bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-all z-10"
                title="Remove photo"
              >
                <X className="w-4 h-4" />
              </button>
              <label className="absolute inset-0 bg-black/50 text-white flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                <Upload className="w-5 h-5 mb-1" />
                <span className="text-xs font-bold">Replace</span>
                <input 
                  type="file" 
                  accept="image/png, image/jpeg, image/jpg, image/webp, image/heic, image/*"
                  className="hidden" 
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleImageSelect(e.target.files[0], charm.id, field);
                    }
                  }}
                />
              </label>
            </div>
          ) : (
            <label className="w-full aspect-square rounded-xl border-2 border-dashed border-outline-variant/50 hover:bg-surface-container-low flex flex-col items-center justify-center cursor-pointer transition-colors relative">
              <Upload className="w-6 h-6 text-on-surface-variant/50 mb-2" />
              <span className="text-xs font-medium text-on-surface-variant text-center px-2">Upload {label}</span>
              <input 
                type="file" 
                accept="image/png, image/jpeg, image/jpg, image/webp, image/heic, image/*"
                className="hidden" 
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleImageSelect(e.target.files[0], charm.id, field);
                  }
                }}
              />
            </label>
          )}
          
          {progress !== undefined && (
            <div className="absolute inset-0 bg-white/80 rounded-xl flex flex-col items-center justify-center p-4 z-20">
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }}></div>
              </div>
              <span className="text-xs font-bold mt-2 text-primary">{Math.round(progress)}%</span>
            </div>
          )}
          {success && (
            <div className="absolute top-2 right-2 p-1 bg-green-500 text-white rounded-full shadow-md z-20">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          )}
        </ImageUploaderArea>
      </div>
    );
  };

  return (
    <main className="flex-1 md:overflow-y-auto px-margin-mobile md:px-margin-desktop py-8 md:py-12 pb-safe-nav w-full relative">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h2 className="text-[32px] md:text-[40px] leading-[1.2] font-bold font-headline-lg-mobile md:font-headline-lg text-on-surface m-0 tracking-tight">Keychain Ideas</h2>
          <p className="text-[16px] text-on-surface-variant mt-2 font-body-lg">Manage your keychain designs and charms.</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setIsAdding(true);
            setEditingIdea(null);
          }}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-primary text-on-primary rounded-full hover:bg-primary/90 transition-colors font-bold font-label-lg whitespace-nowrap"
        >
          <Plus className="w-5 h-5" />
          New Keychain
        </button>
      </div>
      
      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></div></div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {ideas.map(idea => (
            <div key={idea.id} className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 shadow-sm flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-[24px] text-on-surface">{idea.name}</h3>
                  {idea.company && <div className="text-[15px] font-medium text-on-surface-variant mt-1">{idea.company}</div>}
                  <div className="inline-block mt-2 px-3 py-1 bg-primary-container text-on-primary-container rounded-full text-xs font-bold font-label-sm">
                    {idea.stage}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => downloadFolder(idea)} className="p-2 text-on-surface-variant hover:text-primary transition-colors hover:bg-surface-container rounded-full" title="Download all charms as ZIP">
                    <Download className="w-5 h-5" />
                  </button>
                  <button onClick={() => handleEdit(idea)} className="p-2 text-on-surface-variant hover:text-primary transition-colors hover:bg-surface-container rounded-full" title="Edit Keychain">
                    <Edit className="w-5 h-5" />
                  </button>
                  <button onClick={() => handleDelete(idea.id)} className="p-2 text-on-surface-variant hover:text-error transition-colors hover:bg-surface-container rounded-full" title="Delete Keychain">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
              

              
              <div className="mt-auto">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-bold text-[16px] text-on-surface">Charms ({idea.numCharms || (idea.charms ? idea.charms.length : 0)})</h4>
                </div>
                
                <div className="flex flex-wrap gap-4">
                  {idea.charms && idea.charms.length > 0 ? (
                    idea.charms.map((charm, idx) => (
                      <div key={charm.id || idx} className="relative group w-28 h-28 rounded-xl overflow-hidden border border-outline-variant/30 bg-surface-container-low shadow-sm">
                        {charm.imageUrl ? (
                          <img src={charm.imageUrl} alt={charm.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-on-surface-variant/50">
                            <ImageIcon className="w-6 h-6 mb-1 opacity-50" />
                            <span className="text-[10px] uppercase font-bold tracking-wider text-center px-1 leading-tight">No photo</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 backdrop-blur-[2px]">
                          {(charm.frontImage || charm.backImage || charm.leftImage || charm.rightImage) && (
                            <button 
                              onClick={() => setViewingCharm(charm)}
                              className="bg-white text-black px-4 py-1.5 rounded-full text-[13px] font-bold shadow-sm hover:scale-105 transition-transform flex items-center gap-1"
                            >
                              <Eye className="w-4 h-4" /> View
                            </button>
                          )}
                          <div className="flex gap-2">
                            <button 
                              onClick={() => handleEditCharmFromCard(idea, charm)}
                              className="w-8 h-8 flex items-center justify-center bg-white/20 hover:bg-white/40 text-white rounded-full transition-colors"
                              title="Edit"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleDeleteCharmFromCard(idea, charm)}
                              className="w-8 h-8 flex items-center justify-center bg-red-500/80 hover:bg-red-500 text-white rounded-full transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        {charm.name && (
                           <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6 pointer-events-none">
                             <p className="text-white text-[11px] font-bold truncate text-center drop-shadow-md">{charm.name}</p>
                           </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="w-full py-6 text-center text-on-surface-variant/70 text-sm bg-surface-container-low rounded-xl border border-dashed border-outline-variant/50">
                      No charms added yet. Edit this keychain to add charms.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {ideas.length === 0 && (
             <div className="col-span-full py-16 text-center text-on-surface-variant">
                <div className="w-16 h-16 mx-auto bg-surface-container rounded-full flex items-center justify-center mb-4">
                  <Key className="w-8 h-8 text-on-surface-variant/50" />
                </div>
                <h3 className="font-bold text-[20px] mb-2">No keychains</h3>
                <p>Click the button above to create your first keychain and start adding charms.</p>
             </div>
          )}
        </div>
      )}

      {/* Add / Edit Modal */}
      {isAdding && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsAdding(false); }}>
          <div className="bg-surface-container-lowest w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 md:p-8 shadow-2xl relative">
            <div className="sticky top-0 bg-surface-container-lowest z-10 pb-4 border-b border-outline-variant/20 mb-6 flex justify-between items-center">
              <h3 className="text-[24px] font-bold font-headline-md text-on-surface">{editingIdea ? 'Edit Keychain' : 'New Keychain'}</h3>
              <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-surface-container rounded-full transition-colors text-on-surface-variant hover:text-on-surface">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[14px] font-bold text-on-surface mb-2 font-label-md">Name *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 bg-surface-container rounded-xl border-none focus:ring-2 focus:ring-primary outline-none text-on-surface"
                    placeholder="e.g. Magical Girl Star Wand"
                  />
                </div>
                <div>
                  <label className="block text-[14px] font-bold text-on-surface mb-2 font-label-md">Company / Brand</label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full px-4 py-3 bg-surface-container rounded-xl border-none focus:ring-2 focus:ring-primary outline-none text-on-surface"
                    placeholder="e.g. Sanrio"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[14px] font-bold text-on-surface mb-2 font-label-md">Stage</label>
                  <select
                    value={stage}
                    onChange={(e) => setStage(e.target.value)}
                    className="w-full px-4 py-3 bg-surface-container rounded-xl border-none focus:ring-2 focus:ring-primary outline-none text-on-surface"
                  >
                    {stages.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>



              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={handleAddCharm}
                  className="flex items-center gap-2 px-4 py-2 bg-surface-container-high text-on-surface hover:bg-surface-container-highest rounded-full transition-colors font-bold text-[14px]"
                >
                  <Plus className="w-4 h-4" /> Add Charm
                </button>
              </div>

              {localCharms.length > 0 && (
                <div className="mt-8 border-t border-outline-variant/20 pt-8">
                  <h4 className="text-[20px] font-bold text-on-surface mb-6">Charm Photos</h4>
                  <div className="space-y-8">
                    {localCharms.map((charm, idx) => (
                      <div key={charm.id} className="bg-surface p-6 rounded-2xl border border-outline-variant/30 shadow-sm relative">
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to remove this charm from the keychain?')) {
                              setLocalCharms(prev => prev.filter(c => c.id !== charm.id));
                            }
                          }}
                          className="absolute top-4 right-4 p-2 text-on-surface-variant hover:text-error hover:bg-error-container/50 rounded-full transition-colors"
                          title="Remove Charm"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                        <div className="flex flex-col md:flex-row gap-6 mb-4 pr-12">
                          <div className="w-32 md:w-40 shrink-0">
                             {renderUploadButton(charm, 'imageUrl', 'Preview Photo')}
                          </div>
                          
                          <div className="flex-1 flex flex-col gap-4">
                            <div className="flex items-center gap-3">
                              <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[14px] shrink-0">{idx + 1}</span>
                              <input 
                                type="text"
                                value={charm.name}
                                onChange={(e) => setLocalCharms(prev => prev.map(c => c.id === charm.id ? { ...c, name: e.target.value, isSaved: false } : c))}
                                placeholder="Charm Name"
                                className="w-full px-4 py-3 bg-surface-container rounded-xl border-none focus:ring-2 focus:ring-primary outline-none text-on-surface font-semibold text-[16px]"
                              />
                            </div>
                            
                            <button
                              type="button"
                              onClick={() => setLocalCharms(prev => prev.map(c => c.id === charm.id ? { ...c, isEditingViews: !c.isEditingViews } : c))}
                              className="self-start px-5 py-2.5 bg-surface-container-high hover:bg-surface-container-highest rounded-full text-[14px] font-bold text-on-surface transition-colors"
                            >
                              {charm.isEditingViews ? 'Hide Views' : 'Add/Edit Views'}
                            </button>
                          </div>
                        </div>

                        {charm.isEditingViews && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-outline-variant/20">
                            {renderUploadButton(charm, 'frontImage', 'Front')}
                            {renderUploadButton(charm, 'backImage', 'Back')}
                            {renderUploadButton(charm, 'leftImage', 'Left')}
                            {renderUploadButton(charm, 'rightImage', 'Right')}
                          </div>
                        )}
                        
                        <div className="flex justify-end pt-4 mt-4 border-t border-outline-variant/20">
                           <button
                             type="button"
                             onClick={() => handleSaveSingleCharm(charm.id)}
                             disabled={charm.isSaving || charm.isSaved}
                             className="px-5 py-2.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-full font-bold text-[14px] transition-colors disabled:opacity-50 flex items-center gap-2"
                           >
                             {charm.isSaving ? (
                               <><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div> Saving...</>
                             ) : charm.isSaved ? (
                               'Saved'
                             ) : (
                               'Save Charm'
                             )}
                           </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-surface-container-lowest z-10 pt-6 mt-8 flex justify-end gap-3 border-t border-outline-variant/20">
              <button
                onClick={() => setIsAdding(false)}
                className="px-6 py-2.5 rounded-full font-bold font-label-lg hover:bg-surface-container transition-colors text-on-surface-variant"
              >
                Cancel
              </button>
              
              {saveError && <span className="text-error font-medium text-sm mr-auto ml-4">{saveError}</span>}
              {saveSuccess && <span className="text-[#2E7D32] font-medium text-sm mr-auto ml-4 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Saved successfully</span>}
              <button
                onClick={handleSaveAll}
                disabled={!name.trim() || isSaving || saveSuccess}
                className="px-8 py-2.5 bg-primary text-on-primary rounded-full font-bold font-label-lg hover:bg-primary/90 transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2 min-w-[140px]"
              >
                {isSaving ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> Saving...</>
                ) : saveSuccess ? (
                  'Saved'
                ) : user?.isAnonymous ? 'Test Save' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4-View Pop-out Modal */}
      {viewingCharm && (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setViewingCharm(null); }}>
          <div className="bg-surface-container-lowest w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 md:p-10 shadow-2xl relative">
            <button onClick={() => setViewingCharm(null)} className="absolute top-4 right-4 md:top-6 md:right-6 p-2 bg-surface-container hover:bg-surface-container-high rounded-full transition-colors z-10">
              <X className="w-6 h-6 text-on-surface" />
            </button>
            
            <div className="text-center mb-8 pr-12">
              <h3 className="text-[28px] md:text-[32px] font-bold text-on-surface leading-tight">{viewingCharm.name || 'Untitled Charm'}</h3>
              <p className="text-on-surface-variant mt-2 font-medium">Click any image to view it full size</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
              {[
                { field: 'frontImage', label: 'Front View' },
                { field: 'leftImage', label: 'Left View' },
                { field: 'rightImage', label: 'Right View' },
                { field: 'backImage', label: 'Back View' }
              ].map((view) => {
                const imgUrl = viewingCharm[view.field as keyof Charm] as string;
                return (
                  <div key={view.field} className="flex flex-col items-center group">
                    <span className="font-bold text-[18px] text-on-surface mb-4 uppercase tracking-wider">{view.label}</span>
                    <div 
                      className="w-full aspect-square bg-surface-container-low border-2 border-outline-variant/30 rounded-2xl overflow-hidden flex items-center justify-center relative cursor-pointer shadow-sm hover:shadow-md hover:border-primary/50 transition-all"
                      onClick={() => imgUrl && setEnlargedImage(imgUrl)}
                    >
                      {imgUrl ? (
                        <>
                           <img src={imgUrl} className="w-full h-full object-contain p-2" />
                           <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors"></div>
                        </>
                      ) : (
                        <div className="text-on-surface-variant/50 flex flex-col items-center gap-2">
                           <ImageIcon className="w-8 h-8 opacity-50" />
                           <span className="text-[14px] font-medium text-center px-4">No photo uploaded yet</span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Enlarged Image Overlay */}
      {enlargedImage && (
        <ImageViewerModal
          image={{
            url: enlargedImage,
            title: viewingCharm ? `${viewingCharm.name || 'Keychain'} Photo` : 'Keychain Photo',
            filename: viewingCharm ? `${viewingCharm.name}_photo` : 'keychain_photo'
          }}
          allImages={viewingCharm ? [
            { url: viewingCharm.frontImage || '', title: `${viewingCharm.name}_Front` },
            { url: viewingCharm.leftImage || '', title: `${viewingCharm.name}_Left` },
            { url: viewingCharm.rightImage || '', title: `${viewingCharm.name}_Right` },
            { url: viewingCharm.backImage || '', title: `${viewingCharm.name}_Back` }
          ].filter(i => !!i.url) : undefined}
          zipTitle={viewingCharm ? `${viewingCharm.name}_Charm_Views.zip` : undefined}
          onClose={() => setEnlargedImage(null)}
        />
      )}
    </main>
  );
}
