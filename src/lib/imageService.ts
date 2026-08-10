import { storage, db } from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, doc, getDocs, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getAccessToken } from './AuthContext';
import { v4 as uuidv4 } from 'uuid';

export interface ImageMetaData {
  storagePath: string;
  downloadURL: string;
  driveFileId: string | null;
  mimeType: string;
  filename: string;
  status: 'ready' | 'uploading' | 'error' | 'unrecoverable';
}

export interface MigrationReport {
  totalScanned: number;
  recovered: number;
  unrecoverable: number;
  details: string[];
}

// Timeout helper
export const withTimeout = <T>(promise: Promise<T>, timeoutMs = 20000, errorMessage = "Operation timed out"): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
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

// Convert Data URL / Base64 to Blob
export function dataURLtoBlob(dataurl: string): { blob: Blob; mimeType: string } {
  const arr = dataurl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return { blob: new Blob([u8arr], { type: mimeType }), mimeType };
}

// Convert File or Blob to Base64 String
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      const base64 = res.split(',')[1] || res;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Centralized upload service that stores images in Firebase Storage and backs them up to Google Drive.
 */
export async function uploadImageToService({
  file,
  dataUrl,
  userId,
  section,
  recordId,
  filename,
  onProgress
}: {
  file?: File | Blob | null;
  dataUrl?: string | null;
  userId: string;
  section: string;
  recordId: string;
  filename?: string;
  onProgress?: (progress: number) => void;
}): Promise<ImageMetaData> {
  if (onProgress) onProgress(10);

  let targetBlob: Blob;
  let targetMimeType = 'image/jpeg';
  let targetFilename = filename || (file && (file as File).name) || `photo_${Date.now()}.jpg`;

  if (file) {
    targetBlob = file;
    targetMimeType = file.type || 'image/jpeg';
  } else if (dataUrl && dataUrl.startsWith('data:')) {
    const converted = dataURLtoBlob(dataUrl);
    targetBlob = converted.blob;
    targetMimeType = converted.mimeType;
  } else {
    throw new Error('No valid file or data URL provided for upload');
  }

  // Sanitize filename
  const cleanName = targetFilename.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const uniqueId = uuidv4().substring(0, 8);
  const storagePath = `users/${userId}/photos/${section}/${recordId}/${uniqueId}-${cleanName}`;

  if (onProgress) onProgress(25);

  // 1. Upload to Firebase Storage
  const storageRef = ref(storage, storagePath);
  const snapshot = await withTimeout(
    uploadBytes(storageRef, targetBlob, { contentType: targetMimeType }),
    20000,
    `Firebase storage upload timed out for ${cleanName}`
  );

  if (onProgress) onProgress(65);

  // 2. Get download URL from Firebase Storage
  const downloadURL = await withTimeout(
    getDownloadURL(snapshot.ref),
    10000,
    `Failed to retrieve download URL for ${cleanName}`
  );

  if (onProgress) onProgress(80);

  // 3. Backup to Google Drive asynchronously via secure backend API
  let driveFileId: string | null = null;
  try {
    const accessToken = getAccessToken();
    if (accessToken) {
      const base64Data = await blobToBase64(targetBlob);
      const res = await fetch('/api/drive/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section,
          filename: `${uniqueId}-${cleanName}`,
          mimeType: targetMimeType,
          base64Data,
          accessToken,
        }),
      });
      const data = await res.json();
      if (data.success && data.driveFileId) {
        driveFileId = data.driveFileId;
      }
    }
  } catch (driveErr) {
    console.warn('Google Drive backup skipped or failed:', driveErr);
  }

  if (onProgress) onProgress(100);

  return {
    storagePath,
    downloadURL,
    driveFileId,
    mimeType: targetMimeType,
    filename: targetFilename,
    status: 'ready'
  };
}

/**
 * Image-loading recovery logic
 */
export async function resolveAndRepairImage(
  imgObj: { downloadURL?: string; url?: string; storagePath?: string; driveFileId?: string },
  userId: string
): Promise<string | null> {
  const currentUrl = imgObj.downloadURL || imgObj.url;
  const storagePath = imgObj.storagePath;
  const driveFileId = imgObj.driveFileId;

  // 1. Check if current URL is usable (not blob: or data:)
  if (currentUrl && !currentUrl.startsWith('blob:') && !currentUrl.startsWith('data:') && !currentUrl.startsWith('idb://')) {
    try {
      // Test if image URL is alive
      const res = await fetch(currentUrl, { method: 'HEAD' });
      if (res.ok) return currentUrl;
    } catch (_) {
      // Fall through to storagePath recovery
    }
  }

  // 2. Try recovering using Firebase storagePath
  if (storagePath && !storagePath.startsWith('idb://') && !storagePath.startsWith('photo_')) {
    try {
      const freshUrl = await getDownloadURL(ref(storage, storagePath));
      if (freshUrl) return freshUrl;
    } catch (err) {
      console.warn(`Firebase Storage path broken for ${storagePath}, checking Drive backup...`, err);
    }
  }

  // 3. Try restoring from Google Drive backup if Firebase file was deleted
  if (driveFileId) {
    try {
      const accessToken = getAccessToken();
      if (accessToken) {
        const res = await fetch('/api/drive/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driveFileId, accessToken }),
        });
        const data = await res.json();
        if (data.success && data.base64Data) {
          // Re-upload to Firebase Storage
          const mimeType = data.mimeType || 'image/jpeg';
          const { blob } = dataURLtoBlob(`data:${mimeType};base64,${data.base64Data}`);
          const newPath = storagePath || `users/${userId}/photos/restored/${Date.now()}-${uuidv4().substring(0,6)}.jpg`;
          const storageRef = ref(storage, newPath);
          await uploadBytes(storageRef, blob, { contentType: mimeType });
          const restoredUrl = await getDownloadURL(storageRef);
          return restoredUrl;
        }
      }
    } catch (driveRestoreErr) {
      console.error('Failed to restore photo from Drive:', driveRestoreErr);
    }
  }

  return null;
}

/**
 * Migration helper to scan all Firestore photo fields, repair broken links, upload base64 images, and report results.
 */
export async function runPhotoMigration(userId: string): Promise<MigrationReport> {
  const report: MigrationReport = {
    totalScanned: 0,
    recovered: 0,
    unrecoverable: 0,
    details: [],
  };

  if (!userId) {
    report.details.push('No active user logged in for migration.');
    return report;
  }

  const collectionsToScan = ['prints', 'miniFurniture', 'boards', 'photos', 'printing', 'keychains'];

  for (const colName of collectionsToScan) {
    try {
      const colRef = collection(db, `users/${userId}/${colName}`);
      const snap = await getDocs(colRef);

      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        let modified = false;

        // Check array of images or single image fields
        if (Array.isArray(data.images)) {
          const updatedImages = [];
          for (let img of data.images) {
            report.totalScanned++;
            const url = typeof img === 'string' ? img : img.url || img.downloadURL;
            const storagePath = typeof img === 'object' ? img.storagePath : null;

            if (url && url.startsWith('data:')) {
              try {
                const uploaded = await uploadImageToService({
                  dataUrl: url,
                  userId,
                  section: colName,
                  recordId: docSnap.id,
                });
                updatedImages.push({
                  id: typeof img === 'object' ? img.id : uuidv4(),
                  url: uploaded.downloadURL,
                  downloadURL: uploaded.downloadURL,
                  storagePath: uploaded.storagePath,
                  driveFileId: uploaded.driveFileId,
                  mimeType: uploaded.mimeType,
                  filename: uploaded.filename,
                  status: 'ready'
                });
                report.recovered++;
                report.details.push(`[${colName}/${docSnap.id}] Base64 image migrated to Firebase Storage & Drive.`);
                modified = true;
              } catch (e) {
                report.unrecoverable++;
                report.details.push(`[${colName}/${docSnap.id}] Base64 image failed upload.`);
                updatedImages.push(img);
              }
            } else if (url && url.startsWith('blob:')) {
              report.unrecoverable++;
              report.details.push(`[${colName}/${docSnap.id}] Temporary blob URL from previous session was lost.`);
              if (typeof img === 'object') {
                updatedImages.push({ ...img, status: 'unrecoverable' });
              } else {
                updatedImages.push({ url: '', status: 'unrecoverable' });
              }
              modified = true;
            } else if (storagePath) {
              try {
                const freshUrl = await getDownloadURL(ref(storage, storagePath));
                updatedImages.push({
                  ...(typeof img === 'object' ? img : {}),
                  url: freshUrl,
                  downloadURL: freshUrl,
                  storagePath,
                  status: 'ready'
                });
                report.recovered++;
                report.details.push(`[${colName}/${docSnap.id}] Firebase storage URL verified/renewed.`);
                modified = true;
              } catch (err) {
                updatedImages.push(img);
              }
            } else {
              updatedImages.push(img);
            }
          }
          if (modified) {
            await updateDoc(doc(db, `users/${userId}/${colName}`, docSnap.id), { images: updatedImages });
          }
        }
      }
    } catch (colErr) {
      console.warn(`Migration scan for ${colName} skipped or failed:`, colErr);
    }
  }

  // Scan Character Wiki
  try {
    const wikiRef = doc(db, `users/${userId}/preferences`, 'characterWiki');
    const wikiSnap = await getDoc(wikiRef);
    if (wikiSnap.exists()) {
      const wikiData = wikiSnap.data();
      if (Array.isArray(wikiData.characters)) {
        let wikiModified = false;
        const newChars = [...wikiData.characters];

        for (let char of newChars) {
          if (char.photoUrl && char.photoUrl.startsWith('data:')) {
            report.totalScanned++;
            try {
              const uploaded = await uploadImageToService({
                dataUrl: char.photoUrl,
                userId,
                section: 'wiki',
                recordId: char.id || uuidv4(),
              });
              char.photoUrl = uploaded.downloadURL;
              char.storagePath = uploaded.storagePath;
              char.driveFileId = uploaded.driveFileId;
              report.recovered++;
              report.details.push(`[Wiki/${char.name || char.id}] Character photo migrated to Firebase Storage & Drive.`);
              wikiModified = true;
            } catch (e) {
              report.unrecoverable++;
            }
          } else if (char.photoUrl && char.photoUrl.startsWith('blob:')) {
            report.totalScanned++;
            report.unrecoverable++;
            report.details.push(`[Wiki/${char.name || char.id}] Temporary blob URL lost.`);
            char.photoUrl = '';
            wikiModified = true;
          }
        }

        if (wikiModified) {
          await setDoc(wikiRef, { characters: newChars }, { merge: true });
        }
      }
    }
  } catch (wikiErr) {
    console.warn('Wiki migration scan skipped:', wikiErr);
  }

  return report;
}
