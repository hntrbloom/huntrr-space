import { db } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export const logActivity = async (
  userId: string, 
  type: string, 
  details: any
) => {
  if (!userId) return;
  try {
    await addDoc(collection(db, `users/${userId}/activity`), {
      type,
      ...details,
      timestamp: serverTimestamp(),
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
};
