import { storage, auth } from './firebase';
import { ref, deleteObject } from 'firebase/storage';
import { savePhotoToIDB, deletePhotoFromIDB } from './idb';
import { uploadImageToService } from './imageService';
import { v4 as uuidv4 } from 'uuid';

export const compressImageIfNeeded = async (file: File): Promise<File> => {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    return file;
  }
  
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return file;
  }

  // If file is already small (under 1MB), skip canvas re-encoding
  if (file.size <= 1024 * 1024) {
    return file;
  }

  return new Promise<File>((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 2048;
      let width = img.width;
      let height = img.height;

      if (width <= maxDim && height <= maxDim && file.size <= 1.5 * 1024 * 1024) {
        resolve(file);
        return;
      }

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size < file.size) {
            const compressedName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
            const compressedFile = new File([blob], compressedName, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            resolve(compressedFile);
          } else {
            resolve(file);
          }
        },
        'image/jpeg',
        0.85
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
};

export const withTimeout = <T>(promise: Promise<T>, timeoutMs = 25000, errorMessage = "Request timed out"): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);

    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

export const fileToDataUrl = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
};

export const uploadFileToStorage = async (
  userId: string, 
  path: string, 
  file: File,
  onProgress?: (percent: number) => void,
  onDebugLog?: (msg: string) => void
): Promise<{ url: string, path: string, driveFileId?: string | null }> => {
  const log = (msg: string) => {
    console.log(`[Storage] ${msg}`);
    if (onDebugLog) onDebugLog(msg);
  };

  log(`Processing upload for ${file.name}`);
  const targetFile = await compressImageIfNeeded(file);

  // Parse section and recordId from path if available
  const pathParts = (path || '').split('/').filter(Boolean);
  const section = pathParts.length > 2 ? pathParts[2] : (pathParts[0] || 'general');
  const recordId = pathParts.length > 3 ? pathParts[3] : uuidv4().substring(0, 8);

  // Use primary Firebase + Drive centralized image service for authenticated users
  if (userId && userId !== 'guest') {
    try {
      const result = await uploadImageToService({
        file: targetFile,
        userId,
        section,
        recordId,
        filename: targetFile.name,
        onProgress
      });
      log(`Primary storage upload complete: ${result.downloadURL}`);
      return { url: result.downloadURL, path: result.storagePath, driveFileId: result.driveFileId };
    } catch (err: any) {
      log(`Primary storage warning: ${err?.message || err}. Checking fallback...`);
      if (auth.currentUser?.isAnonymous || String(err).includes('storage/unauthorized') || String(err).includes('timed out')) {
        log(`Falling back to local IndexedDB...`);
        const idbKey = `photo_${Date.now()}_${uuidv4().substring(0, 8)}_${file.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
        await savePhotoToIDB(idbKey, file);
        if (onProgress) onProgress(100);
        return { url: `idb://${idbKey}`, path: idbKey, driveFileId: null };
      }
      throw new Error(`Upload failed: ${err?.message || String(err)}`);
    }
  }

  // Guest mode fallback
  log(`Guest mode active: saving photo to browser IndexedDB storage...`);
  const idbKey = `photo_${Date.now()}_${uuidv4().substring(0, 8)}_${file.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
  try {
    await withTimeout(
      savePhotoToIDB(idbKey, file),
      10000,
      "IndexedDB storage timed out"
    );
    if (onProgress) onProgress(100);
    const guestUrl = `idb://${idbKey}`;
    log(`Storage upload complete (Guest IDB)`);
    return { url: guestUrl, path: idbKey, driveFileId: null };
  } catch (err: any) {
    throw new Error(`Guest upload failed: ${err?.message || String(err)}`);
  }
};

export const dataUrlToBlob = (dataUrl: string): Blob => {
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(parts[1] || parts[0]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
};

export const uploadDataUrlToStorage = async (
  userId: string,
  path: string,
  dataUrl: string,
  onProgress?: (percent: number) => void
): Promise<{ url: string, path: string, driveFileId?: string | null }> => {
  try {
    const pathParts = (path || '').split('/').filter(Boolean);
    const section = pathParts.length > 2 ? pathParts[2] : (pathParts[0] || 'general');
    const recordId = pathParts.length > 3 ? pathParts[3] : uuidv4().substring(0, 8);

    const result = await uploadImageToService({
      dataUrl,
      userId,
      section,
      recordId,
      onProgress
    });
    return { url: result.downloadURL, path: result.storagePath, driveFileId: result.driveFileId };
  } catch (e: any) {
    console.error("Failed to convert or upload data URL to Blob for storage upload:", e);
    throw new Error(`Data URL upload failed: ${e?.message || 'Unknown error'}`);
  }
};

export const deleteFileFromStorage = async (path: string): Promise<void> => {
  if (!path) return;
  if (path.startsWith('idb://') || path.startsWith('photo_')) {
    const key = path.replace('idb://', '');
    await deletePhotoFromIDB(key).catch(() => {});
    return;
  }
  try {
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
  } catch (error) {
    console.warn("Ignoring error deleting file from storage:", error);
  }
};
