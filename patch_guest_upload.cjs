const fs = require('fs');
let code = fs.readFileSync('src/components/InspirationView.tsx', 'utf8');

code = code.replace(/const fileId = await uploadToDrive\(file, boardName\);[\s\S]*?res\.path = fileId;/, `if (!user || user.isAnonymous) {
              // Guest mode fallback to IndexedDB
              const fallbackRes = await uploadFileToStorage('guest', \`guest/photos/\${Date.now()}_\${file.name}\`, file);
              res = fallbackRes;
            } else {
              const fileId = await uploadToDrive(file, boardName);
              res.url = \`drive://\${fileId}\`;
              res.path = fileId;
            }`);

fs.writeFileSync('src/components/InspirationView.tsx', code);
console.log('patched');
