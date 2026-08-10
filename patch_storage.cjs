const fs = require('fs');
let code = fs.readFileSync('src/lib/storage.ts', 'utf8');

code = code.replace(/import \{ ref, uploadBytes, getDownloadURL, deleteObject \} from 'firebase\/storage';/, `import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { getAccessToken } from './AuthContext';`);

fs.writeFileSync('src/lib/storage.ts', code);
console.log('patched');
