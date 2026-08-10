import { openDB } from 'idb';

const DB_NAME = 'SereneStationeryIDB';
const DB_VERSION = 2;

export const initDB = async () => {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('keychains_files')) {
        db.createObjectStore('keychains_files');
      }
      if (!db.objectStoreNames.contains('inspiration_photos')) {
        db.createObjectStore('inspiration_photos');
      }
    },
  });
};

export const saveFileToIDB = async (key: string, file: Blob) => {
  const db = await initDB();
  await db.put('keychains_files', file, key);
};

export const getFileFromIDB = async (key: string): Promise<Blob | undefined> => {
  const db = await initDB();
  return db.get('keychains_files', key);
};

export const deleteFileFromIDB = async (key: string) => {
  const db = await initDB();
  await db.delete('keychains_files', key);
};

export const savePhotoToIDB = async (key: string, file: Blob) => {
  const db = await initDB();
  await db.put('inspiration_photos', file, key);
};

export const getPhotoFromIDB = async (key: string): Promise<Blob | undefined> => {
  const db = await initDB();
  return db.get('inspiration_photos', key);
};

export const deletePhotoFromIDB = async (key: string) => {
  const db = await initDB();
  await db.delete('inspiration_photos', key);
};
