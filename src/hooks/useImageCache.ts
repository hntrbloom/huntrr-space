import { useState, useEffect } from 'react';
import { getPhotoFromIDB } from '../lib/idb';
import { storage, auth } from '../lib/firebase';
import { ref, getDownloadURL } from 'firebase/storage';
import { resolveAndRepairImage } from '../lib/imageService';

// Global cache for resolved image URLs
const imageCache = new Map<string, string | Promise<string>>();

export const getCachedImageUrl = async (path: string): Promise<string> => {
  if (!path) return '';
  
  if (imageCache.has(path)) {
    const cached = imageCache.get(path)!;
    if (typeof cached === 'string') return cached;
    return cached; // wait for in-progress resolution
  }

  const resolvePromise = (async () => {
    try {
      // 1. Handle IndexedDB Fallbacks (Guest Mode / Offline Cache)
      if (path.startsWith('idb://') || path.startsWith('photo_')) {
        const key = path.replace('idb://', '');
        const blob = await getPhotoFromIDB(key);
        if (blob) {
          const objUrl = URL.createObjectURL(blob);
          imageCache.set(path, objUrl);
          return objUrl;
        }
        throw new Error(`IDB photo not found: ${key}`);
      }

      // 2. Handle Normal HTTP/Data URLs
      if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
        imageCache.set(path, path);
        return path;
      }

      // 3. Handle Firebase Storage Paths
      const cleanPath = path.startsWith('gs://') 
        ? path.replace(/^gs:\/\/[^/]+\//, '') 
        : path;
      
      const storageRef = ref(storage, cleanPath);
      const url = await getDownloadURL(storageRef);
      imageCache.set(path, url);
      return url;
    } catch (error) {
      imageCache.delete(path);
      throw error;
    }
  })();

  imageCache.set(path, resolvePromise);
  return resolvePromise;
};

export const prefetchImages = (paths: string[]) => {
  paths.forEach(path => {
    if (path && !imageCache.has(path)) {
      getCachedImageUrl(path).catch(err => {
        console.warn(`[Prefetch Error] Failed to prefetch ${path}:`, err);
      });
    }
  });
};

export const useImageCache = (storagePath?: string, src?: string, driveFileId?: string) => {
  const [displayUrl, setDisplayUrl] = useState<string | null>(() => {
    const targetPath = (storagePath || src || '').trim();
    if (!targetPath) return null;
    
    if (src && !src.startsWith('idb://') && !src.startsWith('photo_') && !storagePath) {
      return src;
    }
    
    if (imageCache.has(targetPath)) {
      const cached = imageCache.get(targetPath);
      if (typeof cached === 'string') {
        return cached;
      }
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(!displayUrl && !!(storagePath || src));
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    const targetPath = (storagePath || src || '').trim();

    if (!targetPath) {
      setDisplayUrl(null);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    if (imageCache.has(targetPath)) {
      const cached = imageCache.get(targetPath);
      if (typeof cached === 'string') {
        setDisplayUrl(cached);
        setIsLoading(false);
        setHasError(false);
        return;
      }
    }

    if (src && !storagePath && !src.startsWith('idb://') && !src.startsWith('photo_')) {
      setDisplayUrl(src);
      setIsLoading(false);
      setHasError(false);
      return;
    }

    setIsLoading(true);
    setHasError(false);

    getCachedImageUrl(targetPath)
      .then(url => {
        if (active) {
          setDisplayUrl(url);
          setIsLoading(false);
        }
      })
      .catch(async err => {
        console.warn(`[useImageCache] Initial load failed for ${targetPath}, attempting auto-repair:`, err);
        // Auto repair from Firebase or Drive backup
        try {
          const userId = auth.currentUser?.uid || 'guest';
          const repaired = await resolveAndRepairImage({ downloadURL: src, storagePath, driveFileId }, userId);
          if (repaired && active) {
            setDisplayUrl(repaired);
            setIsLoading(false);
            setHasError(false);
            return;
          }
        } catch (_) {}

        if (active) {
          setDisplayUrl(null);
          setHasError(true);
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [storagePath, src, driveFileId]);

  const retry = async () => {
    const targetPath = (storagePath || src || '').trim();
    if (!targetPath && !driveFileId) return;
    
    setIsLoading(true);
    setHasError(false);
    
    if (targetPath) imageCache.delete(targetPath);
    
    try {
      const userId = auth.currentUser?.uid || 'guest';
      const repaired = await resolveAndRepairImage({ downloadURL: src, storagePath, driveFileId }, userId);
      if (repaired) {
        setDisplayUrl(repaired);
        setHasError(false);
        return;
      }
      throw new Error("Repair returned no valid URL");
    } catch (err) {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  return { displayUrl, isLoading, hasError, retry };
};
