const fs = require('fs');
let code = fs.readFileSync('src/lib/AuthContext.tsx', 'utf8');

code = code.replace(/interface AuthContextType \{/, `let cachedAccessToken: string | null = null;

export const getAccessToken = () => cachedAccessToken;

interface AuthContextType {`);

code = code.replace(/const provider = new GoogleAuthProvider\(\);/, `const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/drive.file');`);

code = code.replace(/await signInWithPopup\(auth, provider\);/, `const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        cachedAccessToken = credential.accessToken;
      }`);

code = code.replace(/await signOut\(auth\);/, `await signOut(auth);
      cachedAccessToken = null;`);

fs.writeFileSync('src/lib/AuthContext.tsx', code);
console.log('patched');
