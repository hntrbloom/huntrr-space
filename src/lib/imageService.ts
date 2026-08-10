import { storage, db } from './firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, doc, getDocs, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getAccessToken } from './AuthContext';
import { requestFreshDriveToken } from './driveAuth';
import { v4 as uuidv4 } from 'uuid';

/**
 * Direct client-side Google Drive multipart upload using official REST API endpoint:
 * POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size
 */
export async function uploadToGoogleDriveDirect(
  blob: Blob,
  filename: string,
  mimeType: string,
  accessToken?: string | null
): Promise<{ id: string }> {
  const metadata = {
    name: filename,
    mimeType: mimeType
  };

  const boundary = '-------314159265358979323846' + Math.random().toString(36).substring(2, 8);
  const delimiter = "\r\n--" + boundary + "\r\n";
  const close_delim = "\r\n--" + boundary + "--";

  const metadataPart = delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: ' + mimeType + '\r\n\r\n';

  const metadataBlob = new Blob([metadataPart], { type: 'text/plain' });
  const closeBlob = new Blob([close_delim], { type: 'text/plain' });

  const multipartBlob = new Blob([metadataBlob, blob, closeBlob], {
    type: `multipart/related; boundary=${boundary}`
  });

  const performUpload = async (token: string) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000); // 35s timeout
    try {
      return await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartBlob,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  let activeToken = accessToken || getAccessToken();
  if (!activeToken) activeToken = await requestFreshDriveToken(false);
  if (!activeToken) {
    throw new Error('Google Drive is not connected. Tap Reconnect Google Drive, then retry the photo.');
  }

  let res: Response;
  try {
    res = await performUpload(activeToken);
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error('Google Drive upload timed out. Check your connection and retry.');
    }
    throw error;
  }

  // Requirement: On HTTP 401, clear expired token, obtain genuinely new token, and retry ONCE
  if (res.status === 401) {
    console.warn('[DriveDirectUpload] HTTP 401 Unauthorized. Requesting fresh Drive token...');
    const freshToken = await requestFreshDriveToken(false);
    if (freshToken) {
      console.log('[DriveDirectUpload] Fresh token obtained. Retrying Drive upload...');
      activeToken = freshToken;
      res = await performUpload(activeToken);
    } else {
      throw new Error('HTTP 401: Google Drive authorization expired—reconnect Drive.');
    }
  }

  if (res.status === 403) {
    const errJson = await res.json().catch(() => ({}));
    const reason = errJson?.error?.message || errJson?.error?.errors?.[0]?.reason || 'Permission denied or API disabled';
    console.error('[DriveDirectUpload] HTTP 403:', reason);
    throw new Error(`Drive rejected upload: HTTP 403 - ${reason}`);
  }

  if (res.status === 429 || res.status >= 500) {
    console.warn(`[DriveDirectUpload] HTTP ${res.status}. Retrying after 1.5s backoff...`);
    await new Promise(r => setTimeout(r, 1500));
    res = await performUpload(activeToken);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Drive upload rejected: HTTP ${res.status}. ${errText || res.statusText}`);
  }

  const data = await res.json();
  if (data && data.id) {
    return { id: data.id };
  }

  throw new Error("Drive upload response did not return a valid file ID.");
}

export interface ImageMetaData {
  storagePath: string;
  downloadURL: string;
  driveFileId: string | null;
  thumbStoragePath?: string;
  thumbDownloadURL?: string;
  thumbDriveFileId?: string | null;
  mimeType: string;
  filename: string;
  width?: number;
  height?: number;
  status: 'ready' | 'uploading' | 'error' | 'unrecoverable';
}

export interface MigrationReport {
  totalScanned: number;
  recovered: number;
  unrecoverable: number;
  details: string[];
}

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
 * Uploads optimized image and thumbnail image to Firebase Storage and Google Drive.
 */
export async function uploadImageToService({
  file,
  thumbnailFile,
  dataUrl,
  userId,
  section,
  recordId,
  filename,
  width,
  height,
  onProgress
}: {
  file?: File | Blob | null;
  thumbnailFile?: File | Blob | null;
  dataUrl?: string | null;
  userId: string;
  section: string;
  recordId: string;
  filename?: string;
  width?: number;
  height?: number;
  onProgress?: (progress: number) => void;
}): Promise<ImageMetaData> {
  if (onProgress) onProgress(10);

  let targetBlob: Blob;
  let targetMimeType = 'image/webp';
  let targetFilename = filename || (file && (file as File).name) || `photo_${Date.now()}.webp`;

  if (file) {
    targetBlob = file;
    targetMimeType = file.type || 'image/webp';
  } else if (dataUrl && dataUrl.startsWith('data:')) {
    const converted = dataURLtoBlob(dataUrl);
    targetBlob = converted.blob;
    targetMimeType = converted.mimeType;
  } else {
    throw new Error('No valid image file provided for upload');
  }

  const cleanName = targetFilename.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const ext = targetMimeType === 'image/webp' ? 'webp' : 'jpg';
  const uniqueId = uuidv4().substring(0, 8);

  const plannedStoragePath = `users/${userId}/photos/${section}/${recordId}/${uniqueId}-${cleanName}.${ext}`;
  const plannedThumbStoragePath = thumbnailFile ? `users/${userId}/photos/${section}/${recordId}/${uniqueId}-thumb-${cleanName}.${ext}` : undefined;
  const requiresDrive = Boolean(userId && userId !== 'guest');

  let driveFileId: string | null = null;
  let thumbDriveFileId: string | null = null;
  let storagePath = '';
  let downloadURL = '';
  let thumbStoragePath: string | undefined;
  let thumbDownloadURL: string | undefined;

  if (onProgress) onProgress(25);

  // Drive is the durable primary copy. Firebase Storage is only an optional
  // mirror, so a bucket/rules error cannot prevent the Drive upload.
  if (requiresDrive) {
    try {
      const driveResult = await uploadToGoogleDriveDirect(
        targetBlob,
        `${uniqueId}-${cleanName}.${ext}`,
        targetMimeType,
        getAccessToken()
      );
      driveFileId = driveResult.id;
    } catch (driveErr: any) {
      console.error('Google Drive direct upload error:', driveErr?.message || driveErr);
      throw new Error(driveErr?.message || 'Google Drive upload failed.');
    }

    if (!driveFileId) throw new Error('Google Drive upload did not return a file ID.');
    if (onProgress) onProgress(55);

    if (thumbnailFile) {
      try {
        const thumbDriveResult = await uploadToGoogleDriveDirect(
          thumbnailFile,
          `${uniqueId}-thumb-${cleanName}.${ext}`,
          thumbnailFile.type || targetMimeType,
          getAccessToken()
        );
        thumbDriveFileId = thumbDriveResult.id;
      } catch (thumbErr) {
        console.warn('Thumbnail Drive upload skipped; main image is saved:', thumbErr);
      }
    }
  }

  if (onProgress) onProgress(70);

  // Prints render from their Drive IDs and must not wait for a broken Firebase
  // bucket. Other sections retain the existing Firebase mirror for compatibility.
  if (section !== 'prints') try {
    const storageRef = ref(storage, plannedStoragePath);
    const snapshot = await withTimeout(
      uploadBytes(storageRef, targetBlob, { contentType: targetMimeType }),
      20000,
      `Firebase storage upload timed out for ${cleanName}`
    );
    downloadURL = await withTimeout(
      getDownloadURL(snapshot.ref),
      10000,
      `Failed to retrieve download URL for ${cleanName}`
    );
    storagePath = plannedStoragePath;

    if (thumbnailFile && plannedThumbStoragePath) {
      try {
        const thumbRef = ref(storage, plannedThumbStoragePath);
        const thumbSnapshot = await withTimeout(
          uploadBytes(thumbRef, thumbnailFile, { contentType: thumbnailFile.type || targetMimeType }),
          15000,
          'Thumbnail storage upload timed out'
        );
        thumbDownloadURL = await getDownloadURL(thumbSnapshot.ref);
        thumbStoragePath = plannedThumbStoragePath;
      } catch (thumbErr) {
        console.warn('Thumbnail Firebase mirror skipped:', thumbErr);
      }
    }
  } catch (storageErr) {
    console.warn('Firebase Storage mirror skipped; Drive copy remains available:', storageErr);
    if (!driveFileId) throw storageErr;
  }

  if (onProgress) onProgress(100);

  return {
    storagePath,
    downloadURL,
    driveFileId,
    thumbStoragePath,
    thumbDownloadURL,
    thumbDriveFileId,
    mimeType: targetMimeType,
    filename: targetFilename,
    width,
    height,
    status: 'ready'
  };
}

export async function resolveAndRepairImage(
  imgObj: { downloadURL?: string; url?: string; storagePath?: string; driveFileId?: string },
  userId: string
): Promise<string | null> {
  const currentUrl = imgObj.downloadURL || imgObj.url;
  const storagePath = imgObj.storagePath;
  const driveFileId = imgObj.driveFileId;

  if (currentUrl && !currentUrl.startsWith('blob:') && !currentUrl.startsWith('data:') && !currentUrl.startsWith('file:') && !currentUrl.startsWith('idb://')) {
    try {
      const res = await fetch(currentUrl, { method: 'HEAD' });
      if (res.ok) return currentUrl;
    } catch (_) {}
  }

  if (storagePath && !storagePath.startsWith('idb://') && !storagePath.startsWith('photo_')) {
    try {
      const freshUrl = await getDownloadURL(ref(storage, storagePath));
      if (freshUrl) return freshUrl;
    } catch (err) {
      console.warn(`Firebase Storage path broken for ${storagePath}, checking Drive backup...`, err);
    }
  }

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
          const mimeType = data.mimeType || 'image/webp';
          const { blob } = dataURLtoBlob(`data:${mimeType};base64,${data.base64Data}`);
          const newPath = storagePath || `users/${userId}/photos/restored/${Date.now()}-${uuidv4().substring(0,6)}.webp`;
          const storageRef = ref(storage, newPath);
          await uploadBytes(storageRef, blob, { contentType: mimeType });
          return await getDownloadURL(storageRef);
        }
      }
    } catch (driveRestoreErr) {
      console.error('Failed to restore photo from Drive:', driveRestoreErr);
    }
  }

  return null;
}

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
                  thumbStoragePath: uploaded.thumbStoragePath,
                  thumbDriveFileId: uploaded.thumbDriveFileId,
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
            } else if ((url && (url.startsWith('blob:') || url.startsWith('file:'))) || storagePath) {
              let freshUrl: string | null = null;
              if (storagePath) {
                try {
                  freshUrl = await getDownloadURL(ref(storage, storagePath));
                } catch (_) {}
              }
              if (!freshUrl && typeof img === 'object' && img?.driveFileId) {
                freshUrl = await resolveAndRepairImage({ downloadURL: url, storagePath, driveFileId: img.driveFileId }, userId);
              }

              if (freshUrl) {
                updatedImages.push({
                  ...(typeof img === 'object' ? img : {}),
                  url: freshUrl,
                  downloadURL: freshUrl,
                  storagePath: storagePath || undefined,
                  status: 'ready'
                });
                report.recovered++;
                report.details.push(`[${colName}/${docSnap.id}] Photo recovered with permanent URL.`);
                modified = true;
              } else {
                report.unrecoverable++;
                report.details.push(`[${colName}/${docSnap.id}] Temporary blob/file URL lost.`);
                if (typeof img === 'object') {
                  updatedImages.push({ ...img, url: '', status: 'unrecoverable' });
                } else {
                  updatedImages.push({ url: '', status: 'unrecoverable' });
                }
                modified = true;
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

  return report;
}
