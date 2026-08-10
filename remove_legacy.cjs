const fs = require('fs');
let code = fs.readFileSync('src/lib/firebase.ts', 'utf8');
code = code.replace(/export const legacyDb = getFirestore\(app\);\n/, '');
fs.writeFileSync('src/lib/firebase.ts', code);
console.log('removed legacyDb');
