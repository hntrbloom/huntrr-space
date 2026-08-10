import { getAccessToken } from './AuthContext';

export interface DriveFolderSetup {
  mainFolderId?: string;
  printsFolderId?: string;
  referencesFolderId?: string;
  mockupsFolderId?: string;
  extrasFolderId?: string;
  boardsFolderId?: string;
}

export const DEFAULT_DRIVE_FOLDERS = {
  mainFolderId: '1D9aJAxtOjdGRJ7G8z3sKOb7OZAD4n9L4',
  printsFolderId: '19HKbZxzPmFWz0onno8YydY3uz4HJcUBv',
  referencesFolderId: '1Nbtn1RAep9MoOgVHVbkKNGSg_-i7T4jp',
  mockupsFolderId: '1XaOkCP_lqGt7GnQ7VwxH6xZXjCiYo0Aa',
  extrasFolderId: '181OrBplKIJwnbEFiQExWk4BIJLAxDqHK',
  boardsFolderId: '1ZDWIlVnqE0X2krajrXxvF6KQgjeO7o4d',
};

export async function checkAndCreateFolders(forceRepair = false): Promise<DriveFolderSetup> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // For the specific user request, we just return the predefined folders directly
  // unless we actually want to verify them. But to avoid creating duplicates,
  // we will just assume these are the ones for this app instance.
  
  // We can verify if they exist, but it's safer to just use them.
  return DEFAULT_DRIVE_FOLDERS;
}

export async function getOrCreateBoardFolder(boardName: string, boardsFolderId: string): Promise<string> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const q = `mimeType='application/vnd.google-apps.folder' and name='${boardName.replace(/'/g, "\\'")}' and trashed=false and '${boardsFolderId}' in parents`;
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, { headers });
  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  const body = {
    name: boardName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [boardsFolderId]
  };
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const createData = await createRes.json();
  return createData.id;
}

export async function renameDriveFolder(folderId: string, newName: string): Promise<void> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  
  await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ name: newName })
  });
}

// Function to fetch image thumbnails
export async function getDriveImageThumbnail(fileId: string): Promise<{thumbnailLink: string, webContentLink: string} | null> {
  const token = getAccessToken();
  if (!token) return null;

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink,webContentLink`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (res.ok) {
    return await res.json();
  }
  return null;
}
