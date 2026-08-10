const fs = require('fs');
let code = fs.readFileSync('src/lib/firebase.ts', 'utf8');

code = code.replace(/realDb = initializeFirestore\(app, \{[\s\S]*?\}, \(config as any\)\.firestoreDatabaseId\);/, `realDb = initializeFirestore(app, {
    localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})
  });`);
code = code.replace(/realDb = getFirestore\(app, \(config as any\)\.firestoreDatabaseId\);/, `realDb = getFirestore(app);`);

fs.writeFileSync('src/lib/firebase.ts', code);
console.log('patched revert');
