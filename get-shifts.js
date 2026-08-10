import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const q = collection(db, `users/iK52kZ46MSRJ8UfN7zN54ZzRj1N2/workShifts`); // let's try reading the user's data? Wait, we don't know the exact uid unless we get it.
}
