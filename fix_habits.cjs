const fs = require('fs');
let content = fs.readFileSync('src/components/HabitsView.tsx', 'utf8');

const target = `      try {
        const docRef = doc(db, \`users/\${user.uid}/preferences\`, 'habitsData');
        const snap = await safeGetDoc(docRef);
        
        const focusDocRef = doc(db, \`users/\${user.uid}/preferences\`, 'focusData');
        const focusSnap = await safeGetDoc(focusDocRef);
        if (focusSnap.exists()) {
          setFocusSessions(focusSnap.data().sessions || []);
        }

        if (snap.exists()) {
          const data = snap.data();
          let loadedHabits = data.habits || [];
          let loadedCategories = data.categories || [];`;

const replacement = `      try {
        const docRef = doc(db, \`users/\${user.uid}/preferences\`, 'habitsData');
        const snap = await safeGetDoc(docRef);
        
        const focusDocRef = doc(db, \`users/\${user.uid}/preferences\`, 'focusData');
        const focusSnap = await safeGetDoc(focusDocRef);
        if (focusSnap.exists()) {
          setFocusSessions(focusSnap.data().sessions || []);
        }

        let loadedHabits = [];
        let loadedCategories = [];
        let hasData = false;

        if (snap.exists() && snap.data().habits) {
          loadedHabits = snap.data().habits || [];
          loadedCategories = snap.data().categories || [];
          hasData = true;
        }
        
        if (!hasData || loadedHabits.length === 0) {
           try {
             const rootRef = doc(db, 'users', user.uid);
             const rootSnap = await safeGetDoc(rootRef);
             if (rootSnap.exists() && rootSnap.data().habits) {
               loadedHabits = rootSnap.data().habits;
               loadedCategories = rootSnap.data().habitCategories || rootSnap.data().categories || [];
               hasData = true;
             }
           } catch(e) {}
        }

        if (hasData) {`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync('src/components/HabitsView.tsx', content);
  console.log("Fixed HabitsView.tsx");
} else {
  console.log("Target not found in HabitsView.tsx");
}
