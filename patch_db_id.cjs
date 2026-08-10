const fs = require('fs');
let code = fs.readFileSync('src/lib/firebase.ts', 'utf8');

code = code.replace(/realDb = initializeFirestore\(app, \{\s*localCache: persistentLocalCache\(\{tabManager: persistentMultipleTabManager\(\)\}\)\s*\}\);/, `realDb = initializeFirestore(app, {
    localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
  }, (config as any).firestoreDatabaseId);`);

code = code.replace(/realDb = getFirestore\(app\);/, `realDb = getFirestore(app, (config as any).firestoreDatabaseId);`);

fs.writeFileSync('src/lib/firebase.ts', code);
console.log('patched db id');
