import { useState, useEffect } from 'react';
import { getPhotoFromIDB } from '../lib/idb';
import { storage, auth } from '../lib/firebase';
import { ref, getDownloadURL } from 'firebase/storage';
import { resolveAndRepairImage } from '../lib/imageService';
import { fetchDriveFileWithAuth, getCachedBlobUrl, setCachedBlobUrl } from '../lib/driveImageUtils';

// Global memory cache for resolved Firebase Storage / HTTP / IDB URLs
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

const isTempUrl = (url?: string) => {
  if (!url) return false;
  return url.startsWith('blob:') || url.startsWith('file:');
};

export const useImageCache = (storagePath?: string, src?: string, driveFileId?: string) => {
  // Synchronous initial displayUrl determination to avoid re-render flashing
  const [displayUrl, setDisplayUrl] = useState<string | null>(() => {
    const cleanDriveId = (driveFileId || '').trim();
    const cleanStoragePath = (storagePath || '').trim();
    const cleanSrc = (src || '').trim();

    // 1. Check Google Drive memory cache
    if (cleanDriveId) {
      const cachedDrive = getCachedBlobUrl(cleanDriveId);
      if (cachedDrive) return cachedDrive;
    }

    // 2. Check storagePath / src memory cache
    if (cleanStoragePath && imageCache.has(cleanStoragePath)) {
      const cached = imageCache.get(cleanStoragePath);
      if (typeof cached === 'string') return cached;
    }
    if (cleanSrc && imageCache.has(cleanSrc)) {
      const cached = imageCache.get(cleanSrc);
      if (typeof cached === 'string') return cached;
    }

    // 3. If cleanSrc is valid HTTP/HTTPS/data/blob URL, return it immediately
    if (cleanSrc && !cleanSrc.startsWith('idb://') && !cleanSrc.startsWith('photo_')) {
      return cleanSrc;
    }

    return null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(() => {
    // Only set loading if no displayUrl is present and we have an identifier to fetch
    if (displayUrl) return false;
    const cleanDriveId = (driveFileId || '').trim();
    const cleanStoragePath = (storagePath || '').trim();
    const cleanSrc = (src || '').trim();
    return !!(cleanDriveId || cleanStoragePath || (cleanSrc && (cleanSrc.startsWith('idb://') || cleanSrc.startsWith('photo_'))));
  });

  const [hasError, setHasError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const cleanDriveId = (driveFileId || '').trim();
    const cleanStoragePath = (storagePath || '').trim();
    const cleanSrc = (src || '').trim();

    // 1. If we already have a valid displayUrl, ensure state is updated without clearing image
    if (displayUrl) {
      if (cleanDriveId && getCachedBlobUrl(cleanDriveId) === displayUrl) {
        setIsLoading(false);
        setHasError(false);
        return;
      }
      if (cleanStoragePath && imageCache.get(cleanStoragePath) === displayUrl) {
        setIsLoading(false);
        setHasError(false);
        return;
      }
      if (cleanSrc && !isTempUrl(cleanSrc) && displayUrl === cleanSrc) {
        setIsLoading(false);
        setHasError(false);
        return;
      }
    }

    // 2. Drive File ID primary fetch
    if (cleanDriveId) {
      const cached = getCachedBlobUrl(cleanDriveId);
      if (cached) {
        setDisplayUrl(cached);
        setIsLoading(false);
        setHasError(false);
        return;
      }

      if (!displayUrl) setIsLoading(true);
      setHasError(false);

      fetchDriveFileWithAuth(cleanDriveId)
        .then(url => {
          if (active) {
            setDisplayUrl(url);
            setIsLoading(false);
            setHasError(false);
          }
        })
        .catch(async err => {
          console.warn(`[useImageCache] Drive fetch failed for ${cleanDriveId}, attempting storage/repair fallback:`, err);
          
          // Fallback to storagePath or src if available
          if (cleanStoragePath) {
            try {
              const url = await getCachedImageUrl(cleanStoragePath);
              if (active) {
                setDisplayUrl(url);
                setIsLoading(false);
                setHasError(false);
                return;
              }
            } catch (_) {}
          }

          if (cleanSrc && !isTempUrl(cleanSrc)) {
            if (active) {
              setDisplayUrl(cleanSrc);
              setIsLoading(false);
              setHasError(false);
              return;
            }
          }

          if (active) {
            setIsLoading(false);
            setHasError(true);
            setErrorMessage(err?.message || 'Drive fetch failed');
          }
        });

      return () => { active = false; };
    }

    // 3. Storage Path secondary fetch
    if (cleanStoragePath) {
      const cached = imageCache.get(cleanStoragePath);
      if (typeof cached === 'string') {
        setDisplayUrl(cached);
        setIsLoading(false);
        setHasError(false);
        return;
      }

      if (!displayUrl) setIsLoading(true);
      setHasError(false);

      getCachedImageUrl(cleanStoragePath)
        .then(url => {
          if (active) {
            setDisplayUrl(url);
            setIsLoading(false);
            setHasError(false);
          }
        })
        .catch(async err => {
          console.warn(`[useImageCache] Storage path load failed for ${cleanStoragePath}:`, err);
          if (cleanSrc && !isTempUrl(cleanSrc)) {
            if (active) {
              setDisplayUrl(cleanSrc);
              setIsLoading(false);
              setHasError(false);
              return;
            }
          }
          if (active) {
            setIsLoading(false);
            setHasError(true);
            setErrorMessage(err?.message || 'Storage fetch failed');
          }
        });

      return () => { active = false; };
    }

    // 4. Fallback to src
    if (cleanSrc && !isTempUrl(cleanSrc)) {
      setDisplayUrl(cleanSrc);
      setIsLoading(false);
      setHasError(false);
    } else if (cleanSrc && isTempUrl(cleanSrc)) {
      setDisplayUrl(cleanSrc);
      setIsLoading(false);
      setHasError(false);
    } else {
      setIsLoading(false);
      setHasError(true);
      setErrorMessage('No valid photo URL or Drive ID');
    }

    return () => { active = false; };
  }, [storagePath, src, driveFileId]);

  const retry = async () => {
    const cleanDriveId = (driveFileId || '').trim();
    const cleanStoragePath = (storagePath || '').trim();
    const cleanSrc = (src || '').trim();

    if (!cleanDriveId && !cleanStoragePath && !cleanSrc) return;

    if (!displayUrl) setIsLoading(true);
    setHasError(false);
    setErrorMessage(null);

    if (cleanDriveId) {
      try {
        const url = await fetchDriveFileWithAuth(cleanDriveId);
        setDisplayUrl(url);
        setHasError(false);
      } catch (err: any) {
        console.error(`[useImageCache] Retry failed for driveFileId ${cleanDriveId}:`, err);
        setHasError(true);
        setErrorMessage(err?.message || 'Drive retry failed');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (cleanStoragePath) {
      imageCache.delete(cleanStoragePath);
      try {
        const url = await getCachedImageUrl(cleanStoragePath);
        setDisplayUrl(url);
        setHasError(false);
      } catch (err: any) {
        console.error(`[useImageCache] Retry failed for storagePath ${cleanStoragePath}:`, err);
        setHasError(true);
        setErrorMessage(err?.message || 'Storage retry failed');
      } finally {
        setIsLoading(false);
      }
      return;
    }
  };

  return { displayUrl, isLoading, hasError, errorMessage, retry };
};
