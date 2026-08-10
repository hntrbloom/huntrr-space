import { db } from './firebase';
import { collection, getDocs } from 'firebase/firestore';

export async function gatherAllData(userId: string) {
  const collections = [
    'preferences',
    'dailyLogs',
    'boards',
    'photos',
    'notes',
    'goals',
    'keychains',
    'minifurniture',
    'reminders',
    'blog',
    'jobs'
  ];
  const data: Record<string, any> = {};
  
  for (const colName of collections) {
    data[colName] = {};
    try {
      const snap = await getDocs(collection(db, `users/${userId}/${colName}`));
      snap.forEach(doc => {
        data[colName][doc.id] = doc.data();
      });
    } catch (e) {
      console.error(`Failed to fetch collection ${colName}`, e);
    }
  }
  return data;
}

export async function restoreData(userId: string, data: Record<string, any>) {
  // To restore, we would write back to firestore.
  // We should do this carefully.
}
