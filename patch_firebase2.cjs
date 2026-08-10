const fs = require('fs');
let code = fs.readFileSync('src/lib/firebase.ts', 'utf8');
code = code.replace(/config\.firestoreDatabaseId/g, `(config as any).firestoreDatabaseId`);
fs.writeFileSync('src/lib/firebase.ts', code);
console.log('patched');
