const fs = require('fs');
let code = fs.readFileSync('src/components/InspirationView.tsx', 'utf8');

code = code.replace(/import \{ getPhotoFromIDB \} from '\.\.\/lib\/idb';/, `import { getPhotoFromIDB } from '../lib/idb';
import { uploadToDrive, deleteFromDrive } from '../lib/drive';
import { getAccessToken } from '../lib/AuthContext';`);

code = code.replace(/const resolveIdbUrls = async \(\) => \{/, `const resolveDriveUrls = async () => {
      const drivePhotos = photos.filter(p => p.url && p.url.startsWith('drive://') && !resolvedUrls[p.url]);
      if (drivePhotos.length === 0) return;

      const newResolved: Record<string, string> = {};
      const token = getAccessToken();
      
      for (const photo of drivePhotos) {
        const fileId = photo.url.replace('drive://', '');
        try {
          if (!token) throw new Error("No token");
          const res = await fetch(\`https://www.googleapis.com/drive/v3/files/\${fileId}?alt=media\`, {
            headers: { Authorization: \`Bearer \${token}\` }
          });
          if (!res.ok) throw new Error("Failed to load drive image");
          const blob = await res.blob();
          newResolved[photo.url] = URL.createObjectURL(blob);
        } catch (err) {
          console.error(\`Failed to resolve Drive image \${fileId}:\`, err);
          newResolved[photo.url] = 'error';
        }
      }
      if (isMounted && Object.keys(newResolved).length > 0) {
        setResolvedUrls(prev => ({ ...prev, ...newResolved }));
      }
    };
    resolveDriveUrls();

    const resolveIdbUrls = async () => {`);

code = code.replace(/if \(url\.startsWith\('idb:\/\/'\)\) \{/, `if (url.startsWith('idb://') || url.startsWith('drive://')) {`);

fs.writeFileSync('src/components/InspirationView.tsx', code);
console.log('patched');
