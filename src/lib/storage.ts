import { storage, auth } from './firebase';
import { ref, deleteObject } from 'firebase/storage';
import { savePhotoToIDB, deletePhotoFromIDB } from './idb';
import { uploadImageToService } from './imageService';
import { v4 as uuidv4 } from 'uuid';

export const compressImageIfNeeded = async (file: File): Promise<File> => {
  const isHeic = /\.(heic|heif)$/i.test(file.name) || /image\/(heic|heif)/i.test(file.type);
  if (!file.type.startsWith('image/') && !isHeic) return file;
  if (/image\/(gif|svg\+xml)/i.test(file.type)) return file;

  let source: Blob = file;
  if (isHeic) {
    try {
      const { default: heic2any } = await import('heic2any');
      const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
      source = Array.isArray(converted) ? converted[0] : converted;
    } catch (error) {
      console.warn('[Storage] HEIC conversion unavailable; uploading original file.', error);
      return file;
    }
  }
  try {
    const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    if (!isHeic && scale === 1 && file.size <= 900_000) {
      bitmap.close();
      return file;
    }
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true });
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const compressedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', 0.85);
    });
    canvas.width = 1;
    canvas.height = 1;
    if (!compressedBlob || (!isHeic && compressedBlob.size >= file.size * 0.95)) return file;
    const baseName = file.name.replace(/\.[^/.]+$/, '') || 'photo_' + Date.now();
    return new File([compressedBlob], baseName + '.webp', {
      type: 'image/webp',
      lastModified: file.lastModified,
    });
  } catch (error) {
    console.warn('[Storage] Image compression skipped.', error);
    return file;
  }
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

  if (onProgress) onProgress(2);
  const optimizedFile = await compressImageIfNeeded(file);
  if (optimizedFile !== file) {
    const savedPercent = Math.max(0, Math.round((1 - optimizedFile.size / file.size) * 100));
    log('Optimized ' + file.name + ': ' + formatBytes(file.size) + ' -> ' + formatBytes(optimizedFile.size) + ' (' + savedPercent + '% smaller)');
  }
  if (onProgress) onProgress(10);

  // Parse section and recordId from path if available
  const pathParts = (path || '').split('/').filter(Boolean);
  const section = pathParts.length > 2 ? pathParts[2] : (pathParts[0] || 'general');
  const recordId = pathParts.length > 3 ? pathParts[3] : uuidv4().substring(0, 8);

  // Use primary Firebase + Drive centralized image service for authenticated users
  if (userId && userId !== 'guest') {
    try {
      const result = await uploadImageToService({
        file: optimizedFile,
        userId,
        section,
        recordId,
        filename: optimizedFile.name,
        onProgress
      });
      log(`Primary storage upload complete: ${result.downloadURL}`);
      return { url: result.downloadURL, path: result.storagePath, driveFileId: result.driveFileId };
    } catch (err: any) {
      log(`Primary storage warning: ${err?.message || err}. Checking fallback...`);
      if (auth.currentUser?.isAnonymous || String(err).includes('storage/unauthorized') || String(err).includes('timed out')) {
        log(`Falling back to local IndexedDB...`);
        const idbKey = `photo_${Date.now()}_${uuidv4().substring(0, 8)}_${file.name.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
        await savePhotoToIDB(idbKey, optimizedFile);
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
      savePhotoToIDB(idbKey, optimizedFile),
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

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};
