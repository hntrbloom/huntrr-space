const fs = require('fs');
let content = fs.readFileSync('src/components/MiniFurnitureView.tsx', 'utf8');

const targetRegex = /    \}\);\n\s*return \(\) => unsub\(\);\n  \}, \[user\]\);/;

const replacement = `    });
    });
        
    return () => unsubPrints();
  }, [user]);`;

if (content.match(targetRegex)) {
  content = content.replace(targetRegex, replacement);
  fs.writeFileSync('src/components/MiniFurnitureView.tsx', content);
  console.log("Fixed MiniFurnitureView.tsx 2");
} else {
  console.log("Target not found in MiniFurnitureView.tsx");
}
