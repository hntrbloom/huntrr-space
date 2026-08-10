const fs = require('fs');
let code = fs.readFileSync('src/lib/firebase.ts', 'utf8');

if (!code.includes('export const legacyDb')) {
  code = code.replace(/export const auth = getAuth\(app\);/, `export const legacyDb = getFirestore(app);
export const auth = getAuth(app);`);
  fs.writeFileSync('src/lib/firebase.ts', code);
  console.log('patched legacyDb');
} else {
  console.log('already patched');
}
