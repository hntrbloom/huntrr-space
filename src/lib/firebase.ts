import { initializeApp, getApp, getApps } from 'firebase/app';
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache, disableNetwork, DocumentReference, Query, getDoc as fGetDoc, getDocFromCache as fGetDocFromCache, getDocs as fGetDocs, getDocsFromCache as fGetDocsFromCache } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import config from '../../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: config.apiKey,
  authDomain: config.authDomain,
  projectId: config.projectId,
  storageBucket: config.storageBucket,
  messagingSenderId: config.messagingSenderId,
  appId: config.appId,
  measurementId: (config as any).measurementId,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Real db
let realDb;
const dbId = (config as any).firestoreDatabaseId;
try {
  realDb = initializeFirestore(app, {
    localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
  }, dbId);
} catch (e) {
  realDb = getFirestore(app, dbId);
}

// Guest db
const guestApp = getApps().find(a => a.name === "guest") ? getApp("guest") : initializeApp(firebaseConfig, "guest");
let guestDb;
try {
  guestDb = initializeFirestore(guestApp, {
    localCache: memoryLocalCache()
  }, dbId);
  disableNetwork(guestDb).catch(console.error);
} catch (e) {
  guestDb = getFirestore(guestApp, dbId);
}

export const auth = getAuth(app);

// Proxy db to switch based on auth state
export const db = new Proxy(realDb, {
  get(target, prop) {
    const isGuest = auth.currentUser?.isAnonymous;
    const activeDb = isGuest ? guestDb : realDb;
    const value = (activeDb as any)[prop];
    if (typeof value === 'function') {
      return value.bind(activeDb);
    }
    return value;
  }
});

export const storage = getStorage(app);

export async function safeGetDoc(ref: DocumentReference) {
  if (auth.currentUser?.isAnonymous) {
    try {
      return await fGetDocFromCache(ref);
    } catch (e) {
      return { exists: () => false, data: () => undefined, id: ref.id, ref } as any;
    }
  }
  
  try {
    return await fGetDoc(ref);
  } catch (e: any) {
    if (e.code === 'unavailable' || e.message?.includes('offline')) {
      return await fGetDocFromCache(ref);
    }
    throw e;
  }
}

export async function safeGetDocs(query: Query) {
  if (auth.currentUser?.isAnonymous) {
    try {
      return await fGetDocsFromCache(query);
    } catch (e) {
      return { empty: true, docs: [], size: 0, forEach: () => {} } as any;
    }
  }
  
  try {
    return await fGetDocs(query);
  } catch (e: any) {
    if (e.code === 'unavailable' || e.message?.includes('offline')) {
      return await fGetDocsFromCache(query);
    }
    throw e;
  }
}
