import { db } from './firebase';
import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';

export async function deleteAllData(userId: string) {
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

  for (const colName of collections) {
    try {
      const snap = await getDocs(collection(db, `users/${userId}/${colName}`));
      
      // Batch delete in chunks of 500
      let batch = writeBatch(db);
      let count = 0;
      for (const docSnap of snap.docs) {
        batch.delete(doc(db, `users/${userId}/${colName}`, docSnap.id));
        count++;
        if (count >= 500) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
      if (count > 0) {
        await batch.commit();
      }
    } catch (e) {
      console.error(`Failed to wipe collection ${colName}`, e);
    }
  }
}
