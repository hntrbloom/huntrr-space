import { getDriveToken } from '../hooks/useGoogleDrivePicker';

export async function downloadDriveFile(fileId: string, filename: string): Promise<void> {
  const token = getDriveToken();
  if (!token) throw new Error('NO_DRIVE_TOKEN');
  
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Failed to fetch Drive file for download');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function fetchDriveFile(fileId: string, type: 'thumbnail' | 'media' = 'media'): Promise<string> {
  const token = getDriveToken();
  if (!token) throw new Error('NO_DRIVE_TOKEN');

  if (type === 'thumbnail') {
    const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!metaRes.ok) throw new Error('Failed to fetch Drive metadata');
    const meta = await metaRes.json();
    if (meta.thumbnailLink) {
      // The thumbnailLink often requires auth if the file is private, or we can just fetch it with token
      const thumbRes = await fetch(meta.thumbnailLink, { headers: { Authorization: `Bearer ${token}` } });
      if (thumbRes.ok) {
        const blob = await thumbRes.blob();
        return URL.createObjectURL(blob);
      }
    }
  }

  // Fallback to full media if no thumbnail, or if media requested
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.status === 401) {
    throw new Error('DRIVE_TOKEN_EXPIRED');
  }
  if (!res.ok) throw new Error('Failed to fetch Drive file');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
