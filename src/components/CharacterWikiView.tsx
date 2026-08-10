import { safeGetDoc as getDoc, safeGetDocs as getDocs } from '../lib/firebase';
import React, { useState, useEffect } from 'react';
import { Search, Heart, Plus, X, Edit, Trash2, Image as ImageIcon, Upload, ChevronLeft, Wand2, Loader2, Droplet } from 'lucide-react';
import { ImageUploaderArea } from './ui/ImageUploaderArea';
import { ColorSampler } from './ColorSampler';
import { EntitySelector } from './EntitySelector';
import { db } from '../lib/firebase';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../lib/AuthContext';
import { SyncStatus } from './SyncStatus';
import { ImageViewerModal, ImageToView } from './ImageViewerModal';
import { uploadFileToStorage, deleteFileFromStorage } from '../lib/storage';
import { GUEST_SAMPLE_CHARACTERS, GUEST_SAMPLE_SERIES, GUEST_SAMPLE_FRANCHISES } from '../lib/guestSampleData';

interface CharacterImage {
  url: string;
  storagePath: string;
}

export interface SampledColor {
  hex: string;
  name?: string;
  photoUrl?: string;
  photoStoragePath?: string;
  point?: { x: number, y: number };
}

export function isValidHex(hex: string): boolean {
  if (!hex) return false;
  return /^#[0-9A-Fa-f]{6}$/.test(hex.trim());
}

export function formatHex(hex: string): string | null {
  if (!hex) return null;
  let clean = hex.trim();
  if (!clean.startsWith('#')) clean = '#' + clean;
  clean = clean.toUpperCase();
  if (/^#[0-9A-Fa-f]{6}$/.test(clean)) return clean;
  return null;
}

export function extractMainColorFromImageDataUrl(dataUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (!dataUrl) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const maxDim = 300;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round(h * (maxDim / w));
            w = maxDim;
          } else {
            w = Math.round(w * (maxDim / h));
            h = maxDim;
          }
        }
        canvas.width = Math.max(1, w);
        canvas.height = Math.max(1, h);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

        // Histogram buckets for quantization, but storing actual raw RGB of the first pixel in bucket
        const buckets: Record<string, { count: number; rawR: number; rawG: number; rawB: number }> = {};

        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const a = imgData[i + 3];

          // 1. Ignore transparent pixels (alpha < 180)
          if (a < 180) continue;

          // 2. Ignore near-white background and highlights
          if (r >= 230 && g >= 230 && b >= 230) continue;

          // 3. Ignore near-black outlines and deep shadows
          if (r <= 45 && g <= 45 && b <= 45) continue;
          
          // 4. Ignore light grayscale (often used in drop shadows or backgrounds)
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          if (max - min < 15 && max > 200) continue;

          // Quantize to 16-step grid to group similar shades
          const qR = r & 0xf0;
          const qG = g & 0xf0;
          const qB = b & 0xf0;
          const key = `${qR},${qG},${qB}`;

          if (!buckets[key]) {
            buckets[key] = { count: 0, rawR: r, rawG: g, rawB: b };
          }
          buckets[key].count++;
        }

        let maxCount = 0;
        let dominantPixel: { rawR: number; rawG: number; rawB: number } | null = null;

        for (const key in buckets) {
          if (buckets[key].count > maxCount) {
            maxCount = buckets[key].count;
            dominantPixel = buckets[key];
          }
        }

        if (dominantPixel) {
          const hex = '#' + [dominantPixel.rawR, dominantPixel.rawG, dominantPixel.rawB]
            .map(x => x.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase();
          resolve(hex);
        } else {
          resolve(null);
        }
      } catch (e) {
        console.error("Error extracting main color:", e);
        resolve(null);
      }
    };
    img.onerror = () => {
      fetch(dataUrl, { mode: 'cors' })
        .then(res => res.blob())
        .then(blob => {
           const blobUrl = URL.createObjectURL(blob);
           const fallbackImg = new Image();
           fallbackImg.onload = () => {
              try {
                const canvas = document.createElement('canvas');
                const maxDim = 300;
                let w = fallbackImg.width;
                let h = fallbackImg.height;
                if (w > maxDim || h > maxDim) {
                  if (w > h) { h = Math.round(h * (maxDim / w)); w = maxDim; }
                  else { w = Math.round(w * (maxDim / h)); h = maxDim; }
                }
                canvas.width = Math.max(1, w);
                canvas.height = Math.max(1, h);
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) return resolve(null);
                ctx.drawImage(fallbackImg, 0, 0, canvas.width, canvas.height);
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                URL.revokeObjectURL(blobUrl);
                
                const buckets: Record<string, { count: number; rawR: number; rawG: number; rawB: number }> = {};
                for (let i = 0; i < imgData.length; i += 4) {
                  const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2], a = imgData[i + 3];
                  if (a < 180) continue;
                  if (r >= 230 && g >= 230 && b >= 230) continue; 
                  if (r <= 45 && g <= 45 && b <= 45) continue;
                  const max = Math.max(r, g, b);
                  const min = Math.min(r, g, b);
                  if (max - min < 15 && max > 200) continue; 
                  const qR = r & 0xf0; const qG = g & 0xf0; const qB = b & 0xf0;
                  const key = `${qR},${qG},${qB}`;
                  if (!buckets[key]) buckets[key] = { count: 0, rawR: r, rawG: g, rawB: b };
                  buckets[key].count++;
                }
                let maxCount = 0; let dominantPixel = null;
                for (const key in buckets) {
                  if (buckets[key].count > maxCount) {
                    maxCount = buckets[key].count;
                    dominantPixel = buckets[key];
                  }
                }
                if (dominantPixel) resolve('#' + [dominantPixel.rawR, dominantPixel.rawG, dominantPixel.rawB].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase());
                else resolve(null);
              } catch(e) { resolve(null); }
           };
           fallbackImg.onerror = () => resolve(null);
           fallbackImg.src = blobUrl;
        })
        .catch(() => resolve(null));
    };
    if (dataUrl.startsWith('data:')) img.removeAttribute('crossOrigin');
    img.src = dataUrl;
  });
}

export async function extractPaletteFromImageDataUrl(url: string, numColors = 5): Promise<string[] | null> {
  return new Promise((resolve, reject) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const maxDim = 300;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round(h * (maxDim / w)); w = maxDim; }
          else { w = Math.round(w * (maxDim / h)); h = maxDim; }
        }
        canvas.width = Math.max(1, w);
        canvas.height = Math.max(1, h);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        
        const buckets: Record<string, { count: number; rawR: number; rawG: number; rawB: number }> = {};
        for (let i = 0; i < imgData.length; i += 4) {
          const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2], a = imgData[i + 3];
          if (a < 180) continue;
          if (r >= 230 && g >= 230 && b >= 230) continue; 
          if (r <= 45 && g <= 45 && b <= 45) continue; 
          
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          if (max - min < 15 && max > 200) continue; 
          
          const qR = Math.floor(r / 32) * 32;
          const qG = Math.floor(g / 32) * 32;
          const qB = Math.floor(b / 32) * 32;
          const key = `${qR},${qG},${qB}`;
          
          if (!buckets[key]) buckets[key] = { count: 0, rawR: r, rawG: g, rawB: b };
          buckets[key].count++;
        }
        
        const sortedBuckets = Object.values(buckets).sort((a, b) => b.count - a.count);
        const selectedColors: typeof sortedBuckets = [];
        for (const bucket of sortedBuckets) {
           if (selectedColors.length >= numColors) break;
           let tooSimilar = false;
           for (const sc of selectedColors) {
             const dist = Math.sqrt(Math.pow(bucket.rawR - sc.rawR, 2) + Math.pow(bucket.rawG - sc.rawG, 2) + Math.pow(bucket.rawB - sc.rawB, 2));
             if (dist < 40) { tooSimilar = true; break; }
           }
           if (!tooSimilar) selectedColors.push(bucket);
        }
        
        const hexColors = selectedColors.map(c => {
          return '#' + [c.rawR, c.rawG, c.rawB].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
        });
        
        resolve(hexColors.length > 0 ? hexColors : null);
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => {
      fetch(url, { mode: 'cors' })
        .then(res => res.blob())
        .then(blob => {
           const blobUrl = URL.createObjectURL(blob);
           const fallbackImg = new Image();
           fallbackImg.onload = () => {
              try {
                const canvas = document.createElement('canvas');
                const maxDim = 300;
                let w = fallbackImg.width;
                let h = fallbackImg.height;
                if (w > maxDim || h > maxDim) {
                  if (w > h) { h = Math.round(h * (maxDim / w)); w = maxDim; }
                  else { w = Math.round(w * (maxDim / h)); h = maxDim; }
                }
                canvas.width = Math.max(1, w);
                canvas.height = Math.max(1, h);
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) return resolve(null);
                ctx.drawImage(fallbackImg, 0, 0, canvas.width, canvas.height);
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                URL.revokeObjectURL(blobUrl);
                
                const buckets: Record<string, { count: number; rawR: number; rawG: number; rawB: number }> = {};
                for (let i = 0; i < imgData.length; i += 4) {
                  const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2], a = imgData[i + 3];
                  if (a < 180) continue;
                  if (r >= 230 && g >= 230 && b >= 230) continue; 
                  if (r <= 45 && g <= 45 && b <= 45) continue;
                  
                  const max = Math.max(r, g, b);
                  const min = Math.min(r, g, b);
                  if (max - min < 15 && max > 200) continue; 
                  
                  const qR = Math.floor(r / 32) * 32;
                  const qG = Math.floor(g / 32) * 32;
                  const qB = Math.floor(b / 32) * 32;
                  const key = `${qR},${qG},${qB}`;
                  
                  if (!buckets[key]) buckets[key] = { count: 0, rawR: r, rawG: g, rawB: b };
                  buckets[key].count++;
                }
                
                const sortedBuckets = Object.values(buckets).sort((a, b) => b.count - a.count);
                const selectedColors: typeof sortedBuckets = [];
                for (const bucket of sortedBuckets) {
                   if (selectedColors.length >= numColors) break;
                   let tooSimilar = false;
                   for (const sc of selectedColors) {
                     const dist = Math.sqrt(Math.pow(bucket.rawR - sc.rawR, 2) + Math.pow(bucket.rawG - sc.rawG, 2) + Math.pow(bucket.rawB - sc.rawB, 2));
                     if (dist < 40) { tooSimilar = true; break; }
                   }
                   if (!tooSimilar) selectedColors.push(bucket);
                }
                
                const hexColors = selectedColors.map(c => {
                  return '#' + [c.rawR, c.rawG, c.rawB].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
                });
                resolve(hexColors.length > 0 ? hexColors : null);
              } catch (err) {
                 reject(err);
              }
           };
           fallbackImg.onerror = () => reject(new Error("Failed to load image for extraction"));
           fallbackImg.src = blobUrl;
        })
        .catch(err => reject(new Error("Image CORS or fetch failure: " + err.message)));
    };
    if (url.startsWith('data:')) img.removeAttribute('crossOrigin');
    img.src = url;
  });
}

export interface WikiEntity {
  id: string;
  name: string;
  createdAt: number;
}

export function mergeWikiEntities(existingEntities: WikiEntity[], chars: Character[], type: 'series' | 'franchise'): WikiEntity[] {
  const map = new Map<string, WikiEntity>();

  (existingEntities || []).forEach(e => {
    if (e && e.name && e.name.trim()) {
      const key = e.name.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, { ...e, name: e.name.trim() });
      }
    }
  });

  (chars || []).forEach(c => {
    const val = (type === 'series' ? c.series : c.company) || '';
    const valId = type === 'series' ? c.seriesId : c.companyId;
    if (val && val.trim()) {
      const trimmed = val.trim();
      const key = trimmed.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          id: valId || `entity_${type}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: trimmed,
          createdAt: Date.now()
        });
      }
    }
  });

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

interface Character {
  seriesId?: string;
  companyId?: string;
  id: string;
  name: string;
  mainColor?: string;
  company: string;
  series: string;
  species: string;
  colors: (string | SampledColor)[];
  notes: string;
  tags: string[]; // Kept for safety
  description?: string;
  imageUrl: string;
  imageStoragePath?: string;
  myDesigns: (string | CharacterImage)[];
}



const processAndUploadImage = async (file: File, user: any, path: string): Promise<{ url: string, storagePath: string } | null> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const max = 1200;
        if (width > max || height > max) {
          if (width > height) {
            height = Math.round(height * (max / width));
            width = max;
          } else {
            width = Math.round(width * (max / height));
            height = max;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(async (blob) => {
            if (blob) {
              const newFile = new File([blob], file.name, { type: 'image/jpeg' });
              const result = await uploadFileToStorage(user.uid, path, newFile);
              resolve({ url: result.url, storagePath: result.path });
            } else {
              resolve(null);
            }
          }, 'image/jpeg', 0.8);
        } else {
          resolve(null);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
};


export function WikiImage({ url, storagePath, alt, className, onRemove }: { url?: string, storagePath?: string, alt: string, className?: string, onRemove?: () => void }) {
  const [imgSrc, setImgSrc] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<'loading' | 'loaded' | 'error' | 'empty'>('loading');
  const [isRetrying, setIsRetrying] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;
    let objectUrl: string | null = null;

    const resolveImg = async () => {
      if (!url && !storagePath) {
        if (isMounted) setStatus('empty');
        return;
      }
      setStatus('loading');

      // Check for IDB
      let idbKey = null;
      if (storagePath && (storagePath.startsWith('idb://') || storagePath.startsWith('photo_'))) {
        idbKey = storagePath.replace('idb://', '');
      } else if (url && url.startsWith('idb://')) {
        idbKey = url.replace('idb://', '');
      }

      if (idbKey) {
        try {
          const { getPhotoFromIDB } = await import('../lib/idb');
          const blob = await getPhotoFromIDB(idbKey);
          if (blob && isMounted) {
            objectUrl = URL.createObjectURL(blob);
            setImgSrc(objectUrl);
            // wait for onLoad to set loaded
            return;
          }
        } catch (e) {}
      }

      if (url && !url.startsWith('idb://')) {
        if (isMounted) {
          setImgSrc(url);
          return;
        }
      }

      if (isMounted) setStatus('error');
    };

    resolveImg();

    return () => {
      isMounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, storagePath]);

  const handleError = async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    
    if (storagePath && !storagePath.startsWith('idb://') && !storagePath.startsWith('photo_')) {
      try {
        const { ref, getDownloadURL } = await import('firebase/storage');
        const { storage } = await import('../lib/firebase');
        const freshUrl = await getDownloadURL(ref(storage, storagePath));
        setImgSrc(freshUrl);
        return;
      } catch (e) {
        setStatus('error');
      }
    } else {
      setStatus('error');
    }
  };

  if (status === 'empty') {
    return (
      <div className={`flex flex-col items-center justify-center bg-[#FFF0F4] text-black/30 ${className}`}>
        <ImageIcon className="w-10 h-10 mb-2" />
        <span className="text-[12px] font-medium px-2 text-center">No image</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={`flex flex-col items-center justify-center bg-red-50 text-red-400 ${className} p-2 text-center relative`}>
        <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
        <div className="px-3 py-1.5 bg-red-100 rounded-lg shadow-sm border border-red-200 cursor-pointer pointer-events-none">
           <span className="text-[12px] font-bold leading-tight">Photo needs to be reuploaded</span>
        </div>
        {onRemove && (
           <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }} className="absolute top-2 right-2 p-1.5 bg-white/90 text-red-500 rounded-full shadow-sm hover:bg-red-100 z-10">
             <X className="w-3 h-3" />
           </button>
        )}
      </div>
    );
  }

  return (
    <>
      {status === 'loading' && (
        <div className={`absolute inset-0 flex items-center justify-center bg-[#FFF0F4] ${className}`}>
          <Loader2 className="w-6 h-6 animate-spin text-[#FFB8CD]" />
        </div>
      )}
      {imgSrc && (
        <img 
          referrerPolicy="no-referrer"
          src={imgSrc} 
          alt={alt} 
          className={className} 
          onError={handleError}
          onLoad={() => setStatus('loaded')}
          style={{ opacity: status === 'loaded' ? 1 : 0 }}
        />
      )}
      {onRemove && status === 'loaded' && (
        <button 
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
          className="absolute top-2 right-2 p-1.5 bg-white/90 text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-50 z-10"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </>
  );
}

export function CharacterWikiView() {

  const { user } = useAuth();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [seriesList, setSeriesList] = useState<WikiEntity[]>([]);
  const [franchiseList, setFranchiseList] = useState<WikiEntity[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [activeFilter, setActiveFilter] = useState('All');
  const [isGrouped, setIsGrouped] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [isGeneratingMissingColors, setIsGeneratingMissingColors] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ total: number, current: number, failed: number } | null>(null);
  const [failedMainColorGenerations, setFailedMainColorGenerations] = useState<string[]>([]);

  const generateMissingColors = async (retryIds?: string[]) => {
    // 1. Filter characters that are missing mainColor and have an imageUrl
    // If retryIds is provided, only process those. Otherwise, process all missing.
    const charsToProcess = characters.filter(c => {
      if (retryIds) return retryIds.includes(c.id);
      return !c.mainColor && c.imageUrl;
    });

    if (charsToProcess.length === 0) {
      alert("All characters with photos already have a main color!");
      return;
    }

    setIsGeneratingMissingColors(true);
    setGenerationProgress({ total: charsToProcess.length, current: 0, failed: 0 });
    
    const newlyFailedIds: string[] = [];
    let currentChars = [...characters];

    for (let i = 0; i < charsToProcess.length; i++) {
      const char = charsToProcess[i];
      let success = false;
      try {
        const hex = await extractMainColorFromImageDataUrl(char.imageUrl);
        if (hex) {
          const charIndex = currentChars.findIndex(c => c.id === char.id);
          if (charIndex > -1) {
            currentChars[charIndex] = { ...currentChars[charIndex], mainColor: hex };
            success = true;
          }
        }
      } catch (e) {
        // failed
      }

      if (!success) {
        newlyFailedIds.push(char.id);
      }

      setGenerationProgress(prev => prev ? { ...prev, current: i + 1, failed: newlyFailedIds.length } : null);

      // Save progressively every 5 items and at the very end
      if (success && (i % 5 === 4 || i === charsToProcess.length - 1)) {
        await saveToFirebase(currentChars);
        setCharacters([...currentChars]);
      }
    }

    // Final save in case the last few didn't hit the mod 5 or were all failures
    await saveToFirebase(currentChars);
    setCharacters(currentChars);
    
    // If we were retrying, we merge the new failures with the ones we didn't retry.
    // If we were not retrying, we just set the new failures.
    if (retryIds) {
       const stillFailed = failedMainColorGenerations.filter(id => !retryIds.includes(id)).concat(newlyFailedIds);
       setFailedMainColorGenerations(stillFailed);
    } else {
       setFailedMainColorGenerations(newlyFailedIds);
    }
    
    setIsGeneratingMissingColors(false);
  };


  useEffect(() => {
    if (!user) return;
    if (user.isAnonymous) {
      setCharacters(GUEST_SAMPLE_CHARACTERS as any);
      setSeriesList(mergeWikiEntities(GUEST_SAMPLE_SERIES, GUEST_SAMPLE_CHARACTERS as any, 'series'));
      setFranchiseList(mergeWikiEntities(GUEST_SAMPLE_FRANCHISES, GUEST_SAMPLE_CHARACTERS as any, 'franchise'));
      setIsLoaded(true);
      return;
    }
    const unsub = onSnapshot(doc(db, `users/${user.uid}/preferences`, 'characterWiki'), async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        let chars = data.characters || [];
        if (chars.length > 0) {
          const cherries = chars.filter((c: any) => c.name?.toLowerCase().trim() === 'cherry');
          if (cherries.length > 1) {
             cherries.sort((a: any, b: any) => Number(a.id) - Number(b.id));
             const original = cherries[0];
             const duplicate = cherries[1];
             const merged = { ...original, ...duplicate, id: original.id };
             chars = chars.filter((c: any) => c.id !== duplicate.id);
             chars = chars.map((c: any) => c.id === original.id ? merged : c);
             
             // Update database to fix the duplicates
             await setDoc(doc(db, `users/${user.uid}/preferences`, 'characterWiki'), { characters: chars }, { merge: true });
          }
          setCharacters(chars);
        }
        const mergedSeries = mergeWikiEntities(data.seriesList || GUEST_SAMPLE_SERIES, chars, 'series');
        const mergedFranchises = mergeWikiEntities(data.franchiseList || GUEST_SAMPLE_FRANCHISES, chars, 'franchise');
        setSeriesList(mergedSeries);
        setFranchiseList(mergedFranchises);
      } else {
        const saved = localStorage.getItem('characterWikiData');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.length > 0) {
              await setDoc(doc(db, `users/${user.uid}/preferences`, 'characterWiki'), { characters: parsed }, { merge: true });
              setCharacters(parsed);
              const mergedSeries = mergeWikiEntities(GUEST_SAMPLE_SERIES, parsed, 'series');
              const mergedFranchises = mergeWikiEntities(GUEST_SAMPLE_FRANCHISES, parsed, 'franchise');
              setSeriesList(mergedSeries);
              setFranchiseList(mergedFranchises);
              localStorage.removeItem('characterWikiData');
            }
          } catch(e) {}
        }
      }
      setIsLoaded(true);
    });
    return () => unsub();
  }, [user]);

  const saveToFirebase = async (newCharacters: Character[], newSeriesList?: WikiEntity[], newFranchiseList?: WikiEntity[]) => {
    const curSeries = newSeriesList || seriesList;
    const curFranchise = newFranchiseList || franchiseList;
    if (!user) return true;
    if (user.isAnonymous) {
      setCharacters(newCharacters);
      if (newSeriesList) setSeriesList(newSeriesList);
      if (newFranchiseList) setFranchiseList(newFranchiseList);
      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 1500);
      return true;
    }
    setSyncStatus('saving');
    try {
      const payload: any = { characters: newCharacters };
      if (curSeries && curSeries.length > 0) payload.seriesList = curSeries;
      if (curFranchise && curFranchise.length > 0) payload.franchiseList = curFranchise;
      await setDoc(doc(db, `users/${user.uid}/preferences`, 'characterWiki'), payload, { merge: true });
      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 2000);
      return true;
    } catch (e: any) {
      setSyncStatus('error');
      console.error('saveToFirebase error:', e);
      throw e;
    }
  };

  const handleSave = async (char: any) => {
    const finalChar = char.id ? char : { ...char, id: Date.now().toString() };
    
    let updatedSeriesList = [...seriesList];
    let updatedFranchiseList = [...franchiseList];

    // Auto-save Series option if typed/selected
    if (finalChar.series && finalChar.series.trim()) {
      const trimmedSeries = finalChar.series.trim();
      const existingSeries = updatedSeriesList.find(s => s.name.toLowerCase() === trimmedSeries.toLowerCase());
      if (existingSeries) {
        finalChar.series = existingSeries.name;
        finalChar.seriesId = existingSeries.id;
      } else {
        const newSeriesId = `series_${Date.now()}`;
        const newEntity: WikiEntity = { id: newSeriesId, name: trimmedSeries, createdAt: Date.now() };
        updatedSeriesList = [...updatedSeriesList, newEntity].sort((a, b) => a.name.localeCompare(b.name));
        finalChar.series = trimmedSeries;
        finalChar.seriesId = newSeriesId;
      }
    }

    // Auto-save Franchise option if typed/selected
    if (finalChar.company && finalChar.company.trim()) {
      const trimmedCompany = finalChar.company.trim();
      const existingFranchise = updatedFranchiseList.find(f => f.name.toLowerCase() === trimmedCompany.toLowerCase());
      if (existingFranchise) {
        finalChar.company = existingFranchise.name;
        finalChar.companyId = existingFranchise.id;
      } else {
        const newFranchiseId = `franchise_${Date.now()}`;
        const newEntity: WikiEntity = { id: newFranchiseId, name: trimmedCompany, createdAt: Date.now() };
        updatedFranchiseList = [...updatedFranchiseList, newEntity].sort((a, b) => a.name.localeCompare(b.name));
        finalChar.company = trimmedCompany;
        finalChar.companyId = newFranchiseId;
      }
    }

    // Deep clone and remove undefined values before saving to Firebase
    const scrubUndefined = (obj: any): any => {
      if (Array.isArray(obj)) return obj.map(scrubUndefined);
      if (obj !== null && typeof obj === 'object') {
        return Object.fromEntries(
          Object.entries(obj)
            .filter(([_, v]) => v !== undefined)
            .map(([k, v]) => [k, scrubUndefined(v)])
        );
      }
      return obj;
    };
    
    const scrubbedChar = scrubUndefined(finalChar);
    
    let newChars;
    if (characters.find((c: any) => c.id === scrubbedChar.id)) {
      newChars = characters.map((c: any) => c.id === scrubbedChar.id ? scrubbedChar : c);
    } else {
      newChars = [...characters, scrubbedChar];
    }
    
    setSeriesList(updatedSeriesList);
    setFranchiseList(updatedFranchiseList);

    await saveToFirebase(newChars, updatedSeriesList, updatedFranchiseList);
    
    if (user && !user.isAnonymous) {
      const docSnap = await getDoc(doc(db, `users/${user.uid}/preferences`, 'characterWiki'));
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.characters) {
          setCharacters(data.characters);
          const reloadedChar = data.characters.find((c: any) => c.id === scrubbedChar.id);
          if (reloadedChar) {
            setSelectedCharacter(reloadedChar);
          } else {
            setSelectedCharacter(scrubbedChar);
          }
        }
        if (data.seriesList) setSeriesList(data.seriesList);
        if (data.franchiseList) setFranchiseList(data.franchiseList);
      } else {
        setCharacters(newChars);
        setSelectedCharacter(scrubbedChar);
      }
    } else {
      setCharacters(newChars);
      setSelectedCharacter(scrubbedChar);
    }
    
    setIsEditing(false);
  };

  const handleDelete = (id: string) => {
    const newChars = characters.filter(c => c.id !== id);
    setCharacters(newChars);
    saveToFirebase(newChars);
    setSelectedCharacter(null);
    setIsEditing(false);
  };

  const companies = React.useMemo(() => {
    const compSet = new Set<string>();
    characters.forEach(c => {
      if (c.company && c.company.trim()) {
        compSet.add(c.company.trim());
      }
    });
    return ['All', ...Array.from(compSet).sort((a, b) => a.localeCompare(b))];
  }, [characters]);

  const groupedCharacters = React.useMemo(() => {
    if (!isGrouped) return null;
    const groups: Record<string, any[]> = {};
    const filtered = characters.filter(char => {
      const sq = (searchQuery || '').toLowerCase();
      const matchesSearch = (char.name || '').toLowerCase().includes(sq) || 
                            (char.series || '').toLowerCase().includes(sq) ||
                            (char.tags || []).some(t => (t || '').toLowerCase().includes(sq));
      if (!matchesSearch) return false;
      if (activeFilter === 'All') return true;
      return (char.company || '').trim() === activeFilter;
    });

    filtered.forEach(char => {
      const series = (char.series || 'Uncategorized').trim();
      const key = series === '' ? 'Uncategorized' : series;
      if (!groups[key]) groups[key] = [];
      groups[key].push(char);
    });
    return groups;
  }, [characters, searchQuery, activeFilter, isGrouped]);

  const filteredCharacters = characters.filter(char => {
    const sq = (searchQuery || '').toLowerCase();
    const matchesSearch = (char.name || '').toLowerCase().includes(sq) || 
                          (char.series || '').toLowerCase().includes(sq) ||
                          (char.tags || []).some(t => (t || '').toLowerCase().includes(sq));
    
    if (!matchesSearch) return false;

    if (activeFilter === 'All') return true;
    return (char.company || '').trim() === activeFilter;
  });

  return (
    <div className="flex-1 md:overflow-y-auto px-margin-mobile md:px-margin-desktop pb-safe-nav relative bg-transparent">
      <SyncStatus status={syncStatus} />
      {selectedCharacter ? (
        <CharacterDetail 
          character={selectedCharacter} 
          user={user}
          onClose={() => setSelectedCharacter(null)}
          onEdit={() => setIsEditing(true)}
          onDelete={() => handleDelete(selectedCharacter.id)}
          onUpdate={(updated) => handleSave(updated)}
        />
      ) : (
        <>
          <div className="md:hidden mt-4 mb-8 flex justify-between items-center">
            <h2 className="text-[32px] leading-[1.2] font-bold font-headline-lg-mobile text-black m-0">Character Wiki</h2>
            <div className="flex gap-2">
              {characters.some(c => !c.mainColor && c.imageUrl) && (
                <button 
                  onClick={() => generateMissingColors()}
                  disabled={isGeneratingMissingColors}
                  className="p-2 bg-white border border-[#FFB8CD]/50 text-[#FFB8CD] rounded-full shadow-sm disabled:opacity-50"
                  title="Generate Missing Colors"
                >
                  <Wand2 className="w-6 h-6" />
                </button>
              )}
              <button 
                onClick={() => { setSelectedCharacter(null); setIsEditing(true); }}
                className="p-2 bg-[#FFB8CD] text-white rounded-full shadow-sm"
              >
                <Plus className="w-6 h-6" />
              </button>
            </div>
          </div>
          <div className="hidden md:flex mt-8 mb-8 justify-between items-end">
            <h2 className="text-[40px] leading-[1.2] font-bold font-headline-lg text-black m-0 tracking-tight">Character Wiki</h2>
            <div className="flex gap-3">
              {characters.some(c => !c.mainColor && c.imageUrl) && (
                <button 
                  onClick={() => generateMissingColors()}
                  disabled={isGeneratingMissingColors}
                  className="px-6 py-2.5 bg-white text-black font-bold font-label-md rounded-full shadow-[0_4px_14px_rgba(255,184,205,0.4)] hover:bg-[#FFF0F4] transition-colors flex items-center gap-2 border border-[#FFB8CD]/30 disabled:opacity-50"
                >
                  <Wand2 className="w-5 h-5 text-[#FFB8CD]" /> Generate Missing Colors
                </button>
              )}
              <button 
                onClick={() => { setSelectedCharacter(null); setIsEditing(true); }}
                className="px-6 py-2.5 bg-white text-black font-bold font-label-md rounded-full shadow-[0_4px_14px_rgba(255,184,205,0.4)] hover:bg-[#FFF0F4] transition-colors flex items-center gap-2 border border-[#FFB8CD]/30"
              >
                <Plus className="w-5 h-5" /> Add Character
              </button>
            </div>
          </div>

          {isGeneratingMissingColors && generationProgress && (
            <div className="bg-[#FFF0F4] border border-[#FFB8CD]/50 rounded-2xl p-4 mb-6 flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in zoom-in-95">
              <div className="flex items-center gap-3 text-black">
                <Loader2 className="w-5 h-5 animate-spin text-[#FFB8CD]" />
                <span className="font-semibold">Processing characters... ({generationProgress.current} / {generationProgress.total})</span>
              </div>
              {generationProgress.failed > 0 && (
                <span className="text-sm font-medium text-red-500 bg-red-50 px-3 py-1 rounded-full">
                  Failed: {generationProgress.failed}
                </span>
              )}
            </div>
          )}

          {!isGeneratingMissingColors && failedMainColorGenerations.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in zoom-in-95">
              <div className="flex flex-col gap-1 text-black">
                <span className="font-semibold text-red-600">Could not extract colors for {failedMainColorGenerations.length} character{failedMainColorGenerations.length > 1 ? 's' : ''}.</span>
                <span className="text-sm text-red-500/80">
                  {characters.filter(c => failedMainColorGenerations.includes(c.id)).map(c => c.name).join(', ')}
                </span>
              </div>
              <button 
                onClick={() => generateMissingColors(failedMainColorGenerations)}
                className="px-4 py-2 bg-red-100 text-red-600 font-bold rounded-xl hover:bg-red-200 transition-colors shrink-0"
              >
                Retry Failed
              </button>
            </div>
          )}

          <div className="flex flex-col gap-4 mb-8">
                      <div className="flex gap-4 mb-8 items-center overflow-x-auto pb-2 scrollbar-hide w-full" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="relative w-64 md:w-80 shrink-0">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-black/40" />
              <input 
                placeholder="Search characters, series, tags..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-[#FFB8CD]/50 rounded-full py-2.5 pl-11 pr-4 text-black focus:outline-none focus:border-[#FFB8CD] shadow-sm font-body-md text-[14px]"
              />
            </div>
            
            <div className="flex gap-2 shrink-0 items-center">
              <button
                onClick={() => setActiveFilter('All')}
                className={`shrink-0 px-4 py-2 rounded-full whitespace-nowrap text-[14px] font-semibold transition-colors ${
                  activeFilter === 'All' 
                    ? 'bg-[#FFB8CD] text-white shadow-sm' 
                    : 'bg-white text-black hover:bg-[#FFF0F4] border border-[#FFB8CD]/30'
                }`}
              >
                All
              </button>

              <button
                onClick={() => setIsGrouped(!isGrouped)}
                className={`shrink-0 px-4 py-2 rounded-full whitespace-nowrap text-[14px] font-semibold transition-colors ${
                  isGrouped 
                    ? 'bg-[#FFB8CD] text-white shadow-sm' 
                    : 'bg-white text-black hover:bg-[#FFF0F4] border border-[#FFB8CD]/30'
                }`}
              >
                Grouped
              </button>

              <div className="w-px h-6 bg-[#FFB8CD]/50 mx-1 shrink-0" />

              {companies.filter(c => c !== 'All').map(filter => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(activeFilter === filter ? 'All' : filter)}
                  className={`shrink-0 px-4 py-2 rounded-full whitespace-nowrap text-[14px] font-semibold transition-colors ${
                    activeFilter === filter 
                      ? 'bg-[#FF6B9E] text-white shadow-sm border border-[#FF6B9E]' 
                      : 'bg-white text-black hover:bg-[#FFF0F4] border border-[#FFB8CD]/30'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
          </div>

          {!isLoaded ? (
            <div className="w-full bg-white/50 backdrop-blur-sm p-12 rounded-2xl border border-[#FFB8CD]/30 flex flex-col items-center justify-center text-center">
              <div className="w-8 h-8 border-4 border-[#FF6B9E] border-t-transparent rounded-full animate-spin mb-4" />
              <h3 className="text-[18px] font-bold text-black mb-2">Loading...</h3>
            </div>
          ) : filteredCharacters.length === 0 ? (
            <div className="w-full bg-white/50 backdrop-blur-sm p-12 rounded-2xl border border-[#FFB8CD]/30 flex flex-col items-center justify-center text-center">
              <ImageIcon className="w-12 h-12 text-black/20 mb-4" />
              <h3 className="text-[18px] font-bold text-black mb-2">No characters found</h3>
              <p className="text-[15px] text-black/60 max-w-md">Try adjusting your search or filters, or add a new character to your wiki.</p>
            </div>
          ) : isGrouped && groupedCharacters ? (
            <div className="flex flex-col gap-8">
              {Object.keys(groupedCharacters).sort((a,b) => {
                if (a === 'Uncategorized') return 1;
                if (b === 'Uncategorized') return -1;
                return a.localeCompare(b);
              }).map(seriesName => (
                <div key={seriesName}>
                  <h3 className="text-[20px] font-bold text-black mb-4 flex items-center gap-2">
                    {seriesName} <span className="text-[14px] font-medium text-black/40 bg-black/5 px-2 py-0.5 rounded-full">{groupedCharacters[seriesName].length}</span>
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 3xl:grid-cols-8 gap-4 md:gap-6">
                    {groupedCharacters[seriesName].map(char => (
                      <CharacterWikiCard key={char.id} char={char} onClick={() => setSelectedCharacter(char)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 3xl:grid-cols-8 gap-4 md:gap-6">
              {filteredCharacters.map(char => (
                <CharacterWikiCard key={char.id} char={char} onClick={() => setSelectedCharacter(char)} />
              ))}
            </div>
          )}
        </>
      )}

      {isEditing && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 md:p-6 bg-black/40 backdrop-blur-sm pointer-events-auto overflow-hidden">
          <CharacterForm 
            initialData={selectedCharacter}
            existingCharacters={characters}
            seriesList={seriesList}
            franchiseList={franchiseList}
            onSave={handleSave}
            onSaveEntity={async (type, entities) => {
              if (!user) return;
              if (type === 'series') setSeriesList(entities);
              else setFranchiseList(entities);
              if (user.isAnonymous) return;
              const update = type === 'series' ? { seriesList: entities } : { franchiseList: entities };
              await setDoc(doc(db, `users/${user.uid}/preferences`, 'characterWiki'), update, { merge: true });
            }}
            onRenameEntity={async (type, id, newName) => {
              if (!user) return;
              const newChars = characters.map(c => {
                 if (type === 'series' && c.seriesId === id) {
                   return { ...c, series: newName };
                 }
                 if (type === 'franchise' && c.companyId === id) {
                   return { ...c, company: newName };
                 }
                 return c;
              });
              setCharacters(newChars);
              if (user.isAnonymous) return;
              if (newChars.some((c, i) => c !== characters[i])) {
                 await setDoc(doc(db, `users/${user.uid}/preferences`, 'characterWiki'), { characters: newChars }, { merge: true });
              }
            }}
            onDeleteEntity={async (type, id) => {
              if (!user) return;
              const newChars = characters.map(c => {
                 if (type === 'series' && c.seriesId === id) {
                   return { ...c, seriesId: undefined, series: '' };
                 }
                 if (type === 'franchise' && c.companyId === id) {
                   return { ...c, companyId: undefined, company: '' };
                 }
                 return c;
              });
              setCharacters(newChars);
              if (user.isAnonymous) return;
              if (newChars.some((c, i) => c !== characters[i])) {
                 await setDoc(doc(db, `users/${user.uid}/preferences`, 'characterWiki'), { characters: newChars }, { merge: true });
              }
            }}
            onCancel={() => {
              setIsEditing(false);
              if (!selectedCharacter) setSelectedCharacter(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

function CharacterDetail({ character, onClose, onEdit, onDelete, onUpdate, user }: { character: Character, onClose: () => void, onEdit: () => void, onDelete: () => void, onUpdate: (c: Character) => void, user: any }) {
  const handleImageUpload = async (e: any) => {
    const files = e.target.files;
    if (files && user) {
      const newDesigns = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const res = await processAndUploadImage(file, user, `users/${user.uid}/characterWiki/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`);
        if (res) newDesigns.push(res);
      }
      if (newDesigns.length > 0) {
        onUpdate({ ...character, myDesigns: [...(character.myDesigns || []), ...newDesigns] });
      }
    }
  };

  const removeDesign = async (index: number) => {
    const newDesigns = [...(character.myDesigns || [])];
    const removed = newDesigns.splice(index, 1)[0];
    if (typeof removed !== 'string' && removed.storagePath) {
      await deleteFileFromStorage(removed.storagePath);
    }
    onUpdate({ ...character, myDesigns: newDesigns });
  };

  const [viewingImage, setViewingImage] = useState<{ url: string, storagePath?: string, title?: string, allImages?: ImageToView[], zipTitle?: string } | null>(null);

  // Determine saved main color and palette (check both colors and additionalPalette for backward compatibility)
  const mainColorHex = character.mainColor ? formatHex(character.mainColor) || character.mainColor : null;
  const savedPalette = (character.colors && character.colors.length > 0)
    ? character.colors
    : ((character as any).additionalPalette || []);

  return (
    <div className="bg-white rounded-[2rem] shadow-[0_8px_32px_rgba(255,184,205,0.3)] border border-[#FFB8CD]/30 overflow-hidden flex flex-col md:flex-row min-h-[600px] animate-in fade-in zoom-in-95 duration-200">
      {/* Left sidebar / Image area */}
      <div className="w-full md:w-1/3 bg-[#FFF0F4] flex flex-col relative shrink-0 border-b md:border-b-0 md:border-r border-[#FFB8CD]/30">
        <button onClick={onClose} className="absolute top-4 left-4 p-2 rounded-full bg-white/80 backdrop-blur-sm shadow-sm hover:bg-white transition-colors z-10 md:hidden">
          <ChevronLeft className="w-5 h-5 text-black" />
        </button>
        
        <div 
          className="aspect-square md:aspect-auto md:flex-1 relative flex items-center justify-center p-8 wiki-character-image-container cursor-pointer"
          onClick={() => {
            if (character.imageUrl) {
              setViewingImage({
                url: character.imageUrl,
                storagePath: character.imageStoragePath,
                title: `${character.name} Character Photo`,
                allImages: (character.myDesigns || []).map((d, idx) => ({
                  url: typeof d === 'string' ? d : d.url,
                  storagePath: typeof d === 'string' ? undefined : d.storagePath,
                  title: `${character.name} Design ${idx + 1}`
                })).concat([{ url: character.imageUrl, storagePath: character.imageStoragePath, title: `${character.name} Main Photo` }]),
                zipTitle: `${character.name}_Photos.zip`
              });
            }
          }}
        >
          {character.imageUrl ? (
            <WikiImage url={character.imageUrl} storagePath={character.imageStoragePath} alt={character.name} className="w-full h-full object-contain drop-shadow-md max-h-[400px]" />
          ) : (
            <div className="flex flex-col items-center gap-3 text-black/30">
              <ImageIcon className="w-16 h-16" />
              <p className="text-[14px] font-medium">No main image</p>
            </div>
          )}
        </div>
        
        <div className="p-6 bg-white/50 backdrop-blur-sm border-t border-[#FFB8CD]/20">
          <h2 className="text-[28px] font-bold font-headline-md text-black leading-tight mb-1">{character.name}</h2>
          
          {character.description && (
            <div className="mb-4 text-[14px] leading-relaxed text-black/80 whitespace-pre-wrap">
              {character.description}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={onEdit} className="flex-1 py-2.5 bg-white border border-[#FFB8CD]/50 rounded-xl text-black font-semibold text-[14px] flex items-center justify-center gap-2 hover:bg-[#FFF0F4] transition-colors">
              <Edit className="w-4 h-4" /> Edit
            </button>
            <button onClick={() => { if(window.confirm('Delete this character?')) onDelete() }} className="p-2.5 bg-white border border-red-200 text-red-500 rounded-xl hover:bg-red-50 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Right content area */}
      <div className="flex-1 p-6 md:p-10">
        <div className="hidden md:flex justify-between items-center mb-8">
          <button onClick={onClose} className="flex items-center gap-2 text-black/60 hover:text-black font-semibold text-[14px] transition-colors">
            <ChevronLeft className="w-4 h-4" /> Back to Wiki
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
          <div className="space-y-6">
            <h3 className="text-[18px] font-bold text-black border-b border-[#FFB8CD]/30 pb-2">Details</h3>
            
            <div className="space-y-4">
              <InfoRow label="Franchise" value={character.company} />
              <InfoRow label="Series" value={character.series} />
              <InfoRow label="Species" value={character.species} />
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-[18px] font-bold text-black border-b border-[#FFB8CD]/30 pb-2">Design Palette</h3>
            
            {mainColorHex && (
              <div className="mb-6">
                <h4 className="text-[12px] font-bold uppercase tracking-wider text-black/50 mb-3">Main Color</h4>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full border border-black/10 shadow-sm" style={{ backgroundColor: mainColorHex }} />
                  <span className="text-[14px] font-mono font-bold text-black/70">{mainColorHex}</span>
                </div>
              </div>
            )}
            
            <div>
              <h4 className="text-[12px] font-bold uppercase tracking-wider text-black/50 mb-3">Additional Palette</h4>
              <div className="flex flex-wrap gap-3 items-center">
                {savedPalette.length > 0 ? (
                  savedPalette.map((color: any, i: number) => {
                    const isObj = typeof color === 'object';
                    const rawHex = isObj ? color.hex : color;
                    const hex = formatHex(rawHex) || rawHex;
                    const name = isObj && color.name ? color.name : hex;
                    return (
                      <div key={i} className="flex flex-col items-center gap-1.5 relative group">
                        <div className="w-6 h-6 rounded-full border shadow-sm shrink-0" style={{ backgroundColor: hex, borderColor: 'rgba(0,0,0,0.08)' }} />
                        <span className="text-[11px] font-mono font-medium text-black/60 uppercase max-w-[70px] truncate text-center" title={name}>{name}</span>
                        {isObj && color.photoUrl && (
                          <div className="absolute top-14 left-1/2 -translate-x-1/2 w-48 bg-white p-2 rounded-xl shadow-lg border border-outline-variant/30 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                            <p className="text-[10px] font-bold text-black/40 uppercase mb-1">Sampled from:</p>
                            <div className="relative w-full h-24 bg-surface rounded-lg overflow-hidden flex items-center justify-center">
                              <img src={color.photoUrl} className="max-h-full object-contain" />
                              {color.point && (
                                <div 
                                  className="absolute w-3 h-3 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
                                  style={{ 
                                    left: `${color.point.x}%`, 
                                    top: `${color.point.y}%`,
                                    transform: 'translate(-50%, -50%)',
                                    backgroundColor: hex
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-[14px] text-black/40 italic">No additional colors</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <ImageUploaderArea
          onUpload={(files) => {
            handleImageUpload({ target: { files } });
          }}
          className="w-full h-full min-h-[300px]"
        >
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-[18px] font-bold text-black border-b border-[#FFB8CD]/30 pb-2 flex-1 mr-4">My Designs</h3>
              <label className="cursor-pointer px-4 py-2 bg-[#FFB8CD] hover:bg-[#FFB8CD]/90 text-white text-[13px] font-bold rounded-full transition-colors flex items-center gap-2 shadow-sm">
                <Upload className="w-4 h-4" /> Upload
                <input type="file" multiple accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
              {(character.myDesigns || []).map((designUrl, i) => (
                <div 
                  key={i} 
                  className="aspect-square relative rounded-xl overflow-hidden border border-[#FFB8CD]/30 shadow-sm group bg-[#FFF0F4] cursor-pointer"
                  onClick={() => {
                    const u = typeof designUrl === "string" ? designUrl : designUrl.url;
                    const sp = typeof designUrl === "string" ? undefined : designUrl.storagePath;
                    setViewingImage({
                      url: u,
                      storagePath: sp,
                      title: `${character.name} Design ${i + 1}`,
                      allImages: (character.myDesigns || []).map((d, idx) => ({
                        url: typeof d === "string" ? d : d.url,
                        storagePath: typeof d === "string" ? undefined : d.storagePath,
                        title: `${character.name} Design ${idx + 1}`
                      })),
                      zipTitle: `${character.name}_Designs.zip`
                    });
                  }}
                >
                  <WikiImage url={typeof designUrl === "string" ? designUrl : designUrl.url} storagePath={typeof designUrl === "string" ? undefined : designUrl.storagePath} alt={`Design ${i+1}`} className="w-full h-full object-cover" onRemove={() => removeDesign(i)} />
                </div>
              ))}
              {(!character.myDesigns || character.myDesigns.length === 0) && (
                <div className="col-span-full py-8 text-center bg-white border border-dashed border-[#FFB8CD] rounded-xl flex flex-col items-center gap-2">
                  <ImageIcon className="w-8 h-8 text-[#FFB8CD]" />
                  <p className="text-[14px] text-black/50 font-medium">No designs uploaded yet.</p>
                  <p className="text-[12px] text-black/40">Upload your nail art or keychains here!</p>
                </div>
              )}
            </div>
          </div>
        </ImageUploaderArea>
      </div>

      {viewingImage && (
        <ImageViewerModal
          image={{
            url: viewingImage.url,
            storagePath: viewingImage.storagePath,
            title: viewingImage.title || `${character.name} Image`,
            filename: `${character.name}_image`
          }}
          allImages={viewingImage.allImages}
          zipTitle={viewingImage.zipTitle}
          onClose={() => setViewingImage(null)}
        />
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string, value: string | undefined }) {
  if (!value) return null;
  return (
    <div className="flex py-2 border-b border-black/5 last:border-0">
      <span className="w-1/3 text-[13px] font-bold text-black/50 uppercase tracking-wider">{label}</span>
      <span className="w-2/3 text-[15px] text-black font-medium">{value}</span>
    </div>
  );
}

function CharacterForm({ initialData, existingCharacters, seriesList, franchiseList, onSave, onSaveEntity, onRenameEntity, onDeleteEntity, onCancel }: { 
  initialData: Character | null, 
  existingCharacters: Character[], 
  seriesList: WikiEntity[], 
  franchiseList: WikiEntity[], 
  onSave: (data: Omit<Character, 'id'>) => Promise<void> | void, 
  onSaveEntity: (type: 'series'|'franchise', entities: WikiEntity[]) => Promise<void>,
  onDeleteEntity: (type: 'series'|'franchise', id: string) => Promise<void>,
  onRenameEntity: (type: 'series'|'franchise', id: string, newName: string) => Promise<void>,
  onCancel: () => void 
}) {
  const [isSaving, setIsSaving] = useState(false);
  const { user } = useAuth();
  const [formData, setFormData] = useState<Omit<Character, 'id'>>(() => {
    if (initialData) {
      const main = initialData.mainColor || (initialData as any).additionalPalette?.mainColor || '';
      const cols = (initialData.colors && initialData.colors.length > 0)
        ? initialData.colors
        : ((initialData as any).additionalPalette || []);
      return {
        name: initialData.name || '',
        mainColor: main,
        colors: cols,
        tags: initialData.tags || [],
        description: initialData.description || '',
        company: initialData.company || '',
        companyId: initialData.companyId,
        series: initialData.series || '',
        seriesId: initialData.seriesId,
        species: initialData.species || '',
        imageUrl: initialData.imageUrl || '',
        imageStoragePath: initialData.imageStoragePath || '',
        notes: initialData.notes || '',
        myDesigns: initialData.myDesigns || []
      };
    }
    return {
      name: '',
      mainColor: '',
      colors: [],
      tags: [],
      description: '',
      company: '',
      series: '',
      species: '',
      imageUrl: '',
      imageStoragePath: '',
      notes: '',
      myDesigns: []
    };
  });

  const [colorInput, setColorInput] = useState('');
  const [showSampler, setShowSampler] = useState(false);

  React.useEffect(() => {
    if (initialData?.imageUrl && (!initialData.colors || initialData.colors.length === 0) && !formData.colors?.length) {
      // Automatically generate colors for existing character with image but no palette
      const autoGen = async () => {
         try {
           const palette = await extractPaletteFromImageDataUrl(initialData.imageUrl!);
           if (palette && palette.length > 0) {
             setFormData(prev => {
                if (prev.colors && prev.colors.length > 0) return prev; // don't overwrite if user added one mean time
                return {
                  ...prev,
                  colors: palette.map((hex: string, i: number) => ({ hex, name: `Color ${i+1}` }))
                };
             });
           }
         } catch (e) {
           console.error("Auto generation failed", e);
         }
      };
      autoGen();
    }
  }, [initialData]);


  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const [isGeneratingMainColor, setIsGeneratingMainColor] = useState(false);
  const [showMainColorSampler, setShowMainColorSampler] = useState(false);

  const generateMainColorFromImage = async (url: string) => {
    if (!url) return;
    setIsGeneratingMainColor(true);
    try {
      const color = await extractMainColorFromImageDataUrl(url);
      if (color) {
        setFormData(prev => ({ ...prev, mainColor: color }));
      }
    } catch (e) {
      console.error("Error generating main color", e);
    } finally {
      setIsGeneratingMainColor(false);
    }
  };

  const [isGeneratingColors, setIsGeneratingColors] = useState(false);

  const generateColorsFromImage = async (url: string) => {
    if (!url) return;
    
    if (formData.colors && formData.colors.length > 0) {
      const confirm = window.confirm("You already have colors in your palette. Do you want to overwrite them with a newly generated color scheme?");
      if (!confirm) return;
    }

    setIsGeneratingColors(true);
    try {
      const palette = await extractPaletteFromImageDataUrl(url);
      if (palette && palette.length > 0) {
         setFormData(prev => ({
            ...prev,
            colors: palette.map((hex: string, i: number) => ({ hex, name: `Color ${i+1}` }))
         }));
      } else {
        alert("Failed to extract colors from image. It may be too small or have restricted access.");
      }
    } catch (e: any) {
      console.error("Error generating colors", e);
      alert(`Error extracting colors: ${e.message || 'Unknown error'}`);
    } finally {
      setIsGeneratingColors(false);
    }
  };
  const handleMainImageUpload = async (e: any) => {
    const file = e.target.files?.[0];
    if (file) {
      // 1. Instant client-side main color extraction from local file data URL
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        if (dataUrl) {
          const detectedHex = await extractMainColorFromImageDataUrl(dataUrl);
          if (detectedHex) {
            setFormData(prev => ({ ...prev, mainColor: detectedHex }));
          }
          const palette = await extractPaletteFromImageDataUrl(dataUrl);
          if (palette && palette.length > 0) {
            setFormData(prev => {
              const currentHexes = (prev.colors || []).map(c => typeof c === 'string' ? c.toUpperCase() : c.hex.toUpperCase());
              const newColors = [...(prev.colors || [])];
              palette.forEach(hex => {
                if (!currentHexes.includes(hex.toUpperCase())) {
                   newColors.push(hex);
                }
              });
              return { ...prev, colors: newColors };
            });
          }
        }
      };
      reader.readAsDataURL(file);

      // 2. Upload file to storage
      if (user) {
        const res = await processAndUploadImage(file, user, `users/${user.uid}/characterWiki/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`);
        if (res) {
          setFormData(prev => ({ ...prev, imageUrl: res.url, imageStoragePath: res.storagePath }));
        }
      }
    }
  };

  const addColor = () => {
    const formatted = formatHex(colorInput);
    if (!formatted) {
      alert('Please enter a valid 6-character hex code (e.g. #FFB8CD)');
      return;
    }
    const currentHexes = (formData.colors || []).map(c => typeof c === 'string' ? c.toUpperCase() : c.hex.toUpperCase());
    if (!currentHexes.includes(formatted)) {
      setFormData(prev => ({ ...prev, colors: [...(prev.colors || []), formatted] }));
    }
    setColorInput('');
  };

  const removeColor = (color: string | SampledColor) => {
    setFormData(prev => ({ 
      ...prev, 
      colors: prev.colors.filter(c => c !== color) 
    }));
  };

  return (
    <div className="w-full max-w-2xl max-h-[85vh] sm:max-h-[80vh] my-auto bg-white rounded-2xl md:rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.18)] border border-[#FFB8CD]/40 flex flex-col animate-in fade-in zoom-in-95 duration-200 box-border overflow-hidden">
      <div className="flex justify-between items-center px-4 py-3 md:px-5 md:py-3.5 border-b border-[#FFB8CD]/30 shrink-0 bg-[#FFF0F4]/40">
        <h2 className="text-[18px] md:text-[20px] font-bold font-headline-md text-black m-0">{initialData ? 'Edit Character' : 'Add New Character'}</h2>
        <button onClick={onCancel} className="p-1.5 hover:bg-[#FFF0F4] rounded-full transition-colors text-black/60 shrink-0 cursor-pointer" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 p-4 md:p-5 space-y-4 min-h-0">
        <div className="flex flex-col md:flex-row gap-4 md:gap-5">
        <div className="w-full md:w-[170px] shrink-0 space-y-2">
          <div className="box-border max-w-full">
            <label className="block text-[11px] font-bold text-black/60 uppercase tracking-wider mb-1">Main Image</label>
            <ImageUploaderArea
              onUpload={(files) => {
                if (files && files.length > 0) {
                  handleMainImageUpload({ target: { files } });
                }
              }}
              className="w-full box-border"
            >
              <div className="w-full aspect-square max-w-[170px] mx-auto md:mx-0 bg-[#FFF0F4] rounded-xl border-2 border-dashed border-[#FFB8CD] flex flex-col items-center justify-center relative overflow-hidden group wiki-character-image-container">
              {formData.imageUrl ? (
                <>
                  <WikiImage url={formData.imageUrl} storagePath={formData.imageStoragePath} alt="Preview" className="w-full h-full object-contain" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-white font-bold text-[12px]">Change Image</span>
                  </div>
                </>
              ) : (
                <div className="text-center p-3">
                  <ImageIcon className="w-8 h-8 text-[#FFB8CD] mx-auto mb-1" />
                  <span className="text-[#FFB8CD] font-bold text-[12px]">Upload Image</span>
                </div>
              )}
              <input type="file" accept="image/*" onChange={handleMainImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
              </div>
            </ImageUploaderArea>
          </div>
        </div>

        <div className="flex-1 space-y-3 box-border min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start box-border max-w-full">
            <FormInput label="Name *" name="name" value={formData.name} onChange={handleChange} placeholder="e.g. Hello Kitty" required />
            <FormInput label="Species / Type" name="species" value={formData.species} onChange={handleChange} placeholder="e.g. White cat, Bear" />
            
            <div className="relative z-20">
              <EntitySelector 
                label="Franchise" 
                entities={franchiseList} 
                valueId={formData.companyId}
                fallbackName={formData.company}
                placeholder="e.g. Sanrio, Nintendo"
                inUseIds={existingCharacters.map(c => c.companyId).filter(Boolean) as string[]}
                onChange={(id, name) => setFormData(prev => ({ ...prev, companyId: id, company: name }))}
                onCreate={async (name) => {
                  const newId = Date.now().toString();
                  await onSaveEntity('franchise', [...franchiseList, { id: newId, name, createdAt: Date.now() }]);
                  return newId;
                }}
                onRename={async (id, newName) => {
                  await onSaveEntity('franchise', franchiseList.map(e => e.id === id ? { ...e, name: newName } : e));
                  await onRenameEntity('franchise', id, newName);
                  if (formData.companyId === id) setFormData(prev => ({ ...prev, company: newName }));
                  return true;
                }}
                onDelete={async (id) => {
                  await onSaveEntity('franchise', franchiseList.filter(e => e.id !== id));
                  await onDeleteEntity('franchise', id);
                  if (formData.companyId === id) setFormData(prev => ({ ...prev, companyId: undefined, company: '' }));
                  return true;
                }}
              />
            </div>

            <div className="relative z-10">
              <EntitySelector 
                label="Series" 
                entities={seriesList} 
                valueId={formData.seriesId}
                fallbackName={formData.series}
                placeholder="e.g. Rilakkuma, Mario"
                inUseIds={existingCharacters.map(c => c.seriesId).filter(Boolean) as string[]}
                onChange={(id, name) => setFormData(prev => ({ ...prev, seriesId: id, series: name }))}
                onCreate={async (name) => {
                  const newId = Date.now().toString();
                  await onSaveEntity('series', [...seriesList, { id: newId, name, createdAt: Date.now() }]);
                  return newId;
                }}
                onRename={async (id, newName) => {
                  await onSaveEntity('series', seriesList.map(e => e.id === id ? { ...e, name: newName } : e));
                  await onRenameEntity('series', id, newName);
                  if (formData.seriesId === id) setFormData(prev => ({ ...prev, series: newName }));
                  return true;
                }}
                onDelete={async (id) => {
                  await onSaveEntity('series', seriesList.filter(e => e.id !== id));
                  await onDeleteEntity('series', id);
                  if (formData.seriesId === id) setFormData(prev => ({ ...prev, seriesId: undefined, series: '' }));
                  return true;
                }}
              />
            </div>
            
            <div className="sm:col-span-2 relative z-0 box-border max-w-full">
              <div className="flex flex-wrap justify-between items-center mb-1 gap-2">
                <label className="block text-[11px] font-bold text-black/60 uppercase tracking-wider m-0 leading-tight">Main Color</label>
                {formData.imageUrl && (
                  <button 
                    type="button" 
                    onClick={() => generateMainColorFromImage(formData.imageUrl)}
                    disabled={isGeneratingMainColor}
                    className="text-[#FFB8CD] hover:text-[#FFB8CD]/80 flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                    title="Auto detect dominant main color from image"
                  >
                    {isGeneratingMainColor ? <Loader2 className="w-3 h-3 animate-spin shrink-0" /> : <Wand2 className="w-3 h-3 shrink-0" />}
                    <span className="whitespace-nowrap">{isGeneratingMainColor ? 'Detecting...' : 'Auto Detect'}</span>
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                {/* Visual color swatch button tied to hidden color input */}
                <div className="relative w-8 h-8 shrink-0">
                  <input 
                    type="color" 
                    name="mainColor"
                    value={formatHex(formData.mainColor || '') || '#FFB8CD'}
                    onChange={(e) => {
                      const hex = e.target.value.toUpperCase();
                      setFormData(prev => ({ ...prev, mainColor: hex }));
                    }}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                  />
                  <div 
                    className="w-8 h-8 rounded-lg border border-[#FFB8CD]/50 shadow-sm transition-transform hover:scale-105 pointer-events-none"
                    style={{ backgroundColor: formatHex(formData.mainColor || '') || '#FFB8CD' }}
                  />
                </div>
                <input 
                  type="text" 
                  name="mainColor"
                  value={formData.mainColor || ''} 
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData(prev => ({ ...prev, mainColor: val }));
                  }}
                  placeholder="#FFB8CD"
                  className="flex-1 min-w-[90px] bg-white border border-[#FFB8CD]/50 rounded-lg px-2.5 py-1.5 text-[13px] text-black focus:outline-none focus:border-[#FFB8CD] shadow-sm font-medium font-mono uppercase box-border"
                />
                <button 
                  type="button" 
                  onClick={() => setShowMainColorSampler(true)} 
                  className="px-2.5 py-1.5 bg-[#FFF0F4] border border-[#FFB8CD]/50 text-[#FF6B9E] rounded-lg font-bold shadow-sm hover:bg-[#FFB8CD]/20 transition-colors flex items-center gap-1 shrink-0 cursor-pointer" 
                  title="Pick color from image with Eyedropper"
                >
                  <Droplet className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] hidden sm:inline">Eyedropper</span>
                </button>
              </div>
              {showMainColorSampler && (
                <ColorSampler 
                  initialImageUrl={formData.imageUrl}
                  onSave={(colorData) => {
                    const hex = typeof colorData === 'string' ? colorData : colorData.hex;
                    const formatted = formatHex(hex);
                    if (formatted) {
                      setFormData(prev => ({ ...prev, mainColor: formatted }));
                    }
                    setShowMainColorSampler(false);
                  }} 
                  onCancel={() => setShowMainColorSampler(false)} 
                />
              )}
            </div>
          </div>

          <div className="w-full relative z-0 space-y-3 box-border max-w-full mt-2">
            {/* Additional Palette */}
            <div className="box-border max-w-full">
              <div className="flex flex-wrap justify-between items-center mb-1 gap-2">
                <label className="block text-[11px] font-bold text-black/60 uppercase tracking-wider m-0">Additional Palette</label>
                {formData.imageUrl && (
                  <button 
                    type="button" 
                    onClick={() => generateColorsFromImage(formData.imageUrl)}
                    disabled={isGeneratingColors}
                    className="text-[#FFB8CD] hover:text-[#FFB8CD]/80 flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                    title="Auto generate palette from image"
                  >
                    {isGeneratingColors ? <Loader2 className="w-3 h-3 animate-spin shrink-0" /> : <Wand2 className="w-3 h-3 shrink-0" />}
                    <span className="whitespace-nowrap">{isGeneratingColors ? 'Generating...' : 'Auto Palette'}</span>
                  </button>
                )}
              </div>
              
              <div className="flex flex-wrap gap-2 mb-2 items-center">
                {/* Visual Swatch for new palette color */}
                <div className="relative w-8 h-8 shrink-0">
                  <input 
                    type="color" 
                    value={formatHex(colorInput) || '#FFB8CD'}
                    onChange={(e) => setColorInput(e.target.value.toUpperCase())}
                    className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                  />
                  <div 
                    className="w-8 h-8 rounded-lg border border-[#FFB8CD]/50 shadow-sm pointer-events-none"
                    style={{ backgroundColor: formatHex(colorInput) || '#FFB8CD' }}
                  />
                </div>

                <input 
                  type="text" 
                  value={colorInput}
                  onChange={e => setColorInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addColor())}
                  placeholder="#FFB8CD"
                  className="flex-1 min-w-[80px] bg-white border border-[#FFB8CD]/50 rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:border-[#FFB8CD] font-mono uppercase box-border"
                />
                
                <button type="button" onClick={addColor} className="px-3 py-1.5 bg-[#FFB8CD] text-white rounded-lg font-bold shadow-sm hover:bg-[#FFB8CD]/90 text-[12px] shrink-0 cursor-pointer">
                  Add
                </button>
                
                <button 
                  type="button" 
                  onClick={() => setShowSampler(true)} 
                  className="px-2.5 py-1.5 bg-[#FFF0F4] border border-[#FFB8CD]/50 text-[#FF6B9E] rounded-lg font-bold shadow-sm hover:bg-[#FFB8CD]/20 transition-colors flex items-center gap-1 shrink-0 cursor-pointer" 
                  title="Pick color from image with Eyedropper"
                >
                  <Droplet className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px] hidden sm:inline">Eyedropper</span>
                </button>
                {formData.imageUrl && (
                  <button 
                    type="button" 
                    onClick={() => generateColorsFromImage(formData.imageUrl)} 
                    disabled={isGeneratingColors}
                    className="px-2.5 py-1.5 bg-[#FFF0F4] border border-[#FFB8CD]/50 text-[#FF6B9E] rounded-lg font-bold shadow-sm hover:bg-[#FFB8CD]/20 transition-colors flex items-center gap-1 shrink-0 cursor-pointer" 
                    title="Generate palette from image"
                  >
                    <span className="text-[11px] hidden sm:inline">{isGeneratingColors ? 'Generating...' : 'Regenerate'}</span>
                  </button>
                )}
              </div>
              
              {showSampler && (
                <ColorSampler 
                  initialImageUrl={formData.imageUrl}
                  onSave={(colorData) => {
                    const hex = typeof colorData === 'string' ? colorData : colorData.hex;
                    const formatted = formatHex(hex);
                    if (formatted) {
                      const currentHexes = (formData.colors || []).map(c => typeof c === 'string' ? c.toUpperCase() : c.hex.toUpperCase());
                      if (!currentHexes.includes(formatted)) {
                        setFormData(prev => ({ ...prev, colors: [...(prev.colors || []), formatted] }));
                      }
                    }
                    setShowSampler(false);
                  }} 
                  onCancel={() => setShowSampler(false)} 
                />
              )}

              {/* Palette Chips */}
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {(formData.colors || []).map((color, i) => {
                  const isObj = typeof color === 'object';
                  const rawHex = isObj ? color.hex : color;
                  const formattedHex = formatHex(rawHex) || rawHex;
                  return (
                    <div key={i} className="flex items-center gap-1.5 bg-[#FFF0F4] border border-[#FFB8CD]/50 rounded-full pl-1 pr-2 py-1 group relative shadow-sm box-border">
                      {/* Swatch color input for tweaking existing chip */}
                      <div className="relative w-5 h-5 shrink-0 rounded-full overflow-hidden border border-black/10">
                        <input 
                          type="color" 
                          value={formattedHex}
                          onChange={(e) => {
                            const newHex = e.target.value.toUpperCase();
                            setFormData(prev => {
                              const newColors = [...prev.colors];
                              const oldColor = newColors[i];
                              if (typeof oldColor === 'object') {
                                newColors[i] = { ...oldColor, hex: newHex };
                              } else {
                                newColors[i] = newHex;
                              }
                              return { ...prev, colors: newColors };
                            });
                          }}
                          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer z-10"
                        />
                        <div className="w-full h-full pointer-events-none" style={{ backgroundColor: formattedHex }} />
                      </div>

                      <span className="text-[11px] font-mono font-bold text-black/80 uppercase">{formattedHex}</span>
                      
                      <button 
                        type="button" 
                        onClick={() => removeColor(color as any)} 
                        className="text-black/40 hover:text-red-500 hover:bg-white rounded-full p-0.5 transition-colors shrink-0 cursor-pointer"
                        title="Remove color chip"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Description */}
            <div className="box-border max-w-full">
              <label className="block text-[11px] font-bold text-black/60 uppercase tracking-wider mb-1">Description</label>
              <textarea 
                name="description"
                value={formData.description || ''}
                onChange={handleChange}
                placeholder="Write a description of this character..."
                className="w-full bg-white border border-[#FFB8CD]/50 rounded-lg px-3 py-2 text-[13px] text-black focus:outline-none focus:border-[#FFB8CD] box-border resize-none min-h-[70px]"
                rows={3}
              />
            </div>
          </div>
        </div>
      </div>
    </div>

      <div className="border-t border-[#FFB8CD]/30 px-4 py-2.5 md:px-5 md:py-3 flex justify-end gap-2.5 box-border shrink-0 bg-[#FFF0F4]/40 rounded-b-2xl md:rounded-b-3xl z-10">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-[13px] font-bold text-black/60 hover:text-black hover:bg-[#FFF0F4] rounded-lg transition-colors shrink-0 cursor-pointer">
          Cancel
        </button>
        <button 
          type="button" 
          disabled={isSaving}
          onClick={async () => {
            if (!formData.name) return alert('Name is required');

            let sanitizedMainColor = '';
            if (formData.mainColor) {
              const formatted = formatHex(formData.mainColor);
              if (!formatted) {
                alert('Main Color must be a valid 6-character hex code (e.g. #FFB8CD)');
                return;
              }
              sanitizedMainColor = formatted.toUpperCase();
            }

            const uniqueColors = new Set<string>();
            (formData.colors || []).forEach(c => {
              const rawHex = typeof c === 'string' ? c : c?.hex;
              if (rawHex) {
                const formatted = formatHex(rawHex);
                if (formatted && isValidHex(formatted)) {
                  uniqueColors.add(formatted.toUpperCase());
                }
              }
            });
            const sanitizedColors = Array.from(uniqueColors);

            const payload: any = {
              ...(initialData || {}),
              ...formData,
              mainColor: sanitizedMainColor,
              colors: sanitizedColors,
              additionalPalette: sanitizedColors
            };

            if (initialData?.id) {
              payload.id = initialData.id;
            }

            // Firebase throws an error if any field is undefined.
            Object.keys(payload).forEach(key => {
              if (payload[key] === undefined) {
                delete payload[key];
              }
            });

            setIsSaving(true);
            try {
              console.log('Saving character payload:', payload);
              await onSave(payload);
            } catch (err: any) {
              console.error('Save error:', err);
              alert(`Error saving character: ${err.message || err}`);
            } finally {
              setIsSaving(false);
            }
          }} 
          className="px-5 py-2 bg-[#FFB8CD] hover:bg-[#FFB8CD]/90 disabled:opacity-50 text-white text-[13px] font-bold rounded-lg shadow-[0_4px_14px_rgba(255,184,205,0.4)] transition-colors shrink-0 cursor-pointer"
        >
          {isSaving ? 'Saving...' : (user?.isAnonymous ? 'Test Save' : 'Save Character')}
        </button>
      </div>
    </div>
  );
}


function FormInput({ label, name, value, onChange, placeholder, required }: any) {
  return (
    <div className="box-border max-w-full">
      <label className="block text-[11px] font-bold text-black/60 uppercase tracking-wider mb-1 whitespace-normal leading-tight">{label}</label>
      <input 
        type="text" 
        name={name}
        value={value || ''} 
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full bg-white border border-[#FFB8CD]/50 rounded-lg px-3 py-2 text-black focus:outline-none focus:border-[#FFB8CD] shadow-sm font-medium text-[13px] box-border"
      />
    </div>
  );
}


function CharacterWikiCard({ char, onClick }: { char: any, onClick: () => void, key?: any }) {
  const colors: string[] = [];
  if (char.mainColor) {
    const isObj = typeof char.mainColor === 'object';
    const hex = isObj ? (char.mainColor as any).hex : char.mainColor;
    if (hex && typeof hex === 'string' && hex.trim()) {
      colors.push(hex.trim());
    }
  }

  const rawPalette = (char.colors && char.colors.length > 0)
    ? char.colors
    : ((char as any).additionalPalette || []);

  if (Array.isArray(rawPalette)) {
    rawPalette.forEach((c: any) => {
      const isObj = typeof c === 'object';
      const hex = isObj ? c.hex : c;
      if (hex && typeof hex === 'string' && hex.trim()) {
        const cleanHex = hex.trim();
        if (!colors.some(existing => existing.toLowerCase() === cleanHex.toLowerCase())) {
          colors.push(cleanHex);
        }
      }
    });
  }

  return (
    <div 
      onClick={onClick}
      className="bg-white rounded-2xl overflow-hidden cursor-pointer group transition-all duration-300 hover:-translate-y-1 shadow-[0_4px_14px_rgba(255,184,205,0.25)] hover:shadow-[0_8px_24px_rgba(255,184,205,0.4)] border border-[#FFB8CD]/20 flex flex-col h-full"
    >
      <div className="aspect-square relative bg-[#FFF0F4] flex items-center justify-center overflow-hidden wiki-character-image-container">
        {char.imageUrl ? (
          <WikiImage url={char.imageUrl} storagePath={char.imageStoragePath} alt={char.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
        ) : (
          <ImageIcon className="w-10 h-10 text-black/10" />
        )}
      </div>
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-bold text-[16px] text-black mb-1 leading-tight">{char.name}</h3>
        <p className="text-[12px] font-medium text-black/50 mb-3 line-clamp-1">{char.company} • {char.series}</p>
        
        <div className="mt-auto flex items-center gap-1.5 flex-wrap">
          {colors.slice(0, 5).map((color, index) => (
            <span
              key={`${color}-${index}`}
              title={color}
              className="border border-black/10 shadow-sm"
              style={{
                backgroundColor: color,
                width: index === 0 ? "20px" : "10px",
                height: index === 0 ? "20px" : "10px",
                minWidth: index === 0 ? "20px" : "10px",
                minHeight: index === 0 ? "20px" : "10px",
                maxWidth: index === 0 ? "20px" : "10px",
                maxHeight: index === 0 ? "20px" : "10px",
                borderRadius: "50%",
                flexShrink: 0,
                display: "inline-block",
                boxSizing: "border-box"
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
