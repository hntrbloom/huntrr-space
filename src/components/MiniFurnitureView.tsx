import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Copy, Box, Search, CheckCircle2, Armchair, ChevronDown, Clock, Tag, Ruler, X, Image as ImageIcon, LayoutGrid, List, Filter, Edit3, Trash2, Maximize2, Settings, Download, Loader2 } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { ImageUploaderArea } from './ui/ImageUploaderArea';
import { SetGalleryModal } from './SetGalleryModal';
import { useAuth } from '../lib/AuthContext';
import { db, safeGetDoc } from '../lib/firebase';
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { uploadFileToStorage, uploadDataUrlToStorage, deleteFileFromStorage } from '../lib/storage';
import { SmartImage } from './SmartImage';
import { ImageViewerModal, ImageToView } from './ImageViewerModal';
import { downloadImagesZip } from '../lib/downloadUtils';
import { v4 as uuidv4 } from 'uuid';
import { GUEST_SAMPLE_PRINT_DESIGNS, GUEST_SAMPLE_PRINT_CATEGORIES, GUEST_SAMPLE_PRINT_SETS } from '../lib/guestSampleData';
import { sanitizeFirestorePayload, findUndefinedPaths } from '../lib/firestoreUtils';

export interface MiniFurniturePart {
  id: string;
  name: string;
}

export interface MiniFurnitureImage {
  id: string;
  url: string;
  storagePath?: string;
  type: string;
  label?: string;
}

export interface PrintSet {
  id: string;
  name: string;
  coverImageUrl?: string;
  fullPrintTime?: string;
}

export function isMiniCharmItem(item: Partial<MiniFurniture> | undefined | null): boolean {
  if (!item) return false;
  const mf = (item.madeFor || '').toLowerCase().trim();
  const cat = (item.category || '').toLowerCase().trim();
  const type = ((item as any).type || '').toLowerCase().trim();
  return mf === 'mini charm' || mf === 'minicharm' || cat === 'mini charm' || cat === 'minicharm' || type === 'minicharm' || type === 'mini charm';
}

export function getUniqueImages(images: MiniFurnitureImage[] | undefined | null): MiniFurnitureImage[] {
  if (!images || !Array.isArray(images)) return [];
  const seen = new Set<string>();
  const unique: MiniFurnitureImage[] = [];
  for (const img of images) {
    if (!img || !img.url) continue;
    const key = (img.storagePath || img.url).trim().toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(img);
    }
  }
  return unique;
}

export function parsePrintTimeToMinutes(timeStr: string | undefined): number {
  if (!timeStr) return 0;
  const str = timeStr.trim().toLowerCase();
  if (!str) return 0;

  let totalMins = 0;

  if (/^\d{1,2}:\d{2}$/.test(str)) {
    const [h, m] = str.split(':').map(Number);
    return (h * 60) + m;
  }

  const hourMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)/);
  if (hourMatch) {
    totalMins += parseFloat(hourMatch[1]) * 60;
  }

  const minMatch = str.match(/(\d+)\s*(?:m|min|mins|minute|minutes)/);
  if (minMatch) {
    totalMins += parseInt(minMatch[1], 10);
  }

  if (!hourMatch && !minMatch && /^\d+$/.test(str)) {
    totalMins = parseInt(str, 10);
  }

  return totalMins;
}

export function formatMinutesToPrintTime(totalMins: number): string {
  if (!totalMins || totalMins <= 0) return '';
  const hours = Math.floor(totalMins / 60);
  const mins = Math.round(totalMins % 60);
  if (hours > 0 && mins > 0) {
    return `${hours}h ${mins}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${mins}m`;
}

export function getGroupedPrintTime(itemsInSet: MiniFurniture[], customFullPrintTime?: string): { displayTime: string; calculatedTime: string; isCustom: boolean } {
  let totalMins = 0;
  itemsInSet.forEach(item => {
    totalMins += parsePrintTimeToMinutes(item.printTime);
  });
  const calculatedTime = formatMinutesToPrintTime(totalMins);

  if (customFullPrintTime && customFullPrintTime.trim()) {
    return {
      displayTime: customFullPrintTime.trim(),
      calculatedTime,
      isCustom: true
    };
  }

  return {
    displayTime: calculatedTime || '0m',
    calculatedTime,
    isCustom: false
  };
}

export interface MiniFurniture {
  id: string;
  name: string;
  category: string;
  description: string;
  status: string;
  quantity: number;
  color: string;
  material: string;
  
  width: string;
  depth: string;
  height: string;
  unit: 'mm' | 'cm';
  scale: string;
  
  is3DPrinted: boolean;
  printer: string;
  fileName: string;
  printTime: string;
  filamentUsed: string;
  filamentColor: string;
  parts: MiniFurniturePart[];
  
  dateStarted: string;
  dateCompleted: string;
  dateAdded: string;
  notes: string;
  setName: string;
  setId?: string;
  madeFor: string;

  images: MiniFurnitureImage[];
  createdAt?: string;
}

export function normalizePrintRecord(rawDoc: any): MiniFurniture {
  if (!rawDoc || typeof rawDoc !== 'object') {
    return {
      id: uuidv4(),
      name: 'Untitled Print',
      category: 'Other',
      description: '',
      status: '3D Mock-Up',
      quantity: 1,
      color: '',
      material: '',
      width: '',
      depth: '',
      height: '',
      unit: 'mm',
      scale: '',
      is3DPrinted: true,
      printer: '',
      fileName: '',
      printTime: '',
      filamentUsed: '',
      filamentColor: '',
      parts: [],
      dateStarted: '',
      dateCompleted: '',
      dateAdded: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      notes: '',
      setName: '',
      setId: '',
      madeFor: 'Whole Family',
      images: []
    };
  }

  const id = rawDoc.id || uuidv4();
  const name = rawDoc.name || rawDoc.title || 'Untitled Print';
  const category = rawDoc.category || 'Other';
  const description = rawDoc.description || '';
  const status = rawDoc.status || '3D Mock-Up';
  const quantity = typeof rawDoc.quantity === 'number' ? rawDoc.quantity : (parseInt(rawDoc.quantity, 10) || 1);
  const color = rawDoc.color || '';
  const material = rawDoc.material || '';
  const width = rawDoc.width || '';
  const depth = rawDoc.depth || '';
  const height = rawDoc.height || '';
  const unit = rawDoc.unit || 'mm';
  const scale = rawDoc.scale || '';
  const is3DPrinted = rawDoc.is3DPrinted ?? true;
  const printer = rawDoc.printer || '';
  const fileName = rawDoc.fileName || '';
  const printTime = rawDoc.printTime || '';
  const filamentUsed = rawDoc.filamentUsed || '';
  const filamentColor = rawDoc.filamentColor || '';
  const parts = Array.isArray(rawDoc.parts) ? rawDoc.parts : [];
  const dateStarted = rawDoc.dateStarted || '';
  const dateCompleted = rawDoc.dateCompleted || '';
  const dateAdded = rawDoc.dateAdded || new Date().toISOString();
  const notes = rawDoc.notes || '';
  const setName = rawDoc.setName || '';
  const setId = rawDoc.setId || '';
  const madeFor = rawDoc.madeFor || 'Whole Family';

  const extractedImages: MiniFurnitureImage[] = [];

  const addImage = (
    urlOrObj: any, 
    fallbackType: 'inspiration' | 'design' | 'finished', 
    fallbackLabel?: string
  ) => {
    if (!urlOrObj) return;

    let url = '';
    let storagePath: string | undefined = undefined;
    let type: 'inspiration' | 'design' | 'finished' = fallbackType;
    let label = fallbackLabel;
    let imgId = uuidv4();

    if (typeof urlOrObj === 'string') {
      url = urlOrObj.trim();
    } else if (typeof urlOrObj === 'object') {
      url = (urlOrObj.url || urlOrObj.src || urlOrObj.downloadUrl || urlOrObj.path || '').trim();
      storagePath = urlOrObj.storagePath || urlOrObj.path || undefined;
      if (urlOrObj.type) {
        const rawType = String(urlOrObj.type).toLowerCase();
        if (rawType.includes('ref') || rawType.includes('insp') || rawType.includes('reference')) {
          type = 'inspiration';
        } else if (rawType.includes('mock') || rawType.includes('design') || rawType.includes('3d')) {
          type = 'design';
        } else if (rawType.includes('finish') || rawType.includes('proto') || rawType.includes('charm')) {
          type = 'finished';
        } else if (rawType === 'inspiration' || rawType === 'design' || rawType === 'finished') {
          type = rawType as any;
        }
      }
      if (urlOrObj.label) label = urlOrObj.label;
      if (urlOrObj.id) imgId = urlOrObj.id;
    }

    if (!url && storagePath) {
      url = storagePath;
    }

    if (!url) return;

    // Check duplicate
    const newKey = (storagePath || url).toLowerCase().trim();
    const isDuplicate = extractedImages.some(existing => {
      const existingKey = (existing.storagePath || existing.url).toLowerCase().trim();
      return existingKey === newKey;
    });

    if (!isDuplicate) {
      const cleanImg: MiniFurnitureImage = {
        id: imgId,
        url,
        type
      };
      if (storagePath && storagePath !== url) cleanImg.storagePath = storagePath;
      if (label) cleanImg.label = label;
      extractedImages.push(cleanImg);
    }
  };

  // 1. Process explicit images array
  if (Array.isArray(rawDoc.images)) {
    rawDoc.images.forEach((img: any, idx: number) => {
      let defaultType: 'inspiration' | 'design' | 'finished' = idx === 0 ? 'inspiration' : 'design';
      if (typeof img === 'object' && img?.type) {
        const rawType = String(img.type).toLowerCase();
        if (rawType.includes('ref') || rawType.includes('insp') || rawType.includes('reference')) {
          defaultType = 'inspiration';
        } else if (rawType.includes('mock') || rawType.includes('design') || rawType.includes('3d')) {
          defaultType = 'design';
        } else if (rawType.includes('finish') || rawType.includes('proto') || rawType.includes('charm')) {
          defaultType = 'finished';
        }
      }
      addImage(img, defaultType);
    });
  }

  // 2. Process legacy reference photo fields
  const refPhoto = rawDoc.referencePhoto || rawDoc.referenceImage || rawDoc.referencePhotoUrl || rawDoc.reference_photo;
  if (refPhoto) {
    addImage(refPhoto, 'inspiration', 'Reference Photo');
  }

  // 3. Process legacy mockup photo fields
  const mockPhoto = rawDoc.mockupPhoto || rawDoc.mockupImage || rawDoc.mockupPhotoUrl || rawDoc.mockup_photo || rawDoc.designPhoto || rawDoc.designImage;
  if (mockPhoto) {
    addImage(mockPhoto, 'design', '3D Mock-Up');
  }

  // 4. Process legacy finished photo fields
  const finPhoto = rawDoc.finishedPhoto || rawDoc.prototypePhoto || rawDoc.finishedImage;
  if (finPhoto) {
    addImage(finPhoto, 'finished', 'Finished Print');
  }

  // 5. Process legacy photos array
  if (Array.isArray(rawDoc.photos)) {
    rawDoc.photos.forEach((ph: any, idx: number) => {
      const phType: 'inspiration' | 'design' | 'finished' = idx === 0 ? 'inspiration' : 'design';
      addImage(ph, phType);
    });
  }

  // 6. Fallback cover / single photo fields
  if (extractedImages.length === 0) {
    const singleCover = rawDoc.coverImageUrl || rawDoc.imageUrl || rawDoc.photo || rawDoc.photoUrl;
    if (singleCover) {
      addImage(singleCover, 'inspiration');
    }
  }

  return {
    id,
    name,
    category,
    description,
    status,
    quantity,
    color,
    material,
    width,
    depth,
    height,
    unit,
    scale,
    is3DPrinted,
    printer,
    fileName,
    printTime,
    filamentUsed,
    filamentColor,
    parts,
    dateStarted,
    dateCompleted,
    dateAdded,
    notes,
    setName,
    setId,
    madeFor,
    images: extractedImages
  };
}

const DEFAULT_CATEGORIES = [
  'Bedroom', 'Living Room', 'Kitchen', 'Dining Room', 'Bathroom', 
  'Nursery', 'Outdoor', 'Store / Shop', 'School', 'Decorations', 
  'Accessories', 'Other'
];

const STATUSES = ['Reference Photo', '3D Mock-Up', '3MF/STL File', 'Ready to Print', 'Printing', 'Completed'];
const MADE_FOR_OPTIONS = ['Adult Critter', 'Child Critter', 'Baby Critter', 'Twin Babies', 'Whole Family', 'House', 'Custom'];

async function fetchImageBlob(url: string): Promise<Blob> {
  if (url.startsWith('data:')) {
    const res = await fetch(url);
    return await res.blob();
  }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
    return await res.blob();
  } catch (e) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        let mimeType = 'image/png';
        if (url.toLowerCase().includes('.jpg') || url.toLowerCase().includes('.jpeg')) {
          mimeType = 'image/jpeg';
        } else if (url.toLowerCase().includes('.webp')) {
          mimeType = 'image/webp';
        }
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Canvas toBlob failed'));
        }, mimeType, 1.0);
      };
      img.onerror = () => reject(new Error('Failed to load image for export'));
      img.src = url;
    });
  }
}

export const MiniFurnitureView = () => {
  const { user } = useAuth();
  
  const [items, setItems] = useState<MiniFurniture[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [printSets, setPrintSets] = useState<PrintSet[]>([]);
  const [groupMode, setGroupMode] = useState<string>('all');
  const [viewingSet, setViewingSet] = useState<PrintSet | null>(null);
  const [isSetManagerOpen, setIsSetManagerOpen] = useState(false);
  const [exportingSetKey, setExportingSetKey] = useState<{url: string, storagePath?: string} | null>(null);

  const handleExportGroupMockups = async (groupKey: string, groupName: string, mockups: { url: string; printName: string; id: string }[]) => {
    if (!mockups || mockups.length === 0) return;
    
    setExportingSetKey(groupKey);
    try {
      if (mockups.length === 1) {
        const mockup = mockups[0];
        const blob = await fetchImageBlob(mockup.url);
        let ext = 'png';
        if (blob.type) {
          const mimeExt = blob.type.split('/')[1]?.split('+')[0];
          if (mimeExt) ext = mimeExt === 'jpeg' ? 'jpg' : mimeExt;
        }
        const cleanPrintName = mockup.printName.trim().replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-');
        const fileName = `${cleanPrintName || 'mockup'}-3D-mockup.${ext}`;
        saveAs(blob, fileName);
      } else {
        const zip = new JSZip();
        const printNameCounts: Record<string, number> = {};
        
        for (const mockup of mockups) {
          try {
            const blob = await fetchImageBlob(mockup.url);
            let ext = 'png';
            if (blob.type) {
              const mimeExt = blob.type.split('/')[1]?.split('+')[0];
              if (mimeExt) ext = mimeExt === 'jpeg' ? 'jpg' : mimeExt;
            }
            
            const cleanName = mockup.printName.trim().replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-') || 'mockup';
            printNameCounts[cleanName] = (printNameCounts[cleanName] || 0) + 1;
            const count = printNameCounts[cleanName];
            const fileName = count > 1 ? `${cleanName}-mockup-${count}.${ext}` : `${cleanName}-mockup.${ext}`;
            
            zip.file(fileName, blob);
          } catch (err) {
            console.error(`Failed to load mockup for ${mockup.printName}:`, err);
          }
        }
        
        const cleanGroupName = groupName.trim().replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-') || 'Group';
        const zipName = `${cleanGroupName}-mockups.zip`;
        
        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, zipName);
      }
    } catch (error) {
      console.error('Error exporting mockups:', error);
      alert('Failed to export mockups. Please try again.');
    } finally {
      setExportingSetKey(null);
    }
  };
  
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterCompletion, setFilterCompletion] = useState<'All' | 'Completed' | 'Not Completed'>('All');
  const [sortBy, setSortBy] = useState<'Newest' | 'Oldest' | 'Name' | 'Category'>('Newest');
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MiniFurniture | null>(null);
  
  const [viewingImage, setViewingImage] = useState<{url: string, storagePath?: string, title?: string, allImages?: ImageToView[], zipTitle?: string} | null>(null);
  const [isDownloadingCategory, setIsDownloadingCategory] = useState(false);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  
  useEffect(() => {
    if (!user) return;
    
    if (user.isAnonymous) {
      setCategories(GUEST_SAMPLE_PRINT_CATEGORIES.map(c => c.name));
      setPrintSets(GUEST_SAMPLE_PRINT_SETS);
      setItems(GUEST_SAMPLE_PRINT_DESIGNS.map(p => ({
        id: p.id,
        name: p.title,
        category: p.category,
        description: p.notes,
        status: p.status === 'Printed' ? 'Completed' : '3MF/STL File',
        quantity: 1,
        color: 'Pastel Pink',
        material: 'PLA',
        width: '45', depth: '45', height: '60', unit: 'mm', scale: '1:12',
        is3DPrinted: true,
        printer: 'Bambu Lab X1C',
        fileName: `${p.title.replace(/\s+/g, '_')}.3mf`,
        printTime: p.printTime,
        filamentUsed: p.filamentType,
        filamentColor: 'Pastel Pink',
        parts: [{ id: 'part-1', name: 'Main Frame' }],
        dateStarted: new Date().toISOString().split('T')[0],
        dateCompleted: p.status === 'Printed' ? new Date().toISOString().split('T')[0] : '',
        dateAdded: new Date().toISOString(),
        notes: p.notes,
        setName: p.setName,
        setId: p.setId,
        madeFor: 'Whole Family',
        images: p.photos.map((ph, idx) => ({ id: `img-${idx}`, url: ph, type: idx === 0 ? 'design' : 'finished' }))
      })));
      setLoading(false);
      return;
    }

    // Load categories
    const catDocRef = doc(db, `users/${user.uid}/preferences`, 'miniFurnitureCategories');
    safeGetDoc(catDocRef).then((snap) => {
      if (snap.exists() && snap.data().categories) {
        setCategories(snap.data().categories);
      }
    });

    // Load print sets
    const setsDocRef = doc(db, `users/${user.uid}/preferences`, 'miniFurnitureSets');
    safeGetDoc(setsDocRef).then((snap) => {
      if (snap.exists() && snap.data().sets) {
        setPrintSets(snap.data().sets);
      }
    });

    // Load print designs safely with clean, separate snapshot listeners
    let printsDocs: any[] = [];
    let miniDocs: any[] = [];

    const updateCombinedItems = () => {
      const loadedMap = new Map<string, MiniFurniture>();
      printsDocs.forEach(d => {
        const record = normalizePrintRecord({ id: d.id, ...d.data() });
        loadedMap.set(d.id, record);
      });
      miniDocs.forEach(d => {
        const record = normalizePrintRecord({ id: d.id, ...d.data() });
        loadedMap.set(d.id, record);
      });
      const loaded = Array.from(loadedMap.values());
      setItems(loaded);
      setLoading(false);

      // Pre-fetch images to ensure fast rendering
      const pathsToPrefetch: string[] = [];
      const sorted = [...loaded].sort((a, b) => new Date(b.createdAt || b.dateAdded || 0).getTime() - new Date(a.createdAt || a.dateAdded || 0).getTime());
      
      for (const item of sorted) {
        if (pathsToPrefetch.length >= 50) break;
        if (item.images) {
           item.images.forEach(img => {
             if (img.storagePath) pathsToPrefetch.push(img.storagePath);
           });
        }
      }
      if (pathsToPrefetch.length > 0) {
        import('../hooks/useImageCache').then(({ prefetchImages }) => prefetchImages(pathsToPrefetch));
      }
    };

    const unsubPrints = onSnapshot(collection(db, `users/${user.uid}/prints`), (snapPrints) => {
      printsDocs = snapPrints.docs;
      updateCombinedItems();
    });

    const unsubMini = onSnapshot(collection(db, `users/${user.uid}/miniFurniture`), (snapMini) => {
      miniDocs = snapMini.docs;
      updateCombinedItems();
    });

    return () => {
      unsubPrints();
      unsubMini();
    };
  }, [user]);

  // Safe migration effect
  useEffect(() => {
    if (!user || loading || items.length === 0) return;
    
    let setsModified = false;
    let itemsModified = false;
    const newSets = [...printSets];
    const itemUpdates: MiniFurniture[] = [];

    items.forEach(item => {
      if (item.setName && item.setName.trim() && !item.setId) {
         const typedName = item.setName.trim();
         let existingSet = newSets.find(s => s.name.toLowerCase() === typedName.toLowerCase());
         if (!existingSet) {
           existingSet = { id: uuidv4(), name: typedName };
           newSets.push(existingSet);
           setsModified = true;
         }
         itemUpdates.push({ ...item, setId: existingSet.id, setName: existingSet.name });
         itemsModified = true;
      }
    });

    if (setsModified) {
       setDoc(doc(db, `users/${user.uid}/preferences`, 'miniFurnitureSets'), sanitizeFirestorePayload({
         sets: newSets
       }), { merge: true });
       setPrintSets(newSets);
    }
    
    if (itemsModified) {
       itemUpdates.forEach(updatedItem => {
         setDoc(doc(db, `users/${user.uid}/miniFurniture`, updatedItem.id), sanitizeFirestorePayload(updatedItem), { merge: true });
       });
    }

  }, [user, loading, items, printSets]);

  const savePrintSets = async (newSets: PrintSet[]) => {
    if (!user) return;
    setPrintSets(newSets);
    await setDoc(doc(db, `users/${user.uid}/preferences`, 'miniFurnitureSets'), sanitizeFirestorePayload({
      sets: newSets
    }), { merge: true });
  };

  const saveCategories = async (newCategories: string[]) => {
    if (!user) return;
    setCategories(newCategories);
    await setDoc(doc(db, `users/${user.uid}/preferences`, 'miniFurnitureCategories'), sanitizeFirestorePayload({
      categories: newCategories
    }), { merge: true });
  };

  const handleSaveItem = async (item: MiniFurniture) => {
    if (!user) throw new Error("Not authenticated");
    
    let currentItem = { ...item };

    // Migrate any remaining base64 images to Storage before writing to Firestore
    if (currentItem.images && currentItem.images.length > 0) {
      const cleanImages: MiniFurnitureImage[] = [];
      for (const img of currentItem.images) {
        if (img.url && img.url.startsWith('data:image/')) {
          const path = `users/${user.uid}/prints/${currentItem.id}/${img.id || uuidv4()}.jpg`;
          const uploadRes = await uploadDataUrlToStorage(user.uid, path, img.url);
          const cleanImg: MiniFurnitureImage = {
            id: img.id || uuidv4(),
            url: uploadRes.url,
            type: img.type || 'design'
          };
          if (uploadRes.path) cleanImg.storagePath = uploadRes.path;
          if (img.label) cleanImg.label = img.label;
          cleanImages.push(cleanImg);
        } else {
          const cleanImg: MiniFurnitureImage = {
            id: img.id || uuidv4(),
            url: img.url,
            type: img.type || 'design'
          };
          if (img.storagePath) cleanImg.storagePath = img.storagePath;
          if (img.label) cleanImg.label = img.label;
          cleanImages.push(cleanImg);
        }
      }
      currentItem.images = cleanImages;
    }

    if (isMiniCharmItem(currentItem) && currentItem.images && currentItem.images.length > 0) {
      const uniqueImgs = getUniqueImages(currentItem.images);
      const finishedImg = uniqueImgs.find(img => img.type === 'finished');
      currentItem.images = finishedImg ? [finishedImg] : [uniqueImgs[0]];
    }

    if (currentItem.setName && currentItem.setName.trim()) {
       const typedName = currentItem.setName.trim();
       const existingSet = printSets.find(s => s.name.toLowerCase() === typedName.toLowerCase());
       if (existingSet) {
          currentItem.setId = existingSet.id;
          currentItem.setName = existingSet.name;
       } else {
          // Create new set
          const newSet = { id: uuidv4(), name: typedName };
          const newSets = [...printSets, newSet];
          setPrintSets(newSets);
          await setDoc(doc(db, `users/${user.uid}/preferences`, 'miniFurnitureSets'), sanitizeFirestorePayload({
            sets: newSets
          }), { merge: true });
          currentItem.setId = newSet.id;
          currentItem.setName = newSet.name;
       }
    } else {
       currentItem.setName = '';
       currentItem.setId = '';
    }

    // Diagnostics check for undefined fields
    const undefPaths = findUndefinedPaths(currentItem);
    if (undefPaths.length > 0) {
      console.warn(`[Firestore Diagnostics] Found undefined fields in payload before setDoc: ${undefPaths.join(', ')}`);
    }

    const cleanPayload = sanitizeFirestorePayload(currentItem);
    await setDoc(doc(db, `users/${user.uid}/miniFurniture`, currentItem.id), cleanPayload, { merge: true });
  };

  const handleDeleteItem = async (id: string) => {
    if (!user) return;
    if (confirm('Are you sure you want to delete this print design?')) {
      const itemToDelete = items.find(i => i.id === id);
      if (itemToDelete && itemToDelete.images && itemToDelete.images.length > 0) {
        for (const img of itemToDelete.images) {
          if (img.storagePath) {
            await deleteFileFromStorage(img.storagePath).catch(() => {});
          }
        }
      }
      await deleteDoc(doc(db, `users/${user.uid}/miniFurniture`, id));
    }
  };

  const [filterMaterial, setFilterMaterial] = useState('All');
  
  const extraCategories = useMemo(() => {
    const known = new Set(['all', 'sets', 'grouped sets', 'mini furniture', 'minifurniture', 'charms', 'charm', 'mini charms', 'mini charm', 'objects', 'object']);
    const extraList: string[] = [];
    
    categories.forEach(cat => {
      if (cat && !known.has(cat.toLowerCase()) && !DEFAULT_CATEGORIES.map(c => c.toLowerCase()).includes(cat.toLowerCase())) {
        if (!extraList.map(e => e.toLowerCase()).includes(cat.toLowerCase())) extraList.push(cat);
      }
    });

    items.forEach(i => {
      if (i.category && !known.has(i.category.toLowerCase()) && !DEFAULT_CATEGORIES.map(c => c.toLowerCase()).includes(i.category.toLowerCase())) {
        if (!extraList.map(e => e.toLowerCase()).includes(i.category.toLowerCase())) extraList.push(i.category);
      }
      if (i.madeFor && !known.has(i.madeFor.toLowerCase())) {
        if (!extraList.map(e => e.toLowerCase()).includes(i.madeFor.toLowerCase())) extraList.push(i.madeFor);
      }
    });

    return extraList;
  }, [categories, items]);

  const filterTabs = useMemo(() => {
    return [
      { id: 'all', label: 'All' },
      { id: 'sets', label: 'Sets' },
      { id: 'charms', label: 'Charms' },
      { id: 'objects', label: 'Objects' },
      { id: 'miniCharms', label: 'Mini Charms' },
      { id: 'miniFurniture', label: 'Mini Furniture' },
      ...extraCategories.map(cat => ({ id: cat.toLowerCase(), label: cat }))
    ];
  }, [extraCategories]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchSearch = (item.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) || 
                          (item.madeFor || 'Mini Furniture').toLowerCase().includes((searchTerm || '').toLowerCase());
      const matchType = filterType === 'All' || (item.madeFor || 'Mini Furniture') === filterType;
      const matchStatus = filterStatus === 'All' || item.status === filterStatus;
      const matchMat = filterMaterial === 'All' || (item.material && item.material.toLowerCase() === filterMaterial.toLowerCase());
      
      let matchComp = true;
      if (filterCompletion === 'Completed') matchComp = item.status === 'Completed';
      if (filterCompletion === 'Not Completed') matchComp = item.status !== 'Completed';
      
      let matchGroupMode = true;
      const mf = (item.madeFor || '').toLowerCase().trim();
      const cat = (item.category || '').toLowerCase().trim();

      if (groupMode === 'all') {
        matchGroupMode = true;
      } else if (groupMode === 'sets') {
        matchGroupMode = true;
      } else if (groupMode === 'charms') {
        matchGroupMode = mf === 'charm' || mf === 'charms' || cat === 'charm' || cat === 'charms';
      } else if (groupMode === 'objects') {
        matchGroupMode = mf === 'object' || mf === 'objects' || cat === 'object' || cat === 'objects';
      } else if (groupMode === 'miniCharms') {
        matchGroupMode = mf === 'mini charm' || mf === 'mini charms' || cat === 'mini charm' || cat === 'mini charms';
      } else if (groupMode === 'miniFurniture') {
        matchGroupMode = mf === 'mini furniture' || cat === 'mini furniture' || (cat && DEFAULT_CATEGORIES.map(c => c.toLowerCase()).includes(cat) && mf !== 'charm' && mf !== 'object' && mf !== 'mini charm');
      } else {
        const target = groupMode.toLowerCase();
        matchGroupMode = mf === target || cat === target;
      }
      
      return matchSearch && matchType && matchStatus && matchComp && matchMat && matchGroupMode;
    }).sort((a, b) => {
      if (sortBy === 'Name') return a.name.localeCompare(b.name);
      if (sortBy === 'Status') return a.status.localeCompare(b.status);
      if (sortBy === 'Print Time') return (a.printTime || '').localeCompare(b.printTime || '');
      if (sortBy === 'Oldest') return new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime();
      return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime(); // Newest
    });
  }, [items, searchTerm, filterType, filterStatus, filterCompletion, filterMaterial, sortBy, groupMode]);
  
  const uniqueMaterials = useMemo(() => {
    const mats = new Set<string>();
    items.forEach(i => { if (i.material) mats.add(i.material.toLowerCase().trim()); });
    return Array.from(mats).filter(Boolean);
  }, [items]);

  return (
    <div className="flex flex-col min-h-full md:h-full md:overflow-hidden bg-[#FFF0F4]">
      <div className="p-4 md:p-8 flex-1 pb-safe-nav md:overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-[32px] md:text-[40px] font-headline-md font-semibold text-[#111111] leading-tight tracking-tight flex items-center gap-3">
                <Box className="w-8 h-8 md:w-10 md:h-10 text-[#FF85A2]" />
                Prints
              </h1>
              <p className="text-[16px] text-[#666666] font-body-md mt-1">Plan and track your 3D print designs.</p>
            </div>
            
            <div className="flex items-center gap-3">
              
              <button 
                onClick={() => { setEditingItem(null); setIsFormOpen(true); }}
                className="px-4 py-1.5 bg-[#FF85A2] hover:bg-[#FF7396] text-white rounded-full text-sm font-medium transition-colors shadow-sm flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Add Print
              </button>
            </div>
          </div>

          <div className="bg-white rounded-[24px] p-4 shadow-sm border border-outline-variant/20 flex flex-col gap-4">
            <div className="flex flex-col md:flex-row gap-4 justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#999999]" />
                <input 
                  type="text"
                  placeholder="Search print designs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 bg-surface-variant/30 border border-outline-variant/30 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all text-on-surface"
                />
              </div>
              
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 w-full md:w-auto overflow-hidden">
                <button 
                  onClick={() => setShowFilters(!showFilters)}
                  className={`p-2.5 rounded-full border transition-colors shrink-0 ${showFilters ? 'bg-primary-container text-on-primary-container border-primary-container' : 'bg-white border-outline-variant/30 text-on-surface-variant hover:bg-surface-variant'}`}
                  aria-label="Toggle filters"
                >
                  <Filter className="w-5 h-5" />
                </button>
                <div className="flex bg-surface-variant/30 p-1 rounded-full border border-outline-variant/20 overflow-x-auto no-scrollbar flex-nowrap gap-1 items-center min-w-0 flex-1 shrink" style={{ WebkitOverflowScrolling: 'touch' }}>
                  {filterTabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setGroupMode(tab.id)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                        groupMode === tab.id
                          ? 'bg-white shadow-sm text-primary'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="flex bg-surface-variant/30 p-1 rounded-full border border-outline-variant/20 shrink-0">
                  <button 
                    onClick={() => setViewMode('grid')}
                    className={`p-2 rounded-full transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setViewMode('list')}
                    className={`p-2 rounded-full transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {showFilters && (
              <div className="flex flex-wrap gap-3 pt-4 border-t border-outline-variant/20">
                <select value={filterType} onChange={e => setFilterType(e.target.value)} className="bg-surface-variant/30 border border-outline-variant/30 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                  <option value="All">All Types</option>
                  <option value="Object">Object</option>
                  <option value="Charm">Charm</option>
                  <option value="Mini Charm">Mini Charm</option>
                </select>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-surface-variant/30 border border-outline-variant/30 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                  <option value="All">All Statuses</option>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={filterCompletion} onChange={e => setFilterCompletion(e.target.value as any)} className="bg-surface-variant/30 border border-outline-variant/30 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                  <option value="All">Completion: All</option>
                  <option value="Completed">Completed</option>
                  <option value="Not Completed">Not Completed</option>
                </select>
                <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="bg-surface-variant/30 border border-outline-variant/30 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 ml-auto">
                  <option value="Newest">Sort: Newest</option>
                  <option value="Oldest">Sort: Oldest</option>
                  <option value="Name">Sort: Name</option>
                  <option value="Type">Sort: Type</option>
                </select>
              </div>
            )}
          </div>

          {filteredItems.length === 0 ? (
            <div className="bg-white rounded-[24px] p-12 text-center border border-outline-variant/20 shadow-sm flex flex-col items-center justify-center">
              <Box className="w-12 h-12 text-outline-variant mb-4" />
              <h3 className="text-xl font-medium text-on-surface mb-2">No print design found</h3>
              <p className="text-on-surface-variant mb-6 max-w-md">Add your first piece of print design to start building your catalog.</p>
              <button 
                onClick={() => { setEditingItem(null); setIsFormOpen(true); }}
                className="px-4 py-2 bg-[#FF85A2] hover:bg-[#FF7396] text-white rounded-full text-sm font-medium transition-colors shadow-sm"
              >
                Add Print
              </button>
            </div>
          ) : (
            <>
              {(() => {
                const renderItem = (item: MiniFurniture) => {
                  const isMiniCharm = isMiniCharmItem(item);
                  const uniqueImages = getUniqueImages(item.images);

                  const inspirationImg = uniqueImages.find(img => img.type === 'inspiration');
                  const designImg = uniqueImages.find(img => img.type === 'design');
                  const finishedImg = uniqueImages.find(img => img.type === 'finished');
                  const mainImg = isMiniCharm ? (finishedImg || uniqueImages[0]) : (inspirationImg || designImg || uniqueImages[0]);
                  
                  const showSingleImage = isMiniCharm || uniqueImages.length <= 1 || !designImg || !inspirationImg || (mainImg && designImg && (designImg.url === mainImg.url || (designImg.storagePath && designImg.storagePath === mainImg.storagePath)));

                  const getBadgeText = (img: MiniFurnitureImage | undefined) => {
                    if (isMiniCharm) return 'Charm Photo';
                    if (!img) return 'No Photo';
                    if (img.type === 'design') return '3D Mock-Up';
                    if (img.type === 'inspiration') return 'Reference';
                    if (img.type === 'finished') return 'Finished Print';
                    return 'Photo';
                  };

                  if (viewMode === 'grid') {
                    return (
                      <div key={item.id} className="bg-white rounded-[20px] overflow-hidden shadow-[0_4px_20px_rgba(125,97,144,0.06)] border border-outline-variant/10 flex flex-col group relative transition-all duration-300 hover:shadow-[0_8px_30px_rgba(125,97,144,0.12)] hover:-translate-y-1 h-full">
                        {item.status === 'Completed' && (
                          <div className="absolute top-2 right-2 z-10 bg-[#E8F5E9] text-[#2E7D32] px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm border border-[#C8E6C9]">
                            <CheckCircle2 className="w-3 h-3" /> Completed
                          </div>
                        )}
                        <div className="flex w-full h-[120px] sm:h-[140px]">
                          {showSingleImage ? (
                            <div 
                              className="w-full bg-surface-variant/50 relative cursor-pointer h-full"
                              onClick={() => mainImg && setViewingImage({ url: mainImg.url, storagePath: mainImg.storagePath })}
                            >
                              <div className="absolute top-2 left-2 z-10 bg-black/60 text-white px-2 py-0.5 rounded text-[9px] font-bold">
                                {getBadgeText(mainImg)}
                              </div>
                              {mainImg ? (
                                <SmartImage src={mainImg.url} storagePath={mainImg.storagePath} alt={item.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-outline gap-1.5 p-2 text-center">
                                  <ImageIcon className="w-6 h-6 opacity-50" />
                                  <span className="text-[9px] text-on-surface-variant">No Photo</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              <div 
                                className="w-1/2 bg-surface-variant/50 relative cursor-pointer h-full"
                                onClick={() => inspirationImg && setViewingImage({ url: inspirationImg.url, storagePath: inspirationImg.storagePath })}
                              >
                                <div className="absolute top-2 left-2 z-10 bg-black/60 text-white px-2 py-0.5 rounded text-[9px] font-bold">Reference</div>
                                {inspirationImg ? (
                                  <SmartImage src={inspirationImg.url} storagePath={inspirationImg.storagePath} alt={item.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex flex-col items-center justify-center text-outline gap-1.5 p-2 text-center">
                                    <ImageIcon className="w-6 h-6 opacity-50" />
                                    <span className="text-[9px] text-on-surface-variant">No Reference</span>
                                  </div>
                                )}
                              </div>
                              <div 
                                className="w-1/2 bg-surface-variant/30 relative cursor-pointer h-full border-l border-outline-variant/10"
                                onClick={() => designImg && setViewingImage({ url: designImg.url, storagePath: designImg.storagePath })}
                              >
                                <div className="absolute top-2 right-2 z-10 bg-black/60 text-white px-2 py-0.5 rounded text-[9px] font-bold">Mock-Up</div>
                                {designImg ? (
                                  <SmartImage src={designImg.url} storagePath={designImg.storagePath} alt={item.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex flex-col items-center justify-center text-outline gap-1.5 p-2 text-center">
                                    <Box className="w-6 h-6 opacity-50" />
                                    <span className="text-[9px] text-on-surface-variant">No Mock-Up</span>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                        <div className="p-3.5 md:p-4 flex flex-col flex-1">
                          <div className="flex justify-between items-start gap-3 mb-2.5">
                            <div className="min-w-0">
                              <h3 className="font-semibold text-[15px] text-on-surface mb-0.5 leading-tight truncate w-full" title={item.name}>{item.name}</h3>
                              <p className="text-[12px] text-on-surface-variant line-clamp-2">{item.description}</p>
                              {(() => {
                                const setForBadge = item.setId ? printSets.find(s => s.id === item.setId) : null;
                                const setBadgeName = setForBadge?.name || item.setName;
                                if (setBadgeName && setBadgeName.trim()) {
                                  return (
                                    <div 
                                      className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 bg-[#F3E5F5] text-[#7D6190] hover:bg-[#E1BEE7] rounded-md text-[10px] font-bold cursor-pointer transition-colors shadow-sm border border-[#D1C4E9] truncate max-w-full"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setViewingSet({ 
                                          name: setBadgeName, 
                                          id: setForBadge?.id || setBadgeName, 
                                          coverImageUrl: setForBadge?.coverImageUrl 
                                        });
                                      }}
                                    >
                                      <LayoutGrid className="w-3 h-3 shrink-0" /> <span className="truncate">{setBadgeName}</span>
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          </div>
                          
                          <div className="mt-auto pt-3 border-t border-outline-variant/20 flex flex-col gap-2.5">
                            {item.status !== 'Completed' && (
                              <div className="inline-flex items-center gap-1 w-max px-2 py-0.5 bg-surface-variant/50 text-on-surface-variant rounded-md text-[10px] font-medium border border-outline-variant/20">
                                <Clock className="w-3 h-3" /> In Progress
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-on-surface-variant">
                              <span className="flex items-center gap-1 truncate max-w-[80px]"><Tag className="w-3 h-3 shrink-0" /> <span className="truncate">{item.madeFor || "Object"}</span></span>
                              <span>•</span>
                              <span>{new Date(item.dateAdded).toLocaleDateString()}</span>
                            </div>
                            <div className="flex gap-1.5">
                              <button onClick={() => { setEditingItem(item); setIsFormOpen(true); }} className="flex-1 py-1.5 text-[11px] font-bold text-primary bg-primary/5 hover:bg-primary/10 rounded-lg transition-colors flex items-center justify-center gap-1">
                                <Edit3 className="w-3.5 h-3.5" /> Edit
                              </button>
                              <button onClick={() => {
                                const duplicate = { ...item, id: uuidv4(), name: item.name + ' (Copy)' };
                                setEditingItem(duplicate);
                                setIsFormOpen(true);
                              }} className="w-7 h-7 text-on-surface-variant bg-surface-variant/50 hover:bg-surface-variant rounded-lg transition-colors flex items-center justify-center shrink-0" title="Duplicate">
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDeleteItem(item.id)} className="w-7 h-7 text-error bg-error/5 hover:bg-error/10 rounded-lg transition-colors flex items-center justify-center shrink-0">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  } else {
                    return (
                      <div key={item.id} className="bg-white rounded-[24px] p-4 shadow-sm border border-outline-variant/20 flex items-center gap-5 transition-colors hover:bg-surface-variant/10">
                        <div 
                          className="h-24 w-24 rounded-[16px] overflow-hidden bg-surface-variant/50 shrink-0 cursor-pointer relative"
                          onClick={() => mainImg && setViewingImage({ url: mainImg.url, storagePath: mainImg.storagePath })}
                        >
                          {mainImg ? (
                            <SmartImage src={mainImg.url} storagePath={mainImg.storagePath} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-outline">
                              <ImageIcon className="w-8 h-8 opacity-50" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="font-semibold text-lg text-on-surface truncate">{item.name}</h3>
                            {(() => {
                                const setForBadge = item.setId ? printSets.find(s => s.id === item.setId) : null;
                                const setBadgeName = setForBadge?.name || item.setName;
                                if (setBadgeName && setBadgeName.trim()) {
                                  return (
                                    <div 
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#F3E5F5] text-[#7D6190] hover:bg-[#E1BEE7] rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-sm border border-[#D1C4E9]"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setViewingSet({ 
                                          name: setBadgeName, 
                                          id: setForBadge?.id || setBadgeName, 
                                          coverImageUrl: setForBadge?.coverImageUrl 
                                        });
                                      }}
                                    >
                                      <LayoutGrid className="w-3.5 h-3.5" />
                                      {setBadgeName}
                                    </div>
                                  );
                                }
                                return null;
                            })()}
                            {item.status === 'Completed' && (
                              <span className="bg-[#E8F5E9] text-[#2E7D32] px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Completed
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-on-surface-variant">
                            <span className="flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> {item.madeFor || "Object"}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {item.status}</span>
                            <span>•</span>
                            <span>Added: {new Date(item.dateAdded).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <button onClick={() => { setEditingItem(item); setIsFormOpen(true); }} className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/5 rounded-full transition-colors" title="Edit">
                            <Edit3 className="w-5 h-5" />
                          </button>
                          <button onClick={() => {
                              const duplicate = { ...item, id: uuidv4(), name: item.name + ' (Copy)' };
                              setEditingItem(duplicate);
                              setIsFormOpen(true);
                          }} className="p-2 text-on-surface-variant hover:text-primary hover:bg-primary/5 rounded-full transition-colors" title="Duplicate">
                            <Copy className="w-5 h-5" />
                          </button>
                          <button onClick={() => handleDeleteItem(item.id)} className="p-2 text-on-surface-variant hover:text-error hover:bg-error/5 rounded-full transition-colors">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    );
                  }
                };

                if (groupMode !== 'sets') {
                  return (
                    <div className={viewMode === 'grid' ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 md:gap-6" : "flex flex-col gap-4"}>
                      {loading ? (
                        Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className="bg-white rounded-[24px] overflow-hidden shadow-[0_4px_20px_rgba(125,97,144,0.06)] border border-outline-variant/10 flex flex-col h-full">
                            <div className="flex w-full min-h-[150px]">
                              <div className="w-1/2 bg-surface-variant/30 animate-pulse min-h-[150px]"></div>
                              <div className="w-1/2 bg-surface-variant/20 animate-pulse min-h-[150px] border-l border-outline-variant/10"></div>
                            </div>
                            <div className="p-5 flex flex-col flex-1">
                              <div className="h-6 bg-surface-variant/30 rounded w-2/3 mb-2 animate-pulse"></div>
                              <div className="h-4 bg-surface-variant/30 rounded w-full mb-4 animate-pulse"></div>
                              <div className="flex gap-2 mt-auto pt-4 border-t border-outline-variant/20">
                                <div className="flex-1 h-9 bg-surface-variant/30 rounded-xl animate-pulse"></div>
                                <div className="w-9 h-9 bg-surface-variant/30 rounded-xl animate-pulse"></div>
                                <div className="w-9 h-9 bg-surface-variant/30 rounded-xl animate-pulse"></div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : filteredItems.map(renderItem)}
                      {filteredItems.length === 0 && !loading && (
                        <div className="text-center py-12 text-on-surface-variant w-full col-span-full">No designs match your filters.</div>
                      )}
                    </div>
                  );
                } else {
                  const setsMap = new Map<string, MiniFurniture[]>();
                  const ungrouped: MiniFurniture[] = [];
                  filteredItems.forEach(item => {
                    let setId = item.setId;
                    let setName = item.setName?.trim();
                    
                    if (!setId && setName) {
                      const matchedSet = printSets.find(s => s.name.toLowerCase() === setName.toLowerCase());
                      if (matchedSet) {
                         setId = matchedSet.id;
                         setName = matchedSet.name;
                      }
                    }

                    if (setId || setName) {
                      const groupKey = setId || setName;
                      if (!setsMap.has(groupKey!)) setsMap.set(groupKey!, []);
                      setsMap.get(groupKey!)!.push(item);
                    } else {
                      ungrouped.push(item);
                    }
                  });
                  const setKeys = Array.from(setsMap.keys());
                  
                  return (
                    <div className="flex flex-col gap-8">
                      {(setKeys.length > 0 || loading) && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
                          {loading ? (
                          Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="bg-white rounded-[24px] overflow-hidden shadow-[0_4px_20px_rgba(125,97,144,0.06)] border border-outline-variant/10 flex flex-col h-full p-5 md:p-6">
                              <div className="flex flex-col flex-1">
                                <div className="h-6 bg-surface-variant/30 rounded w-1/2 mb-4 animate-pulse"></div>
                                <div className="flex gap-2 mb-4">
                                  <div className="h-4 bg-surface-variant/30 rounded w-16 animate-pulse"></div>
                                  <div className="h-4 bg-surface-variant/30 rounded w-16 animate-pulse"></div>
                                  <div className="h-4 bg-surface-variant/30 rounded w-16 animate-pulse"></div>
                                </div>
                                <div className="mt-auto pt-4 border-t border-outline-variant/20">
                                  <div className="flex gap-2 h-16">
                                     <div className="w-16 h-16 rounded-lg bg-surface-variant/30 animate-pulse shrink-0"></div>
                                     <div className="w-16 h-16 rounded-lg bg-surface-variant/30 animate-pulse shrink-0"></div>
                                     <div className="w-16 h-16 rounded-lg bg-surface-variant/30 animate-pulse shrink-0"></div>
                                     <div className="w-16 h-16 rounded-lg bg-surface-variant/30 animate-pulse shrink-0"></div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : setKeys.map(setKey => {
                             const itemsInSet = setsMap.get(setKey)!;
                             const printSet = printSets.find(s => s.id === setKey || s.name === setKey) || { name: itemsInSet[0]?.setName || setKey, id: setKey };
                             const setName = printSet.name;
                             
                             const totalPrototypePhotos = itemsInSet.reduce((acc, it) => acc + it.images.filter(img => img.type === 'finished').length, 0);
                             const allCompleted = itemsInSet.every(i => i.status === 'Completed');
                             const statusText = allCompleted ? 'Completed' : 'In Progress';
                             
                             let coverUrl = printSet.coverImageUrl;
                             if (!coverUrl) {
                                for (const it of itemsInSet) {
                                   const mockUp = it.images.find(img => img.type === 'design');
                                   if (mockUp) {
                                      coverUrl = mockUp.url;
                                      break;
                                   }
                                }
                                if (!coverUrl) {
                                   for (const it of itemsInSet) {
                                      if (it.images.length > 0) {
                                         coverUrl = it.images[0].url;
                                         break;
                                      }
                                   }
                                }
                             }
                             
                             const printsWithPrototypes = itemsInSet.filter(print => print.images.some(img => img.type === 'finished'));

                             const groupMockups: { url: string; printName: string; id: string }[] = [];
                             itemsInSet.forEach((print) => {
                               const mockupImgs = print.images.filter((img) => img.type === 'design');
                               mockupImgs.forEach((img) => {
                                 groupMockups.push({
                                   url: img.url,
                                   printName: print.name || 'Print',
                                   id: img.id,
                                 });
                               });
                             });

                             return (
                               <div key={setKey} onClick={() => setViewingSet({ name: setName, id: printSet.id, coverImageUrl: coverUrl, fullPrintTime: printSet.fullPrintTime })} className="bg-white rounded-[24px] overflow-hidden shadow-[0_4px_20px_rgba(125,97,144,0.06)] border border-outline-variant/10 cursor-pointer hover:shadow-[0_8px_30px_rgba(125,97,144,0.12)] hover:-translate-y-1 transition-all flex flex-col h-full group p-5 md:p-6 min-w-0">
                                 <div className="flex flex-col flex-1 min-w-0">
                                    <h3 className="font-bold text-[22px] md:text-2xl text-on-surface mb-3 line-clamp-2">{setName}</h3>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] md:text-sm text-on-surface-variant font-medium">
                                      <span className="flex items-center gap-1.5"><Box className="w-4 h-4" /> {itemsInSet.length} Designs</span>
                                      <span className="text-outline-variant hidden sm:inline">•</span>
                                      <span className="flex items-center gap-1.5 font-semibold text-[#7D6190]" title={getGroupedPrintTime(itemsInSet, printSet.fullPrintTime).isCustom ? 'Custom Full Print Time' : 'Sum of Individual Print Times'}>
                                        <Clock className="w-4 h-4 text-[#FF85A2]" />
                                        <span>Full Print Time: {getGroupedPrintTime(itemsInSet, printSet.fullPrintTime).displayTime}</span>
                                        {getGroupedPrintTime(itemsInSet, printSet.fullPrintTime).isCustom && <span className="text-[10px] bg-[#FFF0F4] px-1.5 py-0.5 rounded-full text-[#7D6190] font-bold border border-[#FF85A2]/30">Custom</span>}
                                      </span>
                                      <span className="text-outline-variant hidden sm:inline">•</span>
                                      <span className="flex items-center gap-1.5"><ImageIcon className="w-4 h-4" /> {totalPrototypePhotos} Prototype Photos</span>
                                      <span className="text-outline-variant hidden sm:inline">•</span>
                                      <span className={`flex items-center gap-1.5 font-bold ${allCompleted ? 'text-[#2E7D32]' : 'text-[#B8860B]'}`}>
                                        {statusText}
                                      </span>
                                    </div>
                                    <div className="my-5 border-t border-outline-variant/30 w-full shrink-0"></div>
                                    
                                    <div className="flex overflow-x-auto gap-3 md:gap-4 pb-3 scrollbar-hide -mx-1 px-1 mt-auto w-full max-w-full">
                                      {itemsInSet.length > 0 ? (
                                        itemsInSet.map(print => {
                                          const mockUp = print.images.find(img => img.type === 'design') || print.images.find(img => img.type === 'finished') || print.images.find(img => img.type === 'inspiration') || print.images[0];
                                          return (
                                            <div key={print.id} className="flex flex-col gap-1.5 shrink-0">
                                              <div className="w-[80px] h-[80px] md:w-[100px] md:h-[100px] rounded-xl overflow-hidden bg-surface-variant/20 relative shrink-0 border border-outline-variant/10 shadow-sm group/img">
                                                {mockUp ? (
                                                  <SmartImage src={mockUp.url} storagePath={mockUp.storagePath} className="w-full h-full object-cover" />
                                                ) : (
                                                  <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center bg-surface-variant/10">
                                                    <ImageIcon className="w-4 h-4 md:w-5 md:h-5 mb-1 text-on-surface-variant/40" />
                                                    <span className="text-[9px] md:text-[10px] text-on-surface-variant leading-tight font-medium">No<br/>Photo</span>
                                                  </div>
                                                )}
                                                <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/5 transition-colors"></div>
                                              </div>
                                              <span className="text-[10px] md:text-[12px] text-on-surface font-medium truncate w-[80px] md:w-[100px] px-1 text-center" title={print.name}>{print.name}</span>
                                            </div>
                                          );
                                        })
                                      ) : (
                                        <div className="w-full flex items-center justify-center p-6 bg-surface-container-low rounded-xl border border-outline-variant/20 border-dashed">
                                          <span className="text-[13px] text-on-surface-variant/60 font-medium">No designs added yet</span>
                                        </div>
                                      )}
                                    </div>

                                    <div className="mt-3.5 pt-3 border-t border-outline-variant/20 w-full shrink-0">
                                      <button
                                        type="button"
                                        disabled={groupMockups.length === 0 || exportingSetKey === setKey}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleExportGroupMockups(setKey, setName, groupMockups);
                                        }}
                                        className="w-full py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 shadow-xs border border-outline-variant/20 disabled:opacity-50 disabled:cursor-not-allowed bg-[#FFF0F4] text-[#7D6190] hover:bg-[#FF85A2] hover:text-white disabled:hover:bg-[#FFF0F4] disabled:hover:text-[#7D6190]"
                                        title={groupMockups.length === 0 ? "No mockups to export" : `Export ${groupMockups.length} 3D mockup(s)`}
                                      >
                                        {exportingSetKey === setKey ? (
                                          <>
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            <span>Exporting...</span>
                                          </>
                                        ) : groupMockups.length === 0 ? (
                                          <>
                                            <Download className="w-3.5 h-3.5 opacity-50" />
                                            <span>No mockups to export</span>
                                          </>
                                        ) : (
                                          <>
                                            <Download className="w-3.5 h-3.5" />
                                            <span>Export Mockups ({groupMockups.length})</span>
                                          </>
                                        )}
                                      </button>
                                    </div>
                                 </div>
                               </div>
                             );
                          })}
                        </div>
                      )}
                      
                      {(ungrouped.length > 0 || (loading && setKeys.length === 0)) && (
                        <div>
                          <h3 className="font-bold text-lg text-on-surface mb-4 border-b border-outline-variant/20 pb-2">Ungrouped Designs</h3>
                          <div className={viewMode === 'grid' ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 md:gap-6" : "flex flex-col gap-4"}>
                            {loading ? (
                              Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="bg-white rounded-[24px] overflow-hidden shadow-[0_4px_20px_rgba(125,97,144,0.06)] border border-outline-variant/10 flex flex-col h-full">
                                  <div className="flex w-full min-h-[150px]">
                                    <div className="w-1/2 bg-surface-variant/30 animate-pulse min-h-[150px]"></div>
                                    <div className="w-1/2 bg-surface-variant/20 animate-pulse min-h-[150px] border-l border-outline-variant/10"></div>
                                  </div>
                                  <div className="p-5 flex flex-col flex-1">
                                    <div className="h-6 bg-surface-variant/30 rounded w-2/3 mb-2 animate-pulse"></div>
                                    <div className="h-4 bg-surface-variant/30 rounded w-full mb-4 animate-pulse"></div>
                                    <div className="flex gap-2 mt-auto pt-4 border-t border-outline-variant/20">
                                      <div className="flex-1 h-9 bg-surface-variant/30 rounded-xl animate-pulse"></div>
                                      <div className="w-9 h-9 bg-surface-variant/30 rounded-xl animate-pulse"></div>
                                      <div className="w-9 h-9 bg-surface-variant/30 rounded-xl animate-pulse"></div>
                                    </div>
                                  </div>
                                </div>
                              ))
                            ) : ungrouped.map(renderItem)}
                          </div>
                        </div>
                      )}
                      
                      {setKeys.length === 0 && ungrouped.length === 0 && !loading && (
                         <div className="text-center py-12 text-on-surface-variant">No designs match your filters.</div>
                      )}
                    </div>
                  );
                }
              })()}
            </>
          )}
        </div>
      </div>
      {isFormOpen && (
        <FurnitureFormModal items={items} printSets={printSets} 
          item={editingItem}
          categories={categories}
          onClose={() => { setIsFormOpen(false); setEditingItem(null); }}
          onSave={handleSaveItem}
        />
      )}

      {viewingImage && (
        <ImageViewerModal
          image={{
            url: viewingImage.url,
            storagePath: viewingImage.storagePath,
            title: viewingImage.title || 'Print Design Photo',
            filename: viewingImage.title || 'print_photo',
          }}
          allImages={viewingImage.allImages}
          zipTitle={viewingImage.zipTitle}
          onClose={() => setViewingImage(null)}
        />
      )}

      
      {viewingSet && (
        <SetGalleryModal
          setInfo={viewingSet}
          items={items.filter(i => (i.setId === viewingSet.id && viewingSet.id) || i.setName === viewingSet.name)}
          onClose={() => setViewingSet(null)}
          onSetCover={async (url) => {
             const newSets = printSets.map(s => s.id === viewingSet.id ? { ...s, coverImageUrl: url } : s);
             setPrintSets(newSets);
             await setDoc(doc(db, `users/${user?.uid}/preferences`, 'miniFurnitureSets'), sanitizeFirestorePayload({ sets: newSets }), { merge: true });
             setViewingSet({ ...viewingSet, coverImageUrl: url });
          }}
          onRename={async (newName) => {
             const newSets = printSets.map(s => s.id === viewingSet.id ? { ...s, name: newName } : s);
             setPrintSets(newSets);
             await setDoc(doc(db, `users/${user?.uid}/preferences`, 'miniFurnitureSets'), sanitizeFirestorePayload({ sets: newSets }), { merge: true });
             
             // Update the name of viewing set in state
             setViewingSet({ ...viewingSet, name: newName });
          }}
          onUpdateFullPrintTime={async (newTime) => {
             const newSets = printSets.map(s => s.id === viewingSet.id ? { ...s, fullPrintTime: newTime } : s);
             setPrintSets(newSets);
             await setDoc(doc(db, `users/${user?.uid}/preferences`, 'miniFurnitureSets'), sanitizeFirestorePayload({ sets: newSets }), { merge: true });
             setViewingSet({ ...viewingSet, fullPrintTime: newTime });
          }}
          onDelete={async (keepUngrouped) => {
             if (keepUngrouped) {
                // Remove setId and setName from all items in this set
                const itemsInSet = items.filter(i => (i.setId === viewingSet.id && viewingSet.id) || i.setName === viewingSet.name);
                for (const item of itemsInSet) {
                   await setDoc(doc(db, `users/${user?.uid}/miniFurniture`, item.id), sanitizeFirestorePayload({ ...item, setId: '', setName: '' }), { merge: true });
                }
             } else {
                // Delete all items in set
                const itemsInSet = items.filter(i => (i.setId === viewingSet.id && viewingSet.id) || i.setName === viewingSet.name);
                for (const item of itemsInSet) {
                   await deleteDoc(doc(db, `users/${user?.uid}/miniFurniture`, item.id));
                }
             }
             const newSets = printSets.filter(s => s.id !== viewingSet.id);
             setPrintSets(newSets);
             await setDoc(doc(db, `users/${user?.uid}/preferences`, 'miniFurnitureSets'), sanitizeFirestorePayload({ sets: newSets }), { merge: true });
             setViewingSet(null);
          }}
        />
      )}

      {isCategoryManagerOpen && (
        <CategoryManagerModal 
          categories={categories}
          onClose={() => setIsCategoryManagerOpen(false)}
          onSave={saveCategories}
        />
      )}
    </div>
  );
};

// Helper icon
const PrinterIcon = (props: any) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="6 9 6 2 18 2 18 9"></polyline>
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
    <rect width="12" height="8" x="6" y="14"></rect>
  </svg>
);

const SetAutocomplete = ({ value, onChange, printSets, items }: { value: string, onChange: (val: string) => void, printSets: {id: string, name: string}[], items: MiniFurniture[] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value || '');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getSetCount = (setName: string, setId?: string) => {
    return items.filter(i => (i.setId === setId && setId) || i.setName === setName).length;
  };

  const filteredSets = (printSets || []).filter(s => s && s.name && s.name.toLowerCase().includes((inputValue || '').toLowerCase()));
  const exactMatch = (printSets || []).find(s => s && s.name && s.name.toLowerCase().trim() === (inputValue || '').toLowerCase().trim());

  return (
    <div className="relative mb-4" ref={wrapperRef}>
      <label className="block text-sm font-medium text-on-surface mb-1">Set Name (Optional)</label>
      <div className="relative">
        <input 
          type="text" 
          value={inputValue} 
          onChange={e => {
            setInputValue(e.target.value);
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="e.g. Bear Bottles" 
          className="w-full px-4 py-2.5 bg-white border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
        />
        {inputValue && (
          <button 
            type="button"
            onClick={() => { setInputValue(''); onChange(''); setIsOpen(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {isOpen && (
        <div className="absolute z-[100] w-full mt-1 bg-white border border-outline-variant/30 rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {filteredSets.map(s => (
            <div 
              key={s.id} 
              onClick={() => {
                setInputValue(s.name);
                onChange(s.name);
                setIsOpen(false);
              }}
              className="px-4 py-3 hover:bg-surface-variant/20 cursor-pointer flex justify-between items-center border-b border-outline-variant/10 last:border-0"
            >
              <span className="font-medium text-on-surface">{s.name}</span>
              <span className="text-xs text-on-surface-variant bg-surface-variant/20 px-2 py-0.5 rounded-full">{getSetCount(s.name, s.id)} items</span>
            </div>
          ))}
          {!exactMatch && inputValue.trim() && (
            <div 
              onClick={() => {
                const newName = inputValue.trim();
                setInputValue(newName);
                onChange(newName);
                setIsOpen(false);
              }}
              className="px-4 py-3 hover:bg-primary/10 cursor-pointer flex items-center gap-2 text-primary border-t border-outline-variant/10"
            >
              <Plus className="w-4 h-4" />
              <span className="font-bold">Create New Set: "{inputValue.trim()}"</span>
            </div>
          )}
          {filteredSets.length === 0 && !inputValue.trim() && (
            <div className="px-4 py-3 text-sm text-on-surface-variant">No sets found. Type to create one.</div>
          )}
        </div>
      )}
    </div>
  );
};

interface PendingUpload {
  id: string;
  file: File;
  previewUrl: string;
  type: string;
  label?: string;
  progress: number;
  status: 'idle' | 'uploading' | 'success' | 'error';
  error?: string;
  uploadedUrl?: string;
  uploadedPath?: string;
}

const FurnitureFormModal = ({ item, categories, printSets, items, onClose, onSave }: { item: MiniFurniture | null, categories: string[], printSets: {id: string, name: string}[], items: MiniFurniture[], onClose: () => void, onSave: (item: MiniFurniture) => Promise<void> }) => {
  const { user } = useAuth();
  const [formData, setFormData] = useState<MiniFurniture>(item || {
    id: uuidv4(),
    name: '',
    category: categories[0] || 'Bedroom',
    description: '',
    status: 'Idea',
    quantity: 1,
    color: '',
    material: '',
    width: '',
    depth: '',
    height: '',
    unit: 'mm',
    scale: '',
    is3DPrinted: true,
    printer: '',
    fileName: '',
    printTime: '',
    filamentUsed: '',
    filamentColor: '',
    parts: [],
    dateStarted: '',
    dateCompleted: '',
    dateAdded: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    notes: '',
    setName: '',
    madeFor: 'Object',
    images: []
  });

  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadStageText, setUploadStageText] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'details' | 'images'>('details');
  const [extraSlots, setExtraSlots] = useState<{id: string, label: string}[]>([]);

  const addExtraSlot = () => {
    setExtraSlots(prev => [...prev, { id: `extra-${uuidv4()}`, label: 'Extra Photo' }]);
  };

  const updateExtraLabel = (typeId: string, newLabel: string) => {
    setExtraSlots(prev => prev.map(s => s.id === typeId ? { ...s, label: newLabel } : s));
    if (formData.images.some(img => img.type === typeId)) {
      setFormData(prev => ({
        ...prev,
        images: prev.images.map(img => img.type === typeId ? { ...img, label: newLabel } : img)
      }));
    }
  };

  const removeExtraSlot = (typeId: string) => {
    setExtraSlots(prev => prev.filter(s => s.id !== typeId));
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter(img => img.type !== typeId)
    }));
    setPendingUploads(prev => prev.filter(p => p.type !== typeId));
  };

  useEffect(() => {
    const originalStyle = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
      // Clean up object URLs
      pendingUploads.forEach(p => URL.revokeObjectURL(p.previewUrl));
    };
  }, []);

  const handleFileSelect = (files: FileList | File[] | null, type: string) => {
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    
    // Create instant local preview object URLs
    const newPending: PendingUpload[] = fileList.map(file => ({
      id: uuidv4(),
      file,
      previewUrl: URL.createObjectURL(file),
      type,
      label: formData.images.find(img => img.type === type)?.label,
      progress: 0,
      status: 'idle'
    }));

    if (isMiniCharmItem(formData)) {
      // Mini Charm: keep only one pending or replace
      setPendingUploads([newPending[0]]);
      setFormData(prev => ({ ...prev, images: prev.images.filter(img => img.type !== 'finished') }));
    } else {
      setPendingUploads(prev => [...prev, ...newPending]);
    }
  };

  const removePendingUpload = (id: string) => {
    setPendingUploads(prev => {
      const target = prev.find(p => p.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter(p => p.id !== id);
    });
  };

  const removeImage = (id: string) => {
    setFormData({ ...formData, images: formData.images.filter(img => img.id !== id) });
  };

  const executeSaveAndUploads = async () => {
    if (!formData.name.trim()) {
      alert("Print Name is required");
      return;
    }

    if (isSaving) return;

    setIsSaving(true);
    setSaveError(null);
    setUploadStageText('Preparing photos...');

    try {
      const printId = formData.id || uuidv4();
      const currentUserId = user?.uid || 'guest';

      // 1. Collect photos already uploaded successfully in a previous attempt (retry scenario)
      const alreadyUploaded = pendingUploads.filter(p => p.status === 'success' && p.uploadedUrl);
      const toUpload = pendingUploads.filter(p => p.status !== 'success');

      const uploadedResults: MiniFurnitureImage[] = alreadyUploaded.map(p => {
        const meta: MiniFurnitureImage = {
          id: p.id,
          url: p.uploadedUrl!,
          type: p.type
        };
        if (p.uploadedPath) meta.storagePath = p.uploadedPath;
        if (p.label) meta.label = p.label;
        return meta;
      });

      if (toUpload.length > 0) {
        setUploadStageText(`Uploading ${toUpload.length} photo(s)...`);

        // Update status to uploading
        setPendingUploads(prev => prev.map(p => 
          toUpload.some(u => u.id === p.id) ? { ...p, status: 'uploading', error: undefined, progress: 0 } : p
        ));

        for (const item of toUpload) {
          try {
            setUploadStageText(`Uploading ${item.label || item.type} photo...`);
            const storagePath = `users/${currentUserId}/prints/${printId}/${uuidv4().substring(0, 8)}.jpg`;
            
            const res = await uploadFileToStorage(
              currentUserId, 
              storagePath, 
              item.file, 
              (pct) => {
                setPendingUploads(prev => prev.map(p => p.id === item.id ? { ...p, progress: pct, status: 'uploading' } : p));
              },
              (msg) => {
                if (msg.includes("Converting iPhone photo")) {
                  setUploadStageText(msg);
                }
              }
            );

            if (!res || !res.url) {
              throw new Error("URL retrieval failed: Empty download URL returned from Storage");
            }

            const cleanPhotoMeta: MiniFurnitureImage = {
              id: item.id,
              url: res.url,
              type: item.type
            };
            if (res.path) cleanPhotoMeta.storagePath = res.path;
            if (item.label) cleanPhotoMeta.label = item.label;

            uploadedResults.push(cleanPhotoMeta);

            // Mark as success
            setPendingUploads(prev => prev.map(p => p.id === item.id ? { 
              ...p, 
              status: 'success', 
              progress: 100, 
              uploadedUrl: res.url, 
              uploadedPath: res.path,
              error: undefined
            } : p));
          } catch (err: any) {
            const errMsg = err?.message || 'Upload failed';
            setPendingUploads(prev => prev.map(p => p.id === item.id ? { ...p, status: 'error', error: errMsg } : p));
            throw new Error(`Upload stage failed for photo (${item.type}): ${errMsg}`);
          }
        }
      }

      // Combine existing images (sanitized) + newly uploaded clean images
      const cleanExistingImages: MiniFurnitureImage[] = (formData.images || [])
        .filter(img => img && img.url && !img.url.startsWith('blob:') && !img.url.startsWith('data:'))
        .map(img => {
          const meta: MiniFurnitureImage = {
            id: img.id || uuidv4(),
            url: img.url,
            type: img.type || 'design'
          };
          if (img.storagePath) meta.storagePath = img.storagePath;
          if (img.label) meta.label = img.label;
          return meta;
        });

      let finalImages = [...cleanExistingImages, ...uploadedResults];

      if (isMiniCharmItem(formData) && finalImages.length > 0) {
        const finishedImg = finalImages.find(img => img.type === 'finished');
        finalImages = finishedImg ? [finishedImg] : [finalImages[0]];
      }

      setUploadStageText('Saving print metadata to Firestore...');
      const finalFormData: MiniFurniture = {
        ...formData,
        id: printId,
        images: finalImages
      };

      const cleanPrintPayload = sanitizeFirestorePayload(finalFormData);

      try {
        await onSave(cleanPrintPayload);

        // Clean up orphaned images that were removed during editing
        if (item && item.images) {
          const newImageIds = new Set(finalImages.map(img => img.id));
          for (const oldImg of item.images) {
            if (!newImageIds.has(oldImg.id) && oldImg.storagePath) {
              deleteFileFromStorage(oldImg.storagePath).catch(err => {
                console.warn("Failed to clean up orphaned image from storage:", err);
              });
            }
          }
        }
      } catch (saveErr: any) {
        throw new Error(`Firestore save stage failed: ${saveErr?.message || 'Firestore write error'}`);
      }

      setSaveSuccess(true);
      setUploadStageText('Saved successfully!');

      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err: any) {
      console.error("Save print failed:", err);
      const realErrorMsg = err?.message || String(err) || 'Failed to save print design. Please retry.';
      setSaveError(realErrorMsg);
      setPendingUploads(prev => prev.map(p => p.status === 'uploading' ? { ...p, status: 'error', error: realErrorMsg } : p));
    } finally {
      setIsSaving(false);
      setUploadStageText('');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 pb-[env(safe-area-inset-bottom,16px)]">
      <div className="bg-white rounded-[28px] shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col min-h-0 max-h-[calc(100dvh-16px)] sm:max-h-[90vh]">
        <div className="px-6 py-4 border-b border-outline-variant/20 flex justify-between items-center shrink-0 bg-white">
          <h2 className="text-xl font-headline-md font-semibold text-on-surface">
            {item ? 'Edit Print Design' : 'Add Print Design'}
          </h2>
          <button onClick={onClose} disabled={isSaving} className="p-2 text-on-surface-variant hover:bg-surface-variant/50 rounded-full transition-colors disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-outline-variant/20 px-6 pt-2 shrink-0 bg-white">
          <button 
            className={`pb-3 px-4 font-medium text-sm transition-colors border-b-2 ${activeTab === 'details' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
            onClick={() => setActiveTab('details')}
          >
            Details
          </button>
          
          <button 
            className={`pb-3 px-4 font-medium text-sm transition-colors border-b-2 ${activeTab === 'images' ? 'border-primary text-primary' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
            onClick={() => setActiveTab('images')}
          >
            Photos ({formData.images.length + pendingUploads.length})
          </button>
        </div>
        
        <div 
          className="p-4 sm:p-6 flex-1 bg-surface-container-lowest overflow-y-auto min-h-0 overscroll-contain touch-pan-y"
          style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(100px + env(safe-area-inset-bottom))' }}
        >
          {activeTab === 'details' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-on-surface mb-1">Print Name *</label>
                  <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" required />
                </div>
                <div>
                  <SetAutocomplete value={formData.setName || ''} onChange={val => setFormData({...formData, setName: val})} printSets={printSets} items={items} />
                  <label className="block text-sm font-medium text-on-surface mb-1">Status</label>
                  <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all">
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-on-surface mb-1">Type</label>
                <select value={formData.madeFor || 'Mini Furniture'} onChange={e => setFormData({...formData, madeFor: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-outline-variant/50 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all">
                  <option value="Mini Furniture">Mini Furniture</option>
                  <option value="Object">Object</option>
                  <option value="Charm">Charm</option>
                  <option value="Mini Charm">Mini Charm</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'images' && (
            <div className="space-y-8">
              {(() => {
                 const isMiniCharm = isMiniCharmItem(formData);
                 const baseTypes = isMiniCharm ? ['finished'] : ['inspiration', 'design'];
                 const existingTypes = isMiniCharm ? formData.images.map(img => img.type).filter(t => t === 'finished') : formData.images.map(img => img.type);
                 const pendingTypes = pendingUploads.map(p => p.type);
                 const extraSlotsToRender = isMiniCharm ? [] : extraSlots.map(s => s.id);
                 const allTypes = Array.from(new Set([...baseTypes, ...existingTypes, ...pendingTypes, ...extraSlotsToRender]));
                 
                 return allTypes.map(type => {
                    const sectionImages = formData.images.filter(img => img.type === type);
                    const sectionPending = pendingUploads.filter(p => p.type === type);
                    
                    const isExtra = type.startsWith('extra-');
                    const defaultTitle = isExtra ? (extraSlots.find(s => s.id === type)?.label || 'Extra Photo') : (
                      isMiniCharm && type === 'finished' ? 'Mini Charm Photo' :
                      {
                        'inspiration': 'Reference Photo',
                        'design': '3D Mock-Up',
                        'front': 'Front View',
                        'back': 'Back View',
                        'left': 'Left View',
                        'right': 'Right View',
                        'finished': 'Finished Print',
                        'additional': 'Additional Photos'
                      }[type] || 'Extra Photo'
                    );
                    
                    const existingImg = sectionImages.length > 0 ? sectionImages[0] : null;
                    const title = isExtra && existingImg?.label 
                                  ? existingImg.label 
                                  : defaultTitle;

                    return (
                      <div key={type} className="bg-white rounded-[20px] p-6 shadow-sm border border-outline-variant/30">
                        <div className="flex items-center justify-between mb-4 gap-4">
                          {isExtra ? (
                            <input 
                              type="text" 
                              value={title} 
                              onChange={(e) => updateExtraLabel(type, e.target.value)}
                              className="font-bold text-lg text-on-surface bg-transparent border-b border-transparent focus:border-outline-variant hover:border-outline-variant/50 focus:outline-none transition-colors px-1 w-full max-w-[240px]"
                              placeholder="Photo Label"
                            />
                          ) : (
                            <h3 className="font-bold text-lg text-on-surface">{title}</h3>
                          )}
                          
                          {isExtra && (
                            <button type="button" onClick={() => removeExtraSlot(type)} className="p-2 hover:bg-error/10 text-error rounded-full transition-colors shrink-0" title="Remove Photo">
                              <X className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                                             
                        {sectionImages.length === 0 && sectionPending.length === 0 ? (
                          <ImageUploaderArea 
                            onUpload={(files) => handleFileSelect(files, type)}
                            className="w-full touch-pan-y"
                          >
                            <div className="text-center p-8 bg-surface-variant/10 rounded-2xl border-2 border-dashed border-outline-variant/50 text-on-surface-variant flex flex-col items-center gap-3">
                              <ImageIcon className="w-8 h-8 opacity-40" />
                              <p className="font-medium text-sm">Drag and drop {title.toLowerCase()} here or click to browse.</p>
                              <label className="mt-2 cursor-pointer bg-primary text-white text-sm font-bold flex items-center justify-center gap-2 hover:bg-primary/90 px-4 py-2 rounded-full transition-colors shadow-sm">
                                <Plus className="w-4 h-4" /> Browse Files
                                <input type="file" multiple={!isMiniCharm} accept="image/*" className="hidden" onChange={e => handleFileSelect(e.target.files, type)} disabled={isSaving} />
                              </label>
                            </div>
                          </ImageUploaderArea>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                            {/* Saved Images */}
                            {sectionImages.map(img => (
                              <div key={img.id} className="relative aspect-square rounded-2xl overflow-hidden group bg-surface-variant/30 border border-outline-variant/20 shadow-sm touch-pan-y">
                                <SmartImage src={img.url} storagePath={img.storagePath} alt="Uploaded" className="w-full h-full object-cover touch-pan-y" />
                                <button 
                                  type="button" 
                                  onClick={(e) => { e.stopPropagation(); removeImage(img.id); }} 
                                  className="absolute top-3 right-3 bg-white/90 hover:bg-error hover:text-white text-on-surface p-2 rounded-full shadow-md transition-colors backdrop-blur-sm z-10"
                                  title="Remove image"
                                  disabled={isSaving}
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ))}

                            {/* Pending Instant Previews */}
                            {sectionPending.map(p => (
                              <div key={p.id} className="relative aspect-square rounded-2xl overflow-hidden group bg-surface-variant/30 border border-outline-variant/20 shadow-sm touch-pan-y">
                                <img src={p.previewUrl} alt="Preview" className="w-full h-full object-cover opacity-90" />
                                
                                <button 
                                  type="button" 
                                  onClick={() => removePendingUpload(p.id)} 
                                  className="absolute top-3 right-3 bg-white/90 hover:bg-error hover:text-white text-on-surface p-2 rounded-full shadow-md transition-colors backdrop-blur-sm z-10"
                                  title="Remove preview"
                                  disabled={isSaving}
                                >
                                  <X className="w-4 h-4" />
                                </button>

                                {p.status === 'uploading' && (
                                  <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-white">
                                    <div className="w-full bg-white/30 rounded-full h-2 mb-2 overflow-hidden">
                                      <div className="bg-primary h-full transition-all duration-300" style={{ width: `${Math.max(10, p.progress)}%` }} />
                                    </div>
                                    <span className="text-xs font-bold">{p.progress > 0 ? `${p.progress}% Uploading` : 'Uploading...'}</span>
                                  </div>
                                )}

                                {p.status === 'error' && (
                                  <div className="absolute inset-0 bg-error/80 backdrop-blur-[2px] flex flex-col items-center justify-center p-3 text-white text-center">
                                    <span className="text-xs font-bold mb-1">Upload Failed</span>
                                    <span className="text-[10px] mb-2">{p.error || 'Network error'}</span>
                                    <button 
                                      type="button" 
                                      onClick={executeSaveAndUploads} 
                                      className="px-3 py-1 bg-white text-error rounded-full text-xs font-bold hover:bg-white/90 shadow-sm"
                                    >
                                      Retry
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}

                            {!isMiniCharm && (
                              <label className="cursor-pointer border-2 border-dashed border-outline-variant/50 rounded-2xl aspect-square flex flex-col items-center justify-center text-on-surface-variant hover:border-primary hover:text-primary transition-colors bg-surface-variant/10">
                                <Plus className="w-6 h-6 mb-1" />
                                <span className="text-xs font-bold">Add Photo</span>
                                <input type="file" multiple accept="image/*" className="hidden" onChange={e => handleFileSelect(e.target.files, type)} disabled={isSaving} />
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                    );
                 });
              })()}
              
              {!isMiniCharmItem(formData) && (
                <div className="flex justify-center mt-6">
                   <button type="button" onClick={addExtraSlot} className="px-6 py-3 rounded-full bg-surface-container-high hover:bg-surface-variant font-bold text-sm text-on-surface flex items-center gap-2 shadow-sm transition-colors">
                      <Plus className="w-4 h-4" /> Add More Photos
                   </button>
                </div>
              )}
              
              {isSaving && uploadStageText && (
                <div className="text-center text-primary text-sm font-medium animate-pulse bg-primary/5 py-4 rounded-xl border border-primary/20">
                  {uploadStageText}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 sm:px-6 py-4 sm:py-4 pb-[max(16px,env(safe-area-inset-bottom))] border-t border-outline-variant/20 flex flex-wrap-reverse sm:flex-nowrap justify-end gap-3 shrink-0 bg-white items-center">
          <button onClick={onClose} disabled={isSaving} className="px-5 py-2.5 rounded-full font-medium text-on-surface-variant hover:bg-surface-variant transition-colors disabled:opacity-50">
            Cancel
          </button>
          
          {saveError && (
            <div className="text-error text-sm font-medium mr-auto">
              Error: {saveError}
            </div>
          )}
          {saveSuccess && (
            <div className="text-[#2E7D32] text-sm font-medium mr-auto flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Saved successfully
            </div>
          )}
          <button 
            onClick={executeSaveAndUploads} 
            disabled={isSaving || saveSuccess}
            className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-full font-medium transition-colors shadow-sm disabled:opacity-50 min-w-[140px]"
          >
            {isSaving ? 'Saving...' : saveSuccess ? 'Saved' : (saveError ? 'Retry Save' : 'Save Print Design')}
          </button>
        </div>
      </div>
    </div>
  );
};

const CategoryManagerModal = ({ categories, onClose, onSave }: { categories: string[], onClose: () => void, onSave: (cats: string[]) => void }) => {
  const [cats, setCats] = useState(categories);
  const [newCat, setNewCat] = useState('');

  const handleAdd = () => {
    if (newCat.trim() && !(cats || []).includes(newCat.trim())) {
      setCats([...cats, newCat.trim()]);
      setNewCat('');
    }
  };

  const handleRemove = (cat: string) => {
    setCats(cats.filter(c => c !== cat));
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-5 border-b border-outline-variant/20 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-on-surface">Categories</h2>
          <button onClick={onClose} className="p-2 hover:bg-surface-variant/50 rounded-full text-on-surface-variant">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">
          <div className="flex gap-2 mb-4">
            <input 
              type="text" 
              value={newCat} 
              onChange={e => setNewCat(e.target.value)} 
              placeholder="New category name..." 
              className="flex-1 md:overflow-y-auto px-4 py-2 border border-outline-variant/50 rounded-lg focus:outline-none focus:border-primary" 
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
            <button onClick={handleAdd} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium">Add</button>
          </div>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {cats.map(cat => (
              <div key={cat} className="flex justify-between items-center px-4 py-2 bg-surface-variant/20 rounded-lg border border-outline-variant/20">
                <span className="font-medium text-on-surface text-sm">{cat}</span>
                <button onClick={() => handleRemove(cat)} className="text-on-surface-variant hover:text-error p-1 rounded-md transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="p-5 border-t border-outline-variant/20 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-on-surface-variant hover:bg-surface-variant rounded-full font-medium transition-colors">Cancel</button>
          <button onClick={() => { onSave(cats); onClose(); }} className="px-5 py-2 bg-primary text-white rounded-full font-medium hover:bg-primary/90 transition-colors shadow-sm">Save</button>
        </div>
      </div>
    </div>
  );
};


