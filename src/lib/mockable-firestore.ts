import { auth } from './firebase';
import * as firestore from 'firebase/firestore';

// In-memory store
const memoryStore = new Map<string, any>();

// Helper to get path
const getPath = (ref: any) => {
  if (ref.type === 'document' || ref.type === 'collection') {
    return ref.path;
  }
  return ref._path || '';
};

// ... we will implement this if needed
