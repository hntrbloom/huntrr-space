const fs = require('fs');
let code = fs.readFileSync('src/components/InspirationView.tsx', 'utf8');

code = code.replace(/const res = await withTimeout\([\s\S]*?`Upload timed out after 15s for \$\{file.name\}`\s*\);/, `
          const boardName = targetBoards.find(b => b.id === targetBoardId)?.title || 'My Inspiration Board';
          
          let res = { url: '', path: '' };
          try {
            // Upload to Google Drive
            const fileId = await uploadToDrive(file, boardName);
            res.url = \`drive://\${fileId}\`;
            res.path = fileId;
          } catch (driveErr) {
            console.error('Google Drive upload failed:', driveErr);
            throw driveErr;
          }
`);

fs.writeFileSync('src/components/InspirationView.tsx', code);
console.log('patched');
