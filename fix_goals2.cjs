const fs = require('fs');
let content = fs.readFileSync('src/components/GoalsView.tsx', 'utf8');

const target = `        if (needsSave) {
          // Fire and forget to avoid loop block in snapshot, it will trigger another snapshot
          const docRef = doc(db, \`users/\${user.uid}/preferences\`, 'goalsData');
          setDoc(docRef, { goals: processedGoals }, { merge: true }).catch(console.error);
        }
      }
      setLoading(false);`;

const replacement = `        if (needsSave) {
          // Fire and forget to avoid loop block in snapshot, it will trigger another snapshot
          const docRef = doc(db, \`users/\${user.uid}/preferences\`, 'goalsData');
          setDoc(docRef, { goals: processedGoals }, { merge: true }).catch(console.error);
        }
      setLoading(false);`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync('src/components/GoalsView.tsx', content);
  console.log("Fixed GoalsView.tsx 2");
} else {
  console.log("Target not found in GoalsView.tsx");
}
