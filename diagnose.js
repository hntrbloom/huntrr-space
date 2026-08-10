import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import config from './firebase-applet-config.json' assert { type: 'json' };

const app = initializeApp(config);
const db = getFirestore(app);
const auth = getAuth(app);

async function diagnose() {
  console.log("Firebase config:", config.projectId);
  try {
    const cred = await signInAnonymously(auth);
    console.log("Logged in as guest:", cred.user.uid);
  } catch (e) {
    console.log("Could not sign in anonymously:", e);
  }
}
diagnose();
