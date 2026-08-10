import { getAccessToken, setAccessToken } from './AuthContext';
import { requestFreshDriveToken } from './driveAuth';

// In-memory cache for session Object URLs (keyed by Drive fileId or storage path)
const memoryBlobCache = new Map<string, string>();

// Concurrency queue for active Drive image fetches (max 3 at a time)
const MAX_CONCURRENT_DOWNLOADS = 3;
let activeDownloads = 0;
const downloadQueue: Array<() => void> = [];

function enqueueDownload<T>(task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const runTask = async () => {
      activeDownloads++;
      try {
        const result = await task();
        resolve(result);
      } catch (err) {
        reject(err);
      } finally {
        activeDownloads--;
        if (downloadQueue.length > 0) {
          const next = downloadQueue.shift();
          if (next) next();
        }
      }
    };

    if (activeDownloads < MAX_CONCURRENT_DOWNLOADS) {
      runTask();
    } else {
      downloadQueue.push(runTask);
    }
  });
}

export function getCachedBlobUrl(key: string): string | undefined {
  if (!key) return undefined;
  return memoryBlobCache.get(key);
}

export function setCachedBlobUrl(key: string, blobUrl: string) {
  if (key && blobUrl) {
    memoryBlobCache.set(key, blobUrl);
  }
}

/**
 * Downloads a Google Drive file for local user saving
 */
export async function downloadDriveFile(fileId: string, filename: string): Promise<void> {
  const token = getAccessToken();
  if (!token) throw new Error('NO_DRIVE_TOKEN');
  
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Failed to fetch Drive file for download (HTTP ${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'photo.webp';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Fetches Google Drive media via authorized API request with concurrency control and in-memory caching.
 */
export async function fetchDriveFileWithAuth(fileId: string): Promise<string> {
  if (!fileId) throw new Error('Missing fileId');
  
  // Return cached Object URL immediately if already fetched in this session
  const cached = memoryBlobCache.get(fileId);
  if (cached) return cached;

  return enqueueDownload(async () => {
    let token = getAccessToken();

    const endpoint = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    const doFetch = async (authToken: string | null) => {
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      return fetch(endpoint, { headers });
    };

    let res = await doFetch(token);

    // If 401 Unauthorized, clear expired token and obtain fresh token silently, then retry once
    if (res.status === 401) {
      console.warn(`[DriveAPI] HTTP 401 Unauthorized for File ID: ${fileId}. Clearing expired token and requesting fresh token silently...`);
      token = await requestFreshDriveToken(false);
      if (token) {
        console.log(`[DriveAPI] Fresh access token obtained silently. Retrying Drive request for ${fileId}...`);
        res = await doFetch(token);
      }
    }

    if (!res.ok) {
      const status = res.status;
      let userMsg = `Drive fetch failed (HTTP ${status})`;
      if (status === 401) {
        userMsg = `HTTP 401: Google Drive access token expired or invalid.`;
      } else if (status === 403) {
        userMsg = `HTTP 403: Google Drive permission denied. Please re-authorize Google Drive.`;
      } else if (status === 404) {
        userMsg = `HTTP 404: Photo file no longer exists on Google Drive.`;
      }

      console.error(`[DriveAPI Error] Status: ${status}, Endpoint: ${endpoint}, File ID: ${fileId}, Error: ${userMsg}`);
      throw new Error(userMsg);
    }

    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    memoryBlobCache.set(fileId, objectUrl);
    return objectUrl;
  });
}
