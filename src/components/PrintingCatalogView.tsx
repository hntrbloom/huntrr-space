
import React, { useState, useEffect, useRef } from 'react';
import { Plus, Printer, Image as ImageIcon, Search, Trash2, Edit2, X, Link as LinkIcon, Layers, Loader2, ExternalLink, Upload, FolderOpen } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';
import { SyncStatus } from './SyncStatus';
import { uploadFileToStorage, deleteFileFromStorage } from '../lib/storage';
import { GUEST_SAMPLE_PRINT_DESIGNS } from '../lib/guestSampleData';
import { SmartImage } from './SmartImage';
import { useGoogleDrivePicker } from '../hooks/useGoogleDrivePicker';
import { getUserSettings } from '../lib/settingsUtils';
import { downloadDriveFile } from '../lib/driveImageUtils';
import { Download } from 'lucide-react';

interface PrintBuild {
  id: string;
  name: string;
  link: string;
  plates: number;
  imageUrl: string;
  imageStoragePath?: string;
  
  // New Google Drive fields
  referenceId?: string;
  mockupId?: string;
  extraIds?: string[];
  
  createdAt: any;
}

export function PrintingCatalogView() {
  const { user } = useAuth();
  const { showPicker } = useGoogleDrivePicker();
  const [driveFolders, setDriveFolders] = useState<any>(null);

  useEffect(() => {
    if (user && !user.isAnonymous) {
      getUserSettings(user.uid).then(settings => {
        if (settings?.driveFolders) {
          setDriveFolders(settings.driveFolders);
        }
      });
    }
  }, [user]);

  const [builds, setBuilds] = useState<PrintBuild[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formName, setFormName] = useState('');
  const [formLink, setFormLink] = useState('');
  const [formPlates, setFormPlates] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formImageFile, setFormImageFile] = useState<File | null>(null);
  const [formImagePreview, setFormImagePreview] = useState<string>('');
  
  const [formReferenceId, setFormReferenceId] = useState<string>('');
  const [formMockupId, setFormMockupId] = useState<string>('');
  const [formExtraIds, setFormExtraIds] = useState<string[]>([]);

  const [isFetchingImage, setIsFetchingImage] = useState(false);
  
  const [selectedBuild, setSelectedBuild] = useState<PrintBuild | null>(null);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (!user) return;
    if (user.isAnonymous) {
      setBuilds(GUEST_SAMPLE_PRINT_DESIGNS.map(p => ({
        id: p.id,
        name: p.title,
        link: 'https://makerworld.com/en/models/sample',
        plates: 1,
        imageUrl: p.photos[0],
        createdAt: new Date().toISOString()
      })));
      return;
    }
    const q = query(
      collection(db, `users/${user.uid}/printing`),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedBuilds = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PrintBuild[];
      setBuilds(fetchedBuilds);
    });
    
    return () => unsubscribe();
  }, [user]);

  const fetchMakerworldImage = async (url: string) => {
    if (!url || !url.includes('makerworld.com')) return;
    setIsFetchingImage(true);
    try {
      const res = await fetch(`/api/makerworld-preview?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (data.imageUrl) {
        setFormImageUrl(data.imageUrl);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsFetchingImage(false);
    }
  };

  const handleLinkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormLink(val);
    if (val.trim()) {
      fetchMakerworldImage(val.trim());
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormLink('');
    setFormPlates('');
    setFormImageUrl('');
    setFormImageFile(null);
    setFormImagePreview('');
    setFormReferenceId('');
    setFormMockupId('');
    setFormExtraIds([]);
    setEditingId(null);
    setIsAdding(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFormImageFile(file);
      setFormImagePreview(URL.createObjectURL(file));
      setFormImageUrl('');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    if (!formName.trim() || !formLink.trim()) return;

    setSyncStatus('saving');

    try {
      let finalImageUrl = formImageUrl;
      let finalStoragePath = editingId ? builds.find(b => b.id === editingId)?.imageStoragePath : undefined;

      if (formImageFile) {
        const { url, path } = await uploadFileToStorage(user.uid, 'printing', formImageFile);
        finalImageUrl = url;
        finalStoragePath = path;
      }

      const buildData: any = {
        name: formName.trim(),
        link: formLink.trim(),
        plates: parseInt(formPlates) || 1,
        imageUrl: finalImageUrl || '',
        referenceId: formReferenceId || null,
        mockupId: formMockupId || null,
        extraIds: formExtraIds || [],
        updatedAt: serverTimestamp()
      };

      if (finalStoragePath) {
        buildData.imageStoragePath = finalStoragePath;
      }

      if (editingId) {
        await updateDoc(doc(db, `users/${user.uid}/printing`, editingId), buildData);
      } else {
        await addDoc(collection(db, `users/${user.uid}/printing`), {
          ...buildData,
          createdAt: serverTimestamp()
        });
      }
      
      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 2000);
      resetForm();
    } catch (error) {
      console.error('Error saving build:', error);
      setSyncStatus('error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    try {
      const build = builds.find(b => b.id === id);
      if (build?.imageStoragePath) {
        await deleteFileFromStorage(build.imageStoragePath);
      }
      await deleteDoc(doc(db, `users/${user.uid}/printing`, id));
      if (selectedBuild?.id === id) {
        setSelectedBuild(null);
      }
    } catch (error) {
      console.error('Error deleting build:', error);
    }
  };

  const openEdit = (build: PrintBuild) => {
    setFormName(build.name);
    setFormLink(build.link);
    setFormPlates(build.plates?.toString() || '1');
    setFormImageUrl(build.imageUrl);
    setFormReferenceId(build.referenceId || '');
    setFormMockupId(build.mockupId || '');
    setFormExtraIds(build.extraIds || []);
    setEditingId(build.id);
    setIsAdding(true);
    setSelectedBuild(null);
  };

  const filteredBuilds = builds.filter(b => 
    (b.name || '').toLowerCase().includes((searchQuery || '').toLowerCase())
  );

  return (
    <main className="flex-1 md:overflow-y-auto px-margin-mobile md:px-margin-desktop py-8 md:py-12 pb-safe-nav w-full relative">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h2 className="text-[32px] md:text-[40px] leading-[1.2] font-bold font-headline-lg-mobile md:font-headline-lg text-[#111111] mb-2">Printing Catalog</h2>
          <p className="text-[16px] md:text-[18px] leading-[1.6] font-normal font-body-lg text-[#666666]">Keep track of models to print.</p>
        </div>
        
        <button 
          onClick={() => setIsAdding(true)}
          className="w-full md:w-auto px-6 py-3.5 md:py-3 bg-primary text-on-primary rounded-full font-bold shadow-md hover:shadow-lg hover:bg-primary/90 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          <span>New Build</span>
        </button>
      </div>

      <div className="bg-surface-container-low rounded-[2rem] p-4 md:p-8 border border-outline-variant/30 shadow-[0_4px_12px_rgba(125,97,144,0.03)] min-h-[500px]">
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#666666]" />
            <input
              type="text"
              placeholder="Search catalog..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border border-outline-variant/40 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-[#111111] font-medium"
            />
          </div>
        </div>

        {builds.length === 0 && !isAdding && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-24 h-24 bg-primary-container rounded-full flex items-center justify-center mb-6">
              <Printer className="w-10 h-10 text-on-primary-container" />
            </div>
            <h3 className="text-2xl font-bold text-[#111111] mb-2 font-headline-sm">No builds yet</h3>
            <p className="text-[#666666] text-lg max-w-md font-body-lg">Add a build you want to print!</p>
          </div>
        )}

        <div className="columns-2 md:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6 gap-4">
          {filteredBuilds.map((build) => (
            <div 
              key={build.id}
              onClick={() => setSelectedBuild(build)}
              className="break-inside-avoid mb-4 bg-surface-container-lowest rounded-2xl overflow-hidden shadow-sm border border-outline-variant/20 hover:shadow-md transition-all cursor-pointer group hover:-translate-y-1"
            >
              <div className="relative">
                {build.referenceId || build.mockupId || build.imageUrl || build.imageStoragePath ? (
                  <SmartImage 
                    src={build.imageUrl} 
                    storagePath={build.imageStoragePath}
                    driveFileId={build.referenceId || build.mockupId}
                    alt={build.name}
                    className="w-full aspect-square object-cover"
                  />
                ) : (
                  <div className="w-full aspect-square bg-surface-variant flex items-center justify-center">
                    <ImageIcon className="w-10 h-10 text-on-surface-variant/50" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300" />
              </div>
              <div className="p-4">
                <h3 className="font-bold text-[#111111] text-lg leading-tight mb-2 font-headline-sm">{build.name}</h3>
                <div className="flex items-center gap-2 text-[#666666] text-sm font-label-md bg-surface-variant/50 w-fit px-2.5 py-1 rounded-lg">
                  <Layers className="w-3.5 h-3.5" />
                  <span>{build.plates || 1} Plates</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {isAdding && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-container-lowest rounded-[2rem] w-full max-w-md shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-6 border-b border-outline-variant/20">
              <h2 className="text-2xl font-bold text-[#111111] font-headline-sm">
                {editingId ? 'Edit Build' : 'New Build'}
              </h2>
              <button 
                onClick={resetForm}
                className="p-2 text-[#666666] hover:bg-surface-variant rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 flex-1">
              <form id="build-form" onSubmit={handleSave} className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-[#444444] mb-2 font-label-lg">Print Name *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="e.g. Articulated Dragon"
                    className="w-full bg-white border border-outline-variant/40 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-[#111111] font-medium placeholder:text-[#999999]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-[#444444] mb-2 font-label-lg flex justify-between">
                    <span>Makerworld Link *</span>
                    {isFetchingImage && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                  </label>
                  <div className="relative">
                    <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#666666]" />
                    <input
                      type="url"
                      required
                      value={formLink}
                      onChange={handleLinkChange}
                      placeholder="https://makerworld.com/en/models/..."
                      className="w-full pl-12 pr-4 py-3 bg-white border border-outline-variant/40 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-[#111111] font-medium placeholder:text-[#999999]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-[#444444] mb-2 font-label-lg">How Many Plates?</label>
                  <div className="relative">
                    <Layers className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#666666]" />
                    <input
                      type="number"
                      min="1"
                      required
                      value={formPlates}
                      onChange={e => setFormPlates(e.target.value)}
                      placeholder="e.g. 2"
                      className="w-full pl-12 pr-4 py-3 bg-white border border-outline-variant/40 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-[#111111] font-medium placeholder:text-[#999999]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-[#444444] mb-2 font-label-lg">Preview Image</label>
                  
  <div className="mb-4">
    <input
      type="url"
      value={formImageUrl}
      onChange={e => setFormImageUrl(e.target.value)}
      placeholder="Or paste an image URL here..."
      className="w-full bg-white border border-outline-variant/40 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-[#111111] font-medium placeholder:text-[#999999] mb-4"
    />
  </div>
  <div className="relative rounded-2xl overflow-hidden border border-outline-variant/30 min-h-[150px] bg-surface-variant flex items-center justify-center mb-6">
  
                    {formImageUrl ? (
                      <img referrerPolicy="no-referrer" src={formImageUrl} alt="Preview" className="w-full object-cover max-h-48" />
                    ) : (
                      <div className="text-[#666666] flex flex-col items-center">
                        <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                        <span className="text-sm font-medium">Image will load from Makerworld</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-outline-variant/30 pt-6">
                  <h3 className="font-bold text-[#444444] mb-4 flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-primary" /> Google Drive Photos
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-[#666666] mb-1">Reference Photo</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => showPicker((images) => {
                            if (images.length > 0) setFormReferenceId(images[0].fileId);
                          }, false, driveFolders?.referencesFolderId)}
                          className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-xl font-medium hover:bg-indigo-200 transition-colors flex items-center gap-2"
                        >
                          <FolderOpen className="w-4 h-4" /> Choose from Google Drive
                        </button>
                        {formReferenceId && (
                          <div className="flex-1 flex items-center justify-between bg-green-50 px-3 py-2 rounded-xl border border-green-200">
                            <span className="text-sm text-green-700 font-medium">Selected</span>
                            <button type="button" onClick={() => setFormReferenceId('')} className="text-red-500 hover:text-red-700 p-1"><X className="w-4 h-4" /></button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[#666666] mb-1">3D Mock-up</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => showPicker((images) => {
                            if (images.length > 0) setFormMockupId(images[0].fileId);
                          }, false, driveFolders?.mockupsFolderId)}
                          className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-xl font-medium hover:bg-indigo-200 transition-colors flex items-center gap-2"
                        >
                          <FolderOpen className="w-4 h-4" /> Choose from Google Drive
                        </button>
                        {formMockupId && (
                          <div className="flex-1 flex items-center justify-between bg-green-50 px-3 py-2 rounded-xl border border-green-200">
                            <span className="text-sm text-green-700 font-medium">Selected</span>
                            <button type="button" onClick={() => setFormMockupId('')} className="text-red-500 hover:text-red-700 p-1"><X className="w-4 h-4" /></button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-[#666666] mb-1">Extras ({formExtraIds.length})</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => showPicker((images) => {
                            if (images.length > 0) setFormExtraIds([...formExtraIds, ...images.map(img => img.fileId)]);
                          }, true, driveFolders?.extrasFolderId)}
                          className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-xl font-medium hover:bg-indigo-200 transition-colors flex items-center gap-2"
                        >
                          <FolderOpen className="w-4 h-4" /> Choose from Google Drive
                        </button>
                        {formExtraIds.length > 0 && (
                          <div className="flex-1 flex items-center justify-between bg-green-50 px-3 py-2 rounded-xl border border-green-200">
                            <span className="text-sm text-green-700 font-medium">{formExtraIds.length} files selected</span>
                            <button type="button" onClick={() => setFormExtraIds([])} className="text-red-500 hover:text-red-700 p-1"><X className="w-4 h-4" /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

              </form>
            </div>
            
            <div className="p-6 border-t border-outline-variant/20 bg-surface/50">
              <button 
                type="submit"
                form="build-form"
                disabled={!formName.trim() || !formLink.trim()}
                className="w-full py-4 bg-primary text-on-primary rounded-xl font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                {editingId ? (user?.isAnonymous ? 'Test Save' : 'Save Changes') : 'Add Build'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedBuild && !isAdding && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelectedBuild(null)}>
          <div 
            className="bg-surface-container-lowest rounded-[2rem] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="md:w-1/2 bg-surface-variant flex items-center justify-center">
              {selectedBuild.referenceId || selectedBuild.mockupId || selectedBuild.imageUrl || selectedBuild.imageStoragePath ? (
                <SmartImage 
                  src={selectedBuild.imageUrl} 
                  storagePath={selectedBuild.imageStoragePath}
                  driveFileId={selectedBuild.referenceId || selectedBuild.mockupId}
                  isThumbnail={false}
                  alt={selectedBuild.name}
                  className="w-full h-full object-contain max-h-[50vh] md:max-h-none bg-black/5"
                />
              ) : (
                <ImageIcon className="w-20 h-20 text-on-surface-variant/30" />
              )}
            </div>
            <div className="md:w-1/2 p-8 flex flex-col relative">
              <button 
                onClick={() => setSelectedBuild(null)}
                className="absolute top-4 right-4 p-2 text-[#666666] hover:bg-surface-variant rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              
              <div className="mt-4 mb-6 flex-1 overflow-y-auto pr-2">
                <h2 className="text-3xl font-bold text-[#111111] mb-4 font-headline-md">{selectedBuild.name}</h2>
                <div className="flex items-center gap-3 text-[#444444] font-medium bg-primary-container/30 w-fit px-4 py-2 rounded-xl text-lg mb-4">
                  <Layers className="w-5 h-5 text-primary" />
                  <span>{selectedBuild.plates || 1} Plates</span>
                </div>
                {selectedBuild.link && (
                  <a href={selectedBuild.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-primary hover:underline font-bold mb-6">
                    <ExternalLink className="w-4 h-4" />
                    Open Makerworld
                  </a>
                )}
                
                {(selectedBuild.referenceId || selectedBuild.mockupId || (selectedBuild.extraIds && selectedBuild.extraIds.length > 0)) && (
                  <div className="bg-surface-variant/30 p-4 rounded-xl space-y-3 mt-4">
                    <h3 className="font-bold text-sm text-[#444444] flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-primary" /> Connected Drive Photos
                    </h3>
                    
                    {selectedBuild.referenceId && (
                      <div className="flex items-center justify-between text-sm bg-white p-2.5 rounded-lg border border-outline-variant/30">
                        <span className="font-medium">Reference Photo</span>
                        <button onClick={() => downloadDriveFile(selectedBuild.referenceId!, 'Reference.jpg')} className="text-primary hover:bg-primary/10 p-1.5 rounded-lg flex items-center gap-1">
                          <Download className="w-4 h-4" /> <span className="hidden sm:inline">Download</span>
                        </button>
                      </div>
                    )}
                    
                    {selectedBuild.mockupId && (
                      <div className="flex items-center justify-between text-sm bg-white p-2.5 rounded-lg border border-outline-variant/30">
                        <span className="font-medium">3D Mock-up</span>
                        <button onClick={() => downloadDriveFile(selectedBuild.mockupId!, 'Mockup.jpg')} className="text-primary hover:bg-primary/10 p-1.5 rounded-lg flex items-center gap-1">
                          <Download className="w-4 h-4" /> <span className="hidden sm:inline">Download</span>
                        </button>
                      </div>
                    )}
                    
                    {selectedBuild.extraIds && selectedBuild.extraIds.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <span className="font-medium text-sm text-[#666666]">Extras ({selectedBuild.extraIds.length})</span>
                        {selectedBuild.extraIds.map((extraId, idx) => (
                          <div key={extraId} className="flex items-center justify-between text-sm bg-white p-2.5 rounded-lg border border-outline-variant/30">
                            <span className="text-on-surface-variant truncate mr-2">Extra Photo {idx + 1}</span>
                            <button onClick={() => downloadDriveFile(extraId, `Extra_${idx + 1}.jpg`)} className="text-primary hover:bg-primary/10 p-1.5 rounded-lg flex items-center gap-1 shrink-0">
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              <div className="mt-4 pt-4 border-t border-outline-variant/20 flex gap-3 shrink-0">
                <button
                  onClick={() => openEdit(selectedBuild)}
                  className="flex-1 flex items-center justify-center gap-2 bg-surface-variant text-[#222222] py-3.5 rounded-full font-bold hover:bg-surface-variant/80 transition-colors"
                >
                  <Edit2 className="w-5 h-5" />
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(selectedBuild.id)}
                  className="flex-1 flex items-center justify-center gap-2 bg-error/10 text-error py-3.5 rounded-full font-bold hover:bg-error/20 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
