const fs = require('fs');
let content = fs.readFileSync('src/components/GoalsView.tsx', 'utf8');

const target = `    const unsub = onSnapshot(doc(db, \`users/\${user.uid}/preferences\`, 'goalsData'), (docSnap) => {
      if (docSnap.exists()) {
        const loadedGoals = docSnap.data().goals || [];`;

const replacement = `    const unsub = onSnapshot(doc(db, \`users/\${user.uid}/preferences\`, 'goalsData'), async (docSnap) => {
      let loadedGoals = docSnap.exists() ? (docSnap.data().goals || []) : [];
      
      // Fallback: Check root document
      if (loadedGoals.length === 0) {
        try {
          const { getDoc } = await import('firebase/firestore');
          const rootSnap = await getDoc(doc(db, 'users', user.uid));
          if (rootSnap.exists() && rootSnap.data().goals) {
             loadedGoals = rootSnap.data().goals;
             console.log("Recovered goals from root doc");
          }
        } catch(e) {}
      }`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync('src/components/GoalsView.tsx', content);
  console.log("Fixed GoalsView.tsx");
} else {
  console.log("Target not found in GoalsView.tsx");
}
