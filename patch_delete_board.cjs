const fs = require('fs');
let code = fs.readFileSync('src/components/InspirationView.tsx', 'utf8');

code = code.replace(/deleteFileFromStorage\(p\.storagePath\)\.catch\(console\.error\);/, `if (p.url?.startsWith('drive://')) {
              deleteFromDrive(p.storagePath).catch(console.error);
            } else {
              deleteFileFromStorage(p.storagePath).catch(console.error);
            }`);

fs.writeFileSync('src/components/InspirationView.tsx', code);
console.log('patched');
