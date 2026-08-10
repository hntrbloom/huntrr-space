const fs = require('fs');
let content = fs.readFileSync('src/components/NotesView.tsx', 'utf8');

const target = `        const docRef = doc(db, \`users/\${user.uid}/preferences\`, 'notesData');
        const docSnap = await safeGetDoc(docRef);
        if (docSnap.exists()) {
          const loadedNotes = docSnap.data().notes || [];`;

const replacement = `        const docRef = doc(db, \`users/\${user.uid}/preferences\`, 'notesData');
        const docSnap = await safeGetDoc(docRef);
        let loadedNotes = docSnap.exists() ? (docSnap.data().notes || []) : [];
        if (loadedNotes.length === 0) {
          try {
            const rootRef = doc(db, 'users', user.uid);
            const rootSnap = await safeGetDoc(rootRef);
            if (rootSnap.exists() && rootSnap.data().notes) {
              loadedNotes = rootSnap.data().notes;
            }
          } catch(e) {}
        }
        if (loadedNotes.length > 0 || docSnap.exists()) {`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync('src/components/NotesView.tsx', content);
  console.log("Fixed NotesView.tsx");
} else {
  console.log("Target not found in NotesView.tsx");
}
