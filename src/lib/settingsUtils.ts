import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getAccessToken } from './AuthContext';
import { checkAndCreateFolders } from './driveFolderUtils';

export interface UserSettings {
  driveFolders?: {
    mainFolderId?: string;
    printsFolderId?: string;
    referencesFolderId?: string;
    mockupsFolderId?: string;
    extrasFolderId?: string;
    boardsFolderId?: string;
  };
}

export async function getUserSettings(uid: string): Promise<UserSettings | null> {
  const docRef = doc(db, 'users', uid, 'settings', 'general');
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    return snap.data() as UserSettings;
  }
  return null;
}

export async function updateUserSettings(uid: string, settings: Partial<UserSettings>): Promise<void> {
  const docRef = doc(db, 'users', uid, 'settings', 'general');
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    await updateDoc(docRef, settings);
  } else {
    await setDoc(docRef, settings);
  }
}

export async function initializeDriveFolders(uid: string, forceRepair = false): Promise<UserSettings['driveFolders']> {
  const currentSettings = await getUserSettings(uid);
  
  if (!forceRepair && currentSettings?.driveFolders?.mainFolderId && currentSettings?.driveFolders?.boardsFolderId) {
    return currentSettings.driveFolders;
  }

  const newFolders = await checkAndCreateFolders();
  
  // Merge if exists
  const updatedFolders = {
    ...currentSettings?.driveFolders,
    ...newFolders
  };

  await updateUserSettings(uid, { driveFolders: updatedFolders });
  return updatedFolders;
}
