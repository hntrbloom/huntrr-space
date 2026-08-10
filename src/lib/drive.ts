import { getAccessToken } from './AuthContext';
import { blobToBase64 } from './imageService';

export async function uploadToDrive(file: File, sectionName = 'Other'): Promise<string> {
  const token = getAccessToken();
  if (!token) throw new Error("No Google Drive access token available. Please sign in again.");

  const base64Data = await blobToBase64(file);

  const res = await fetch('/api/drive/backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      section: sectionName,
      filename: file.name,
      mimeType: file.type || 'image/jpeg',
      base64Data,
      accessToken: token
    })
  });

  const data = await res.json();
  if (!data.success || !data.driveFileId) {
    throw new Error(data.warning || "Failed to upload file to Google Drive");
  }

  return data.driveFileId;
}

export async function deleteFromDrive(fileId: string): Promise<void> {
  const token = getAccessToken();
  if (!token) {
    console.warn("No token available to delete Drive file");
    return;
  }
  
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch(e) {
    console.error("Failed to delete from Drive", e);
  }
}
