const fs = require('fs');
let code = fs.readFileSync('src/components/InspirationView.tsx', 'utf8');

code = code.replace(/deleteFileFromStorage\(photo.storagePath\)\.catch\(console.error\);/g, `if (photo.url?.startsWith('drive://')) {
                deleteFromDrive(photo.storagePath).catch(console.error);
              } else {
                deleteFileFromStorage(photo.storagePath).catch(console.error);
              }`);

fs.writeFileSync('src/components/InspirationView.tsx', code);
console.log('patched');
